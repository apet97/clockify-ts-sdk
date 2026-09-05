// @vitest-environment happy-dom
/// <reference lib="dom" />

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    REPORTS_APP_MODEL_META_KEY,
    REPORTS_APP_MODEL_BYTE_LIMIT,
} from "../src/apps/report-app/constants.js";
import { normalizeDetailedReport } from "../src/apps/report-app/normalize-detailed.js";
import { normalizeSummaryReport } from "../src/apps/report-app/normalize-summary.js";

const host = vi.hoisted(() => ({
    listeners: new Map<string, (params: unknown) => void>(),
    callServerTool: vi.fn<(request: unknown) => Promise<unknown>>(),
    connect: vi.fn<() => Promise<void>>(),
    getHostContext: vi.fn<() => undefined>(),
    requestDisplayMode: vi.fn<(request: unknown) => Promise<unknown>>(),
    sendMessage: vi.fn<(message: unknown) => Promise<unknown>>(),
    teardownHandler: undefined as (() => unknown) | undefined,
}));

vi.mock("@modelcontextprotocol/ext-apps/app-with-deps", () => ({
    App: class {
        addEventListener(event: string, listener: (params: unknown) => void): void {
            host.listeners.set(event, listener);
        }

        set onteardown(handler: () => unknown) {
            host.teardownHandler = handler;
        }

        connect(): Promise<void> {
            return host.connect();
        }

        getHostContext(): undefined {
            return host.getHostContext();
        }

        callServerTool(request: unknown): Promise<unknown> {
            return host.callServerTool(request);
        }

        requestDisplayMode(request: unknown): Promise<unknown> {
            return host.requestDisplayMode(request);
        }

        sendMessage(message: unknown): Promise<unknown> {
            return host.sendMessage(message);
        }
    },
}));

const RANGE = {
    dateRangeStart: "2026-08-03T00:00:00.000Z",
    dateRangeEnd: "2026-08-10T00:00:00.000Z",
};
const TEMPLATE_PATH = reportAppTemplatePath();

function reportAppTemplatePath(): string {
    const packagePath = resolve(process.cwd(), "src/apps/report-app/template.html");
    return existsSync(packagePath)
        ? packagePath
        : resolve(process.cwd(), "mcp/src/apps/report-app/template.html");
}

beforeEach(async () => {
    vi.resetModules();
    host.listeners.clear();
    host.callServerTool.mockReset();
    host.connect.mockReset().mockResolvedValue(undefined);
    host.getHostContext.mockReset().mockReturnValue(undefined);
    host.requestDisplayMode.mockReset().mockResolvedValue(undefined);
    host.sendMessage.mockReset().mockResolvedValue(undefined);
    host.teardownHandler = undefined;

    const template = await readFile(TEMPLATE_PATH, "utf8");
    document.open();
    document.write(template);
    document.close();
    await import("../src/apps/report-app/widget.js");
    await vi.waitFor(() => expect(host.connect).toHaveBeenCalledOnce());
});

