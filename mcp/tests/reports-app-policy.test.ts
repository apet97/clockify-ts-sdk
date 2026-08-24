import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
    REPORTS_APP_DIRECT_TOOLS,
    boundedReportArguments,
    isReportsAppDirectTool,
    reportsMessagePrompt,
} from "../src/apps/report-app/app-policy.js";
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
});
