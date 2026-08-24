// @vitest-environment happy-dom
/// <reference lib="dom" />

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeAttendanceReport } from "../src/apps/report-app/normalize-attendance.js";
import { normalizeDetailedReport } from "../src/apps/report-app/normalize-detailed.js";
import { normalizeExpenseReport } from "../src/apps/report-app/normalize-expense.js";
import { normalizeSummaryReport } from "../src/apps/report-app/normalize-summary.js";
import { normalizeWeeklyReport } from "../src/apps/report-app/normalize-weekly.js";
import {
    ReportsLedgerView,
    safeProjectColor,
    type ReportsLedgerActions,
} from "../src/apps/report-app/renderer.js";

const RANGE = {
    dateRangeStart: "2026-08-03T00:00:00.000Z",
    dateRangeEnd: "2026-08-10T00:00:00.000Z",
    timeZone: "Europe/Belgrade",
};

let actions: ReportsLedgerActions;
let view: ReportsLedgerView;

beforeEach(async () => {
    const template = await readFile(
        resolve("src/apps/report-app/template.html"),
        "utf8",
    );
    document.open();
    document.write(template);
    document.close();
    actions = {
        changePage: vi.fn(),
        changeWeeklyGroup: vi.fn(),
        refresh: vi.fn(),
        requestFullscreen: vi.fn(),
        sendMessage: vi.fn(),
    };
    view = new ReportsLedgerView(document, actions);
});

