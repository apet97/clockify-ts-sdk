/// <reference lib="dom" />

import type {
    ReportsAppModelV1,
    ReportsAppView,
    WeeklyRow,
} from "./model-types.js";

export type ReportsMessageIntent = "dates" | "filters" | "share" | "switch";

export interface ReportsLedgerActions {
    changePage: (delta: -1 | 1) => void;
    changeWeeklyGroup: (group: "USER" | "PROJECT") => void;
    refresh: () => void;
    requestFullscreen: () => void;
    sendMessage: (intent: ReportsMessageIntent) => void;
}

interface ReportsHostContext {
    theme?: "dark" | "light";
    availableDisplayModes?: string[];
    safeAreaInsets?: { top: number; right: number; bottom: number; left: number };
}

interface TableCell {
    text: string;
    color?: string;
    heat?: number;
    numeric?: boolean;
}

interface BarDatum {
    label: string;
    value: number;
    secondary?: number;
}

const TITLES: Record<ReportsAppModelV1["kind"], string> = {
    summary: "Summary ledger",
    detailed: "Detailed time ledger",
    weekly: "Weekly timesheet strip",
    attendance: "Attendance ledger",
    expense: "Expense ledger",
};

export class ReportsLedgerView {
    readonly #document: Document;
    readonly #actions: ReportsLedgerActions;
    readonly #elements: ReturnType<typeof collectElements>;
    #model: ReportsAppModelV1 | undefined;
    #search = "";
    #metric: "amount" | "duration" = "duration";
    #busy = false;

    constructor(document: Document, actions: ReportsLedgerActions) {
        this.#document = document;
        this.#actions = actions;
        this.#elements = collectElements(document);
        this.#wireControls();
    }

    render(model: ReportsAppModelV1): void {
        this.#model = model;
        this.#search = "";
        this.#metric = "duration";
        this.#elements.search.value = "";
        this.#elements.metric.value = "duration";
        this.#elements.app.setAttribute("aria-busy", "false");
        this.#elements.title.textContent = TITLES[model.kind];
        for (const button of this.#elements.modelActions) button.hidden = false;
        this.#renderRuler();
        this.#renderTotals();
        this.#renderNotice();
        this.#renderControls();
        this.#renderSurface();
        this.#renderPaging();
    }

    setBusy(busy: boolean): void {
        this.#busy = busy;
        this.#elements.app.setAttribute("aria-busy", String(busy));
        this.#elements.refresh.disabled = busy;
        this.#renderPaging();
    }

    showTransient(message: string): void {
        this.#elements.notice.hidden = false;
        this.#elements.notice.textContent = message;
    }

    showFallback(isError: boolean, message?: string): void {
        this.#model = undefined;
        this.#busy = false;
        this.#elements.app.setAttribute("aria-busy", "false");
        this.#elements.refresh.disabled = false;
        this.#elements.title.textContent = isError
            ? "Report could not be loaded"
            : "Report data is available";
        this.#elements.ruler.replaceChildren();
        this.#elements.totals.replaceChildren();
        this.#elements.toolbar.hidden = true;
        this.#elements.paging.hidden = true;
        for (const button of this.#elements.modelActions) button.hidden = true;
        this.#elements.notice.hidden = false;
        this.#elements.notice.textContent = isError
            ? message || "See the tool error and recovery hint in the conversation."
            : "The bounded interactive model is unavailable. The structured report remains in the tool result.";
        this.#elements.surface.replaceChildren();
    }

    applyHostContext(context: ReportsHostContext | undefined): void {
        const root = this.#document.documentElement;
        root.dataset.theme = context?.theme === "dark" ? "dark" : "light";
        const safe = context?.safeAreaInsets;
        root.style.setProperty("--safe-top", `${safe?.top ?? 0}px`);
        root.style.setProperty("--safe-right", `${safe?.right ?? 0}px`);
        root.style.setProperty("--safe-bottom", `${safe?.bottom ?? 0}px`);
        root.style.setProperty("--safe-left", `${safe?.left ?? 0}px`);
        this.#elements.expand.hidden = !context?.availableDisplayModes?.includes("fullscreen");
    }

    #wireControls(): void {
        const elements = this.#elements;
        elements.search.addEventListener("input", () => {
            this.#search = elements.search.value.trim().toLocaleLowerCase();
            this.#renderSurface();
        });
        elements.metric.addEventListener("change", () => {
            this.#metric = elements.metric.value === "amount" ? "amount" : "duration";
            this.#renderSurface();
        });
        elements.weeklyGroup.addEventListener("change", () => {
            const group = elements.weeklyGroup.value === "PROJECT" ? "PROJECT" : "USER";
            this.#actions.changeWeeklyGroup(group);
        });
        elements.previous.addEventListener("click", () => {
            this.#actions.changePage(-1);
        });
        elements.next.addEventListener("click", () => {
            this.#actions.changePage(1);
        });
        elements.refresh.addEventListener("click", () => {
            this.#actions.refresh();
        });
        elements.changeDates.addEventListener("click", () => {
            this.#actions.sendMessage("dates");
        });
        elements.filters.addEventListener("click", () => {
            this.#actions.sendMessage("filters");
        });
        elements.switchReport.addEventListener("click", () => {
            this.#actions.sendMessage("switch");
        });
        elements.share.addEventListener("click", () => {
            this.#actions.sendMessage("share");
        });
        elements.expand.addEventListener("click", () => {
            this.#actions.requestFullscreen();
        });
    }

    #renderRuler(): void {
        const model = this.#model;
        if (!model) return;
        const weeklyDates = model.kind === "weekly" ? model.view.days.map((day) => day.date) : [];
        const start = datePart(model.query.dateRangeStart);
        const end = datePart(model.query.dateRangeEnd);
        const labels =
            weeklyDates.length === 7
                ? weeklyDates.map(datePart)
                : [start, "", "", model.query.timeZone ?? "range", "", "", end];
        this.#elements.ruler.replaceChildren(
            ...labels.map((label, index) => {
                const tick = node(this.#document, "span", "ruler-tick", label || `· ${index + 1}`);
                tick.setAttribute("aria-label", label || `Range tick ${index + 1}`);
                return tick;
            }),
        );
    }