describe("Reports App widget event handling", () => {
    it("answers the host teardown request with a successful empty result", async () => {
        const teardown = host.teardownHandler;
        if (teardown === undefined) throw new Error("Widget did not register teardown handler.");

        required(document.querySelector<HTMLElement>("#app"), "app").setAttribute(
            "aria-busy",
            "true",
        );
        expect(await Promise.resolve(teardown())).toEqual({});
        expect(document.querySelector("#app")?.getAttribute("aria-busy")).toBe("false");
    });

    it("renders a real toolresult event then clears stale DOM for malformed metadata", () => {
        emit("toolresult", toolResult(validSummaryModel("Current")));
        expect(document.querySelector("#surface")?.textContent).toContain("Current");

        emit("toolresult", toolResult(shallowMalformedSummaryModel()));

        expect(document.querySelector("#surface")?.children).toHaveLength(0);
        expect(document.querySelector("#title")?.textContent).toBe("Report data is available");
        expect(document.querySelector("#notice")?.textContent).toMatch(
            /interactive model is unavailable/i,
        );
    });

    it("catches a renderer failure and clears its partial DOM through the event boundary", () => {
        emit("toolresult", toolResult(validSummaryModel("Before failure")));
        const surface = required(document.querySelector<HTMLElement>("#surface"), "surface");
        const replaceChildren = vi.spyOn(surface, "replaceChildren");
        replaceChildren.mockImplementationOnce(() => {
            const partial = document.createElement("span");
            partial.textContent = "partial render";
            surface.append(partial);
            throw new Error("forced render failure");
        });

        expect(() => emit("toolresult", toolResult(validSummaryModel("Broken")))).not.toThrow();
        replaceChildren.mockRestore();

        expect(surface.children).toHaveLength(0);
        expect(surface.textContent).not.toContain("partial render");
        expect(document.querySelector("#title")?.textContent).toBe("Report could not be loaded");
        expect(document.querySelector("#notice")?.textContent).toContain("forced render failure");
    });

    it("clears stale report state when the host cancels the tool", () => {
        emit("toolresult", toolResult(validSummaryModel("Stale")));
        emit("toolcancelled", { reason: "user stopped the request" });

        expect(document.querySelector("#surface")?.children).toHaveLength(0);
        expect(document.querySelector("#title")?.textContent).toBe("Report could not be loaded");
        expect(document.querySelector("#notice")?.textContent).toContain(
            "user stopped the request",
        );
    });

    it("clears the previous report before accepting a new host tool input", () => {
        emit("toolresult", toolResult(validSummaryModel("Previous invocation")));
        emit("toolinput", {
            arguments: {
                ...RANGE,
                weeklyFilter: { group: "USER", subgroup: "TIME" },
            },
        });

        expect(document.querySelector("#surface")?.children).toHaveLength(0);
        expect(document.querySelector("#title")?.textContent).toBe("Report data is available");
        expect(document.querySelector("#notice")?.textContent).toMatch(
            /interactive model is unavailable/i,
        );
        required(document.querySelector<HTMLButtonElement>("#refresh"), "refresh").click();
        expect(host.callServerTool).not.toHaveBeenCalled();
    });

    it("does not let a cancelled refresh repaint the report when its promise resolves late", async () => {
        emit("toolinput", {
            arguments: {
                ...RANGE,
                summaryFilter: { groups: ["PROJECT"] },
            },
        });
        emit("toolresult", toolResult(validSummaryModel("Before cancellation")));

        let resolveCall: (value: unknown) => void = () => {
            throw new Error("Refresh promise was not initialized.");
        };
        host.callServerTool.mockReturnValue(
            new Promise((resolve) => {
                resolveCall = resolve;
            }),
        );
        required(document.querySelector<HTMLButtonElement>("#refresh"), "refresh").click();
        await vi.waitFor(() => expect(host.callServerTool).toHaveBeenCalledOnce());

        emit("toolcancelled", { reason: "user stopped the refresh" });
        resolveCall(toolResult(validSummaryModel("Late result")));
        await vi.waitFor(() =>
            expect(document.querySelector("#notice")?.textContent).toContain(
                "user stopped the refresh",
            ),
        );

        expect(document.querySelector("#title")?.textContent).toBe("Report could not be loaded");
        expect(document.querySelector("#surface")?.children).toHaveLength(0);
        expect(document.querySelector("#surface")?.textContent).not.toContain("Late result");
    });

    it("keeps an app refresh single-flight across host input, partial input, and result notifications", async () => {
        emit("toolinput", {
            arguments: {
                ...RANGE,
                summaryFilter: { groups: ["PROJECT"] },
            },
        });
        emit("toolresult", toolResult(validSummaryModel("Before refresh")));

        let resolveCall: (value: unknown) => void = () => {
            throw new Error("Refresh promise was not initialized.");
        };
        host.callServerTool.mockReturnValue(
            new Promise((resolve) => {
                resolveCall = resolve;
            }),
        );

        const refresh = required(document.querySelector<HTMLButtonElement>("#refresh"), "refresh");
        refresh.click();
        await vi.waitFor(() => expect(host.callServerTool).toHaveBeenCalledOnce());

        // The host reports the same app-initiated call through lifecycle notifications while
        // the direct callServerTool promise is still pending. These events must not cancel it.
        emit("toolinputpartial", {
            arguments: { dateRangeStart: "incomplete" },
        });
        emit("toolinput", {
            arguments: {
                ...RANGE,
                summaryFilter: { groups: ["PROJECT"] },
            },
        });
        emit("toolresult", toolResult(validSummaryModel("Lifecycle result")));

        expect(refresh.disabled).toBe(true);
        expect(document.querySelector("#surface")?.textContent).toContain("Before refresh");
        expect(document.querySelector("#surface")?.textContent).not.toContain("Lifecycle result");
        refresh.click();
        expect(host.callServerTool).toHaveBeenCalledTimes(1);

        resolveCall(toolResult(validSummaryModel("Direct refresh")));
        await vi.waitFor(() =>
            expect(document.querySelector("#surface")?.textContent).toContain("Direct refresh"),
        );
        expect(document.querySelector("#surface")?.textContent).not.toContain("incomplete");
        await vi.waitFor(() => expect(refresh.disabled).toBe(false));
    });

    it("falls back when a direct refresh returns a malformed model", async () => {
        emit("toolinput", {
            arguments: {
                ...RANGE,
                summaryFilter: { groups: ["PROJECT"] },
            },
        });
        emit("toolresult", toolResult(validSummaryModel("Before refresh")));
        host.callServerTool.mockResolvedValue(toolResult(shallowMalformedSummaryModel()));

        required(document.querySelector<HTMLButtonElement>("#refresh"), "refresh").click();
        await vi.waitFor(() => expect(host.callServerTool).toHaveBeenCalledOnce());
        await vi.waitFor(() =>
            expect(document.querySelector("#surface")?.children).toHaveLength(0),
        );

        expect(document.querySelector("#title")?.textContent).toBe("Report data is available");
        expect(document.querySelector("#notice")?.textContent).toMatch(
            /interactive model is unavailable/i,
        );
    });

    it("preserves a non-50 initiating offset across refresh, next, and previous", async () => {
        emit("toolinput", {
            arguments: {
                ...RANGE,
                detailedFilter: { page: 2, pageSize: 1_000 },
            },
        });
        emit("toolresult", toolResult(validDetailedModel(21)));
        expect(document.querySelector("#page-label")?.textContent).toContain("Page 21");

        host.callServerTool
            .mockResolvedValueOnce(toolResult(validDetailedModel(21)))
            .mockResolvedValueOnce(toolResult(validDetailedModel(22)))
            .mockResolvedValueOnce(toolResult(validDetailedModel(21)));

        const refresh = required(document.querySelector<HTMLButtonElement>("#refresh"), "refresh");
        const next = required(document.querySelector<HTMLButtonElement>("#next"), "next");
        const previous = required(
            document.querySelector<HTMLButtonElement>("#previous"),
            "previous",
        );

        refresh.click();
        await vi.waitFor(() => expect(host.callServerTool).toHaveBeenCalledTimes(1));
        expectReportPageCall(1, 21);
        await vi.waitFor(() => expect(refresh.disabled).toBe(false));

        next.click();
        await vi.waitFor(() => expect(host.callServerTool).toHaveBeenCalledTimes(2));
        expectReportPageCall(2, 22);
        await vi.waitFor(() =>
            expect(document.querySelector("#page-label")?.textContent).toContain("Page 22"),
        );

        previous.click();
        await vi.waitFor(() => expect(host.callServerTool).toHaveBeenCalledTimes(3));
        expectReportPageCall(3, 21);
        await vi.waitFor(() =>
            expect(document.querySelector("#page-label")?.textContent).toContain("Page 21"),
        );
    });
});

