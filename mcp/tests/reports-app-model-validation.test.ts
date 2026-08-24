import { describe, expect, it } from "vitest";

import { REPORTS_APP_MODEL_BYTE_LIMIT } from "../src/apps/report-app/constants.js";
import { isReportsAppModel } from "../src/apps/report-app/model-validation.js";

describe("Reports App browser model validation", () => {
    it.each([
        ["summary", "clockify_reports_summary"],
        ["detailed", "clockify_reports_detailed"],
        ["weekly", "clockify_reports_weekly"],
        ["attendance", "clockify_reports_attendance"],
        ["expense", "clockify_reports_expense"],
    ] as const)("rejects a shallow-valid malformed %s model", (kind, sourceTool) => {
        const value = {
            version: 1,
            sourceTool,
            kind,
            query: {
                dateRangeStart: "2026-08-03T00:00:00Z",
                dateRangeEnd: "2026-08-10T00:00:00Z",
            },
            totals: {
                durationSeconds: null,
                billableSeconds: null,
                entriesCount: null,
                amounts: [],
            },
            limits: {
                byteLimit: REPORTS_APP_MODEL_BYTE_LIMIT,
                shown: 0,
                available: 0,
                omitted: 0,
                truncated: false,
            },
            warnings: [],
            view: { kind },
        };

        expect(isReportsAppModel(value)).toBe(false);
    });

    it("rejects a valid-looking view paired with the wrong source tool", () => {
        expect(
            isReportsAppModel({
                version: 1,
                sourceTool: "clockify_reports_expense",
                kind: "summary",
                query: { dateRangeStart: "start", dateRangeEnd: "end" },
                totals: {
                    durationSeconds: null,
                    billableSeconds: null,
                    entriesCount: null,
                    amounts: [],
                },
                limits: {
                    byteLimit: REPORTS_APP_MODEL_BYTE_LIMIT,
                    shown: 0,
                    available: 0,
                    omitted: 0,
                    truncated: false,
                },
                warnings: [],
                view: {
                    kind: "summary",
                    groupBy: ["PROJECT"],
                    topLevelAvailable: 0,
                    rows: [],
                    chart: [],
                },
            }),
        ).toBe(false);
    });
});