    #renderTotals(): void {
        const model = this.#model;
        if (!model) return;
        const items: Array<[string, string]> = [];
        if (model.totals.durationSeconds !== null) {
            items.push(["Total time", duration(model.totals.durationSeconds)]);
        }
        if (model.totals.billableSeconds !== null) {
            items.push(["Billable", duration(model.totals.billableSeconds)]);
        }
        if (model.totals.entriesCount !== null) {
            items.push(["Entries", number(model.totals.entriesCount)]);
        }
        for (const amount of model.totals.amounts.slice(0, 3)) {
            items.push([amount.type, number(amount.value)]);
        }
        if (model.kind === "attendance") {
            items.push(["Overtime", duration(model.view.aggregates.overtimeSeconds)]);
        }
        if (items.length === 0) items.push(["Result", "No totals"]);
        this.#elements.totals.replaceChildren(
            ...items.map(([label, value]) => {
                const box = node(this.#document, "div", "total");
                box.append(
                    node(this.#document, "div", "total-label", label),
                    node(this.#document, "div", "total-value", value),
                );
                return box;
            }),
        );
    }

    #renderNotice(): void {
        const model = this.#model;
        if (!model) return;
        const messages = [...model.warnings];
        if (model.limits.omitted !== null && model.limits.omitted > 0) {
            messages.push(`${number(model.limits.omitted)} rows omitted from this bounded app view.`);
        } else if (model.limits.truncated && messages.length === 0) {
            messages.push("Some secondary App data was omitted to keep this view bounded.");
        }
        this.#elements.notice.hidden = messages.length === 0;
        this.#elements.notice.textContent = messages.join(" ");
    }

