import { describe, expect, it } from "vitest";

import { detailedEntries, detailedFilter, reportTotals, summaryFilter, summaryGroups, weeklyFilter } from "../reports.js";

describe("summaryFilter", () => {
    it("requires groups and passes optional sort/chart through", () => {
        expect(summaryFilter(["PROJECT"])).toEqual({ groups: ["PROJECT"] });
        expect(summaryFilter(["PROJECT", "USER"], { sortColumn: "DURATION", summaryChartType: "PROJECT" })).toEqual({
            groups: ["PROJECT", "USER"],
            sortColumn: "DURATION",
            summaryChartType: "PROJECT",
        });
    });
});

describe("detailedFilter", () => {
    it("defaults to page 1", () => {
        expect(detailedFilter()).toEqual({ page: 1 });
    });
    it("passes pageSize/sortColumn through", () => {
        expect(detailedFilter({ page: 2, pageSize: 50, sortColumn: "DATE" })).toEqual({
            page: 2,
            pageSize: 50,
            sortColumn: "DATE",
        });
    });
});

describe("weeklyFilter", () => {
    it("defaults the subgroup to TIME", () => {
        expect(weeklyFilter("USER")).toEqual({ group: "USER", subgroup: "TIME" });
        expect(weeklyFilter("PROJECT", "TIME")).toEqual({ group: "PROJECT", subgroup: "TIME" });
    });
});

describe("detailedEntries", () => {
    it("coalesces the timeEntries and lowercase timeentries spellings", () => {
        expect(detailedEntries({ timeEntries: [{ description: "a" }] })).toEqual([{ description: "a" }]);
        expect(detailedEntries({ timeentries: [{ description: "b" }] })).toEqual([{ description: "b" }]);
        expect(detailedEntries({})).toEqual([]);
    });
});

describe("summaryGroups / reportTotals", () => {
    it("returns groupOne / totals, or empty arrays", () => {
        expect(summaryGroups({ groupOne: [{}] })).toEqual([{}]);
        expect(summaryGroups({})).toEqual([]);
        expect(reportTotals({ totals: [{}] })).toEqual([{}]);
        expect(reportTotals({})).toEqual([]);
    });
});
