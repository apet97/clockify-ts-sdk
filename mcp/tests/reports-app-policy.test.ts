import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
    REPORTS_APP_DIRECT_TOOLS,
    activeReportsWidgetModel,
    boundedReportArguments,
    initialReportsWidgetState,
    isReportsAppDirectTool,
    reportsMessagePrompt,
    transitionReportsWidgetState,
} from "../src/apps/report-app/app-policy.js";
import { REPORTS_APP_MODEL_META_KEY } from "../src/apps/report-app/constants.js";
import { normalizeSummaryReport } from "../src/apps/report-app/normalize-summary.js";

describe("Reports App call policy", () => {
    it("allows exactly the five report reads", () => {
        expect(REPORTS_APP_DIRECT_TOOLS).toEqual([
            "clockify_reports_summary",
            "clockify_reports_detailed",
            "clockify_reports_weekly",
            "clockify_reports_attendance",
            "clockify_reports_expense",
        ]);
        expect(isReportsAppDirectTool("clockify_reports_expense")).toBe(true);
        expect(isReportsAppDirectTool("clockify_shared_reports_create")).toBe(false);
        expect(isReportsAppDirectTool("clockify_api")).toBe(false);
    });

    it("translates every paged direct call to the containing 50-row window", () => {
        const detailed = { detailedFilter: { page: 2, pageSize: 1_000 }, marker: "keep" };
        const attendance = { attendanceFilter: { page: 2, pageSize: 1_000 } };
        const expense = { page: 2, pageSize: 1_000 };

        expect(boundedReportArguments("clockify_reports_detailed", detailed)).toEqual({
            detailedFilter: { page: 21, pageSize: 50 },
            marker: "keep",
        });
        expect(boundedReportArguments("clockify_reports_attendance", attendance)).toEqual({
            attendanceFilter: { page: 21, pageSize: 50 },
        });
        expect(boundedReportArguments("clockify_reports_expense", expense)).toEqual({
            page: 21,
            pageSize: 50,
        });
        expect(detailed.detailedFilter).toEqual({ page: 2, pageSize: 1_000 });
        expect(expense).toEqual({ page: 2, pageSize: 1_000 });
    });

    it("routes incompatible changes and save/share through a conversation message", () => {
        const model = normalizeSummaryReport(
            { groupOne: [] },
            {
                dateRangeStart: "2026-08-01T00:00:00Z",
                dateRangeEnd: "2026-08-31T23:59:59Z",
                groups: ["PROJECT"],
            },
        );

        expect(reportsMessagePrompt("dates", model)).toMatch(/Ask me for the replacement range/i);
        expect(reportsMessagePrompt("filters", model)).toMatch(/complex filters/i);
        expect(reportsMessagePrompt("switch", model)).toMatch(/inputs that are not compatible/i);
        expect(reportsMessagePrompt("share", model)).toMatch(/preview every write/i);
    });

    it("contains no browser network or unsafe DOM escape hatch", async () => {
        const [widget, renderer, styles] = await Promise.all([
            readFile(new URL("../src/apps/report-app/widget.ts", import.meta.url), "utf8"),
            readFile(new URL("../src/apps/report-app/renderer.ts", import.meta.url), "utf8"),
            readFile(new URL("../src/apps/report-app/widget.css", import.meta.url), "utf8"),
        ]);
        const browserSource = `${widget}\n${renderer}`;

        expect(browserSource).not.toMatch(/\bfetch\s*\(/u);
        expect(browserSource).not.toMatch(/XMLHttpRequest|WebSocket|EventSource/u);
        expect(browserSource).not.toMatch(/\.innerHTML\b|insertAdjacentHTML|document\.write/u);
        expect(browserSource).not.toMatch(/openLink|downloadFile/u);
        expect(widget.match(/\.callServerTool\s*\(/gu)).toHaveLength(1);
        expect(styles).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;/u);
    });

    it("models explicit widget state transitions and rejects stale direct-call completions", () => {
        const model = normalizeSummaryReport(
            { groupOne: [{ id: "one", name: "Initial", duration: 3_600 }] },
            {
                dateRangeStart: "2026-08-01T00:00:00Z",
                dateRangeEnd: "2026-08-31T23:59:59Z",
                groups: ["PROJECT"],
            },
        );
        const refreshedModel = normalizeSummaryReport(
            { groupOne: [{ id: "two", name: "Refreshed", duration: 7_200 }] },
            {
                dateRangeStart: "2026-08-01T00:00:00Z",
                dateRangeEnd: "2026-08-31T23:59:59Z",
                groups: ["PROJECT"],
            },
        );

        const idle = initialReportsWidgetState();
        expect(idle).toEqual({ kind: "idle", generation: 0, toolInput: {} });
        expect(activeReportsWidgetModel(idle)).toBeUndefined();

        const awaiting = transitionReportsWidgetState(idle, {
            type: "host_tool_input",
            arguments: { marker: "initial" },
        });
        expect(awaiting.state).toEqual({
            kind: "awaiting_host",
            generation: 1,
            toolInput: { marker: "initial" },
        });
        expect(awaiting.effect).toEqual({
            kind: "show_fallback",
            isError: false,
            message: undefined,
        });

        const ready = transitionReportsWidgetState(awaiting.state, {
            type: "host_tool_result",
            result: { _meta: { [REPORTS_APP_MODEL_META_KEY]: model } },
        });
        expect(ready.state.kind).toBe("ready");
        expect(activeReportsWidgetModel(ready.state)).toBe(model);
        expect(ready.effect).toEqual({ kind: "render_model", model });

        const token = Symbol("refresh");
        const refreshing = transitionReportsWidgetState(ready.state, {
            type: "direct_call_started",
            callToken: token,
        });
        expect(refreshing.state.kind).toBe("refreshing");
        expect(activeReportsWidgetModel(refreshing.state)).toBe(model);
        expect(refreshing.effect).toEqual({
            kind: "start_busy",
            message: "Refreshing report…",
        });

        const stale = transitionReportsWidgetState(refreshing.state, {
            type: "direct_call_resolved",
            callToken: Symbol("other"),
            generation: refreshing.state.generation,
            arguments: { marker: "stale" },
            result: { _meta: { [REPORTS_APP_MODEL_META_KEY]: refreshedModel } },
        });
        expect(stale).toEqual({ state: refreshing.state, effect: { kind: "none" } });

        const resolved = transitionReportsWidgetState(refreshing.state, {
            type: "direct_call_resolved",
            callToken: token,
            generation: refreshing.state.generation,
            arguments: { marker: "updated" },
            result: { _meta: { [REPORTS_APP_MODEL_META_KEY]: refreshedModel } },
        });
        expect(resolved.state).toEqual({
            kind: "ready",
            generation: refreshing.state.generation,
            model: refreshedModel,
            toolInput: { marker: "updated" },
        });

        const tornDown = transitionReportsWidgetState(resolved.state, { type: "teardown" });
        expect(tornDown).toEqual({
            state: {
                kind: "idle",
                generation: resolved.state.generation + 1,
                toolInput: {},
            },
            effect: { kind: "clear_busy" },
        });
    });
});