    #renderControls(): void {
        const model = this.#model;
        if (!model) return;
        this.#elements.toolbar.hidden = false;
        this.#elements.metricField.hidden = model.kind !== "summary";
        this.#elements.weeklyGroupField.hidden = model.kind !== "weekly";
        if (model.kind === "weekly") this.#elements.weeklyGroup.value = model.view.group;
    }

    #renderSurface(): void {
        const model = this.#model;
        if (!model) return;
        let surface: HTMLElement;
        switch (model.kind) {
            case "summary":
                surface = this.#renderSummary(model);
                break;
            case "detailed":
                surface = this.#renderDetailed(model);
                break;
            case "weekly":
                surface = this.#renderWeekly(model);
                break;
            case "attendance":
                surface = this.#renderAttendance(model);
                break;
            case "expense":
                surface = this.#renderExpense(model);
                break;
        }
        this.#elements.surface.replaceChildren(surface);
    }

    #renderSummary(model: ReportsAppModelV1 & { view: Extract<ReportsAppView, { kind: "summary" }> }): HTMLElement {
        const rows = filtered(model.view.rows, this.#search, (row) =>
            `${row.path.join(" ")} ${row.clientName ?? ""}`,
        );
        if (rows.length === 0) return emptyState(this.#document, this.#search);
        const chartRows = model.view.chart.map((row) => ({
            label: row.label,
            value: (this.#metric === "amount" ? row.amount : row.durationSeconds) ?? 0,
        }));
        const container = node(this.#document, "div", "report-stack");
        container.append(
            barChart(
                this.#document,
                this.#metric === "amount" ? "Top group amounts" : "Top group time",
                chartRows,
                this.#metric === "amount" ? number : duration,
            ),
            table(
                this.#document,
                ["Group", "Client", "Time", "Amount"],
                rows.map((row) => [
                    { text: `${"  ".repeat(Math.min(row.depth, 3))}${row.label}` },
                    { text: row.clientName ?? "—" },
                    numericCell(nullableDuration(row.durationSeconds)),
                    numericCell(row.amount === null ? "—" : number(row.amount)),
                ]),
            ),
        );
        return container;
    }

    #renderDetailed(model: ReportsAppModelV1 & { view: Extract<ReportsAppView, { kind: "detailed" }> }): HTMLElement {
        const rows = filtered(model.view.rows, this.#search, (row) =>
            [
                row.description,
                row.user.name,
                row.user.email,
                row.client.name,
                row.project.name,
                row.task.name,
                ...row.tags.map((tag) => tag.name),
            ].join(" "),
        );
        return rows.length === 0
            ? emptyState(this.#document, this.#search)
            : table(
                  this.#document,
                  ["Start", "Description", "Person", "Project / task", "Time", "State"],
                  rows.map((row) => [
                      { text: row.start ?? "—" },
                      { text: row.description || "(no description)" },
                      { text: row.user.name || row.user.email || "—" },
                      {
                          text:
                              [row.project.name, row.task.name].filter(Boolean).join(" / ") || "—",
                          ...colorProperty(row.project.color),
                      },
                      numericCell(nullableDuration(row.durationSeconds)),
                      {
                          text: row.running
                              ? "Running"
                              : row.billable === true
                                ? "Billable"
                                : "Recorded",
                      },
                  ]),
              );
    }

    #renderWeekly(model: ReportsAppModelV1 & { view: Extract<ReportsAppView, { kind: "weekly" }> }): HTMLElement {
        const rows = filtered(
            model.view.rows,
            this.#search,
            (row) => `${row.label} ${row.clientName ?? ""}`,
        );
        const usersWithoutTime = filtered(
            model.view.usersWithoutTime,
            this.#search,
            (user) => `${user.name} ${user.email}`,
        );
        if (rows.length === 0 && usersWithoutTime.length === 0) {
            return emptyState(this.#document, this.#search);
        }
        const container = node(this.#document, "div", "report-stack");
        if (rows.length > 0) {
            container.append(
                weeklyTable(
                    this.#document,
                    model.view.days.map((day) => day.date),
                    rows,
                    model.view.group,
                ),
            );
        }
        if (usersWithoutTime.length > 0) {
            container.append(
                table(
                    this.#document,
                    ["Person", "Email"],
                    usersWithoutTime.map((user) => [
                        { text: user.name || user.email || "Unknown person" },
                        { text: user.email || "—" },
                    ]),
                    "People without recorded time",
                ),
            );
        }
        return container;
    }

    #renderAttendance(model: ReportsAppModelV1 & { view: Extract<ReportsAppView, { kind: "attendance" }> }): HTMLElement {
        const rows = filtered(
            model.view.rows,
            this.#search,
            (row) => `${row.userName} ${row.date ?? ""}`,
        );
        if (rows.length === 0) return emptyState(this.#document, this.#search);
        const container = node(this.#document, "div", "report-stack");
        container.append(
            barChart(
                this.#document,
                "Work and overtime by person",
                model.view.chart.map((row) => ({
                    label: row.label,
                    value: row.workSeconds,
                    secondary: row.overtimeSeconds,
                })),
                duration,
            ),
            table(
                this.#document,
                ["Date", "Person", "Start–end", "Work", "Break", "Overtime", "Time off", "State"],
                rows.map((row) => [
                    { text: row.date ?? "—" },
                    { text: row.userName },
                    { text: [row.startTime, row.endTime].filter(Boolean).join("–") || "—" },
                    numericCell(nullableDuration(row.workSeconds)),
                    numericCell(nullableDuration(row.breakSeconds)),
                    numericCell(nullableDuration(row.overtimeSeconds)),
                    numericCell(nullableDuration(row.timeOffSeconds)),
                    { text: row.running ? "Running" : "Complete" },
                ]),
            ),
        );
        return container;
    }

    #renderExpense(model: ReportsAppModelV1 & { view: Extract<ReportsAppView, { kind: "expense" }> }): HTMLElement {
        const rows = filtered(model.view.rows, this.#search, (row) =>
            [row.userName, row.projectName, row.categoryName, row.notes].join(" "),
        );
        if (rows.length === 0) return emptyState(this.#document, this.#search);
        const container = node(this.#document, "div", "report-stack");
        container.append(
            barChart(
                this.#document,
                "Current page amount by category",
                model.view.chart.map((row) => ({ label: row.label, value: row.amount })),
                number,
            ),
            table(
                this.#document,
                ["Date", "Category", "Project / person", "Note", "Quantity", "Amount", "State"],
                rows.map((row) => [
                    { text: row.date ?? "—" },
                    { text: row.categoryName },
                    {
                        text: [row.projectName, row.userName].filter(Boolean).join(" / ") || "—",
                        ...colorProperty(row.projectColor),
                    },
                    { text: row.notes || "—" },
                    {
                        text:
                            row.quantity === null
                                ? "—"
                                : `${number(row.quantity)}${row.categoryUnit ? ` ${row.categoryUnit}` : ""}`,
                        numeric: true,
                    },
                    numericCell(row.amount === null ? "—" : number(row.amount)),
                    {
                        text: row.invoiced
                            ? "Invoiced"
                            : row.billable === true
                              ? "Billable"
                              : "Recorded",
                    },
                ]),
            ),
        );
        return container;
    }

    #renderPaging(): void {
        const view = this.#model?.view;
        const paging = view && "paging" in view ? view.paging : undefined;
        this.#elements.paging.hidden = paging === undefined;
        if (!paging) return;
        this.#elements.pageLabel.textContent = `Page ${number(paging.page)} · ${number(paging.returned)} returned`;
        this.#elements.previous.disabled = this.#busy || paging.page <= 1;
        this.#elements.next.disabled = this.#busy || !paging.mayHaveNext;
    }
}

export function safeProjectColor(value: string | null): string | null {
    return value !== null && /^#[0-9a-f]{6}$/iu.test(value) ? value : null;
}

function colorProperty(value: string | null): Pick<TableCell, "color"> | Record<string, never> {
    const color = safeProjectColor(value);
    return color === null ? {} : { color };
}

function collectElements(document: Document) {
    const element = (id: string): HTMLElement => required(document.querySelector<HTMLElement>(`#${id}`), id);
    const button = (id: string): HTMLButtonElement => required(document.querySelector<HTMLButtonElement>(`#${id}`), id);
    return {
        app: element("app"),
        title: element("title"),
        ruler: element("ruler"),
        totals: element("totals"),
        toolbar: element("toolbar"),
        search: required(document.querySelector<HTMLInputElement>("#search"), "search"),
        metricField: element("metric-field"),
        metric: required(document.querySelector<HTMLSelectElement>("#metric"), "metric"),
        weeklyGroupField: element("weekly-group-field"),
        weeklyGroup: required(
            document.querySelector<HTMLSelectElement>("#weekly-group"),
            "weekly-group",
        ),
        notice: element("notice"),
        surface: element("surface"),
        paging: element("paging"),
        previous: button("previous"),
        next: button("next"),
        pageLabel: element("page-label"),
        refresh: button("refresh"),
        changeDates: button("change-dates"),
        filters: button("filters"),
        switchReport: button("switch-report"),
        share: button("share"),
        expand: button("expand"),
        modelActions: [
            button("refresh"),
            button("change-dates"),
            button("filters"),
            button("switch-report"),
            button("share"),
        ],
    };
}

function required<T>(value: T | null, name: string): T {
    if (value === null) throw new Error(`Reports App template is missing #${name}.`);
    return value;
}

function table(
    document: Document,
    headings: string[],
    rows: TableCell[][],
    visibleCaption?: string,
): HTMLElement {
    const wrap = node(document, "div", "table-wrap");
    const tableElement = document.createElement("table");
    const caption = document.createElement("caption");
    caption.textContent = visibleCaption ?? "Report rows";
    caption.className = visibleCaption === undefined ? "visually-hidden" : "chart-title";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const heading of headings) {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = heading;
        headRow.append(cell);
    }
    head.append(headRow);
    const body = document.createElement("tbody");
    for (const values of rows) {
        const row = document.createElement("tr");
        values.forEach((value) => {
            row.append(tableCell(document, value));
        });
        body.append(row);
    }
    tableElement.append(caption, head, body);
    wrap.append(tableElement);
    return wrap;
}

function tableCell(document: Document, value: TableCell): HTMLTableCellElement {
    const cell = document.createElement("td");
    if (value.numeric === true) cell.className = "numeric";
    if (value.color !== undefined) {
        const swatch = node(document, "span", "project-swatch");
        swatch.style.backgroundColor = value.color;
        swatch.setAttribute("aria-hidden", "true");
        cell.append(swatch);
    }
    const text = document.createTextNode(value.text);
    cell.append(text);
    if (value.heat !== undefined) {
        cell.classList.add("heat");
        cell.style.setProperty("--heat", String(Math.max(0, Math.min(1, value.heat))));
    }
    return cell;
}

function numericCell(text: string): TableCell {
    return { text, numeric: true };
}

function weeklyTable(
    document: Document,
    dates: string[],
    rows: WeeklyRow[],
    group: "USER" | "PROJECT",
): HTMLElement {
    const max = Math.max(
        1,
        ...rows.flatMap((row) => row.days.map((day) => day.durationSeconds ?? 0)),
    );
    return table(
        document,
        [group === "USER" ? "Person" : "Project", ...dates.map(datePart), "Total"],
        rows.map((row) => {
            const byDate = new Map(row.days.map((day) => [datePart(day.date), day.durationSeconds]));
            return [
                { text: row.label },
                ...dates.map((date) => {
                    const value = byDate.get(datePart(date));
                    return {
                        text: value === undefined || value === null ? "—" : duration(value),
                        numeric: true,
                        heat: (value ?? 0) / max,
                    };
                }),
                numericCell(nullableDuration(row.durationSeconds)),
            ];
        }),
    );
}

function barChart(
    document: Document,
    title: string,
    rows: BarDatum[],
    format: (value: number) => string,
): HTMLElement {
    const figure = node(document, "figure", "chart");
    figure.append(node(document, "figcaption", "chart-title", title));
    const list = node(document, "ul", "chart-list");
    const max = Math.max(1, ...rows.map((row) => Math.max(row.value, row.secondary ?? 0)));
    for (const row of rows) {
        const item = node(document, "li", "chart-row");
        const label = node(document, "span", "chart-label", row.label);
        const bars = node(document, "span", "chart-bars");
        const primary = node(document, "span", "chart-bar work");
        primary.style.width = `${Math.max(0, (row.value / max) * 100)}%`;
        bars.append(primary);
        if (row.secondary !== undefined) {
            const secondary = node(document, "span", "chart-bar overtime");
            secondary.style.width = `${Math.max(0, (row.secondary / max) * 100)}%`;
            bars.append(secondary);
        }
        const values = row.secondary === undefined
            ? format(row.value)
            : `${format(row.value)} work, ${format(row.secondary)} overtime`;
        item.setAttribute("role", "img");
        item.setAttribute("aria-label", `${row.label}: ${values}`);
        item.append(label, bars, node(document, "span", "chart-value", values));
        list.append(item);
    }
    figure.append(list);
    return figure;
}

function filtered<T>(rows: T[], search: string, textFor: (row: T) => string): T[] {
    return search
        ? rows.filter((row) => textFor(row).toLocaleLowerCase().includes(search))
        : rows;
}

function emptyState(document: Document, search: string): HTMLElement {
    return node(
        document,
        "div",
        "empty",
        search ? "No visible rows match this filter." : "No rows in this report.",
    );
}

function node(document: Document, tag: string, className = "", text = ""): HTMLElement {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== "") element.textContent = text;
    return element;
}

function duration(seconds: number): string {
    if (!Number.isFinite(seconds)) return "—";
    const absolute = Math.abs(Math.round(seconds));
    const hours = Math.floor(absolute / 3_600);
    const minutes = Math.floor((absolute % 3_600) / 60);
    const sign = seconds < 0 ? "−" : "";
    return `${sign}${hours}:${String(minutes).padStart(2, "0")}`;
}

function nullableDuration(value: number | null): string {
    return value === null ? "—" : duration(value);
}

function number(value: number): string {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function datePart(value: string): string {
    return value.length >= 10 ? value.slice(0, 10) : value;
}