function validSummaryModel(label: string) {
    return normalizeSummaryReport(
        { groupOne: [{ id: "one", name: label, duration: 3_600 }] },
        { ...RANGE, groups: ["PROJECT"] },
    );
}

function validDetailedModel(page: number) {
    return normalizeDetailedReport(
        {
            timeEntries: Array.from({ length: 50 }, (_, index) => ({
                id: `entry-${index}`,
                description: `Entry ${index}`,
                timeInterval: {
                    start: "2026-08-03T08:00:00.000Z",
                    end: "2026-08-03T09:00:00.000Z",
                    duration: 3_600,
                },
                tags: [],
            })),
        },
        { ...RANGE, page, pageSize: 50 },
    );
}

function expectReportPageCall(call: number, page: number): void {
    expect(host.callServerTool).toHaveBeenNthCalledWith(call, {
        name: "clockify_reports_detailed",
        arguments: {
            ...RANGE,
            detailedFilter: { page, pageSize: 50 },
        },
    });
}

function shallowMalformedSummaryModel(): Record<string, unknown> {
    return {
        version: 1,
        sourceTool: "clockify_reports_summary",
        kind: "summary",
        query: RANGE,
        totals: {
            durationSeconds: null,
            billableSeconds: null,
            entriesCount: null,
            amounts: [],
        },
        limits: {
            byteLimit: REPORTS_APP_MODEL_BYTE_LIMIT,
            shown: 1,
            available: 1,
            omitted: 0,
            truncated: false,
        },
        warnings: [],
        view: { kind: "summary", rows: [{}], chart: [], groupBy: ["PROJECT"] },
    };
}

function toolResult(model: unknown): Record<string, unknown> {
    return {
        content: [{ type: "text", text: "report receipt" }],
        _meta: { [REPORTS_APP_MODEL_META_KEY]: model },
    };
}

function emit(event: string, params: unknown): void {
    const listener = host.listeners.get(event);
    if (!listener) throw new Error(`Widget did not register ${event}.`);
    listener(params);
}

function required<T>(value: T | null, label: string): T {
    if (value === null) throw new Error(`Missing ${label}`);
    return value;
}