describe("Reports ledger DOM renderer", () => {
    it("renders only the current summary, with accessible bars and escaped external strings", () => {
        const malicious = '<img id="injected" src=x onerror=alert(1)>';
        const model = normalizeSummaryReport(
            {
                groupOne: [{ id: "one", name: malicious, duration: 3_600 }],
                totals: [{ totalTime: 3_600 }],
            },
            { ...RANGE, groups: ["PROJECT"] },
        );
        view.render(model);

        expect(document.querySelector("#injected")).toBeNull();
        expect(document.querySelector("#surface")?.textContent).toContain(malicious);
        expect(document.querySelectorAll('[role="img"][aria-label]')).toHaveLength(1);
        expect(document.querySelector("caption")?.textContent).toBe("Report rows");
        expect(document.querySelector("#title")?.textContent).toBe("Summary ledger");
        expect(document.querySelectorAll("table")).toHaveLength(1);
    });

    it("renders detailed rows and uses only validated six-digit project colors", () => {
        const model = normalizeDetailedReport(
            {
                timeEntries: [
                    {
                        id: "safe",
                        projectName: "Safe",
                        projectColor: "#2E756B",
                        timeInterval: { start: "2026-08-03T09:00:00+02:00", duration: 3_600 },
                    },
                    {
                        id: "unsafe",
                        projectName: "Unsafe",
                        projectColor: "url(javascript:alert(1))",
                        timeInterval: { start: "2026-08-03T10:00:00+02:00", duration: 3_600 },
                    },
                ],
            },
            { ...RANGE, page: 1, pageSize: 50 },
        );
        view.render(model);

        const swatches = document.querySelectorAll<HTMLElement>(".project-swatch");
        expect(swatches).toHaveLength(1);
        expect(swatches[0]?.style.backgroundColor).not.toBe("");
        expect(safeProjectColor("#aBc123")).toBe("#aBc123");
        expect(safeProjectColor("red")).toBeNull();
        expect(document.body.textContent).toContain("2026-08-03T09:00:00+02:00");
    });

    it("renders a weekly heatmap, people without time, and grouping as the only direct switch", () => {
        const model = normalizeWeeklyReport(
            {
                totalsByDay: Array.from({ length: 7 }, (_, index) => ({
                    date: `2026-08-${String(index + 3).padStart(2, "0")}`,
                    duration: index * 600,
                })),
                groupOne: [{ id: "u1", name: "Ada", duration: 10_800 }],
                usersWithoutTime: [
                    {
                        id: "u2",
                        name: "Grace Hopper",
                        email: "grace.hopper@example.test",
                    },
                    { id: "u3", name: "Lin", email: "" },
                ],
            },
            { ...RANGE, group: "USER" },
        );
        view.render(model);

        expect(document.querySelectorAll("#ruler .ruler-tick")).toHaveLength(7);
        expect(document.querySelectorAll("td.heat")).toHaveLength(7);
        const absentCaption = Array.from(document.querySelectorAll("caption")).find(
            (caption) => caption.textContent === "People without recorded time",
        );
        expect(absentCaption?.classList.contains("visually-hidden")).toBe(false);
        expect(absentCaption?.closest("table")?.textContent).toContain("Grace Hopper");
        expect(absentCaption?.closest("table")?.textContent).toContain(
            "grace.hopper@example.test",
        );
        expect(absentCaption?.closest("table")?.textContent).toContain("Lin");
        const group = required(
            document.querySelector<HTMLSelectElement>("#weekly-group"),
            "weekly group",
        );
        group.value = "PROJECT";
        group.dispatchEvent(new Event("change"));
        expect(actions.changeWeeklyGroup).toHaveBeenCalledWith("PROJECT");
    });

    it("renders attendance work/overtime bars and the explicit break column", () => {
        const model = normalizeAttendanceReport(
            {
                entities: [
                    {
                        userId: "u1",
                        userName: "Ada",
                        date: "2026-08-03",
                        totalDuration: 28_800,
                        break: 1_800,
                        overtime: 900,
                    },
                ],
            },
            { ...RANGE, page: 1, pageSize: 50 },
        );
        view.render(model);

        expect(document.body.textContent).toContain("Break");
        expect(document.body.textContent).toContain("0:30");
        expect(document.querySelector(".chart-bar.work")).not.toBeNull();
        expect(document.querySelector(".chart-bar.overtime")).not.toBeNull();
        expect(document.querySelector('[aria-label*="overtime"]')).not.toBeNull();
    });

    it("renders expense amounts as plain numbers with no currency or receipt action", () => {
        const model = normalizeExpenseReport(
            {
                expenses: [
                    {
                        id: "e1",
                        date: "2026-08-03",
                        categoryName: "Travel",
                        amount: 12.5,
                        fileName: "receipt.pdf",
                    },
                ],
            },
            { ...RANGE, page: 1, pageSize: 50 },
        );
        view.render(model);

        expect(document.body.textContent).toContain("12.5");
        expect(document.body.textContent).not.toContain("$");
        expect(document.body.textContent).not.toContain("receipt.pdf");
        expect(document.querySelectorAll("a")).toHaveLength(0);
    });

    it("applies host theme, safe area, fullscreen support, focusable actions, and message routing", () => {
        const model = normalizeSummaryReport(
            { groupOne: [] },
            { ...RANGE, groups: ["PROJECT"] },
        );
        view.applyHostContext({
            theme: "dark",
            availableDisplayModes: ["inline", "fullscreen"],
            safeAreaInsets: { top: 4, right: 5, bottom: 6, left: 7 },
        });
        view.render(model);

        expect(document.documentElement.dataset.theme).toBe("dark");
        expect(document.documentElement.style.getPropertyValue("--safe-left")).toBe("7px");
        const expand = required(
            document.querySelector<HTMLButtonElement>("#expand"),
            "expand",
        );
        expect(expand.hidden).toBe(false);
        expand.click();
        required(document.querySelector<HTMLButtonElement>("#refresh"), "refresh").click();
        required(document.querySelector<HTMLButtonElement>("#change-dates"), "dates").click();
        required(document.querySelector<HTMLButtonElement>("#filters"), "filters").click();
        required(document.querySelector<HTMLButtonElement>("#switch-report"), "switch").click();
        required(document.querySelector<HTMLButtonElement>("#share"), "share").click();

        expect(actions.requestFullscreen).toHaveBeenCalledOnce();
        expect(actions.refresh).toHaveBeenCalledOnce();
        expect(actions.sendMessage).toHaveBeenCalledWith("dates");
        expect(actions.sendMessage).toHaveBeenCalledWith("filters");
        expect(actions.sendMessage).toHaveBeenCalledWith("switch");
        expect(actions.sendMessage).toHaveBeenCalledWith("share");
        expect(
            Array.from(document.querySelectorAll<HTMLButtonElement>("button")).some(
                (button) => !button.disabled && button.tabIndex >= 0,
            ),
        ).toBe(true);
    });

    it("shows a useful error fallback without retaining stale report DOM", () => {
        const model = normalizeSummaryReport(
            { groupOne: [{ id: "one", name: "Stale", duration: 1 }] },
            { ...RANGE, groups: ["PROJECT"] },
        );
        view.render(model);
        view.showFallback(true, "feature_unavailable: upgrade required");

        expect(document.querySelector("#surface")?.children).toHaveLength(0);
        expect(document.querySelector("#notice")?.textContent).toContain(
            "feature_unavailable",
        );
        expect(document.querySelector("#title")?.textContent).toBe(
            "Report could not be loaded",
        );
    });
});

function required<T>(value: T | null, label: string): T {
    if (value === null) throw new Error(`Missing ${label}`);
    return value;
}
