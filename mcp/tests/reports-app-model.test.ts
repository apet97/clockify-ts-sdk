import { Buffer } from "node:buffer";

import type { ClockifyApi } from "clockify-sdk-ts-115/requests";
import { describe, expect, it } from "vitest";

import {
    BUDGET_WARNINGS,
    createReportsAppBudget,
    fitReportsAppModel,
    reportsAppModelBytes,
} from "../src/apps/report-app/model-budget.js";
import { isReportsAppModel } from "../src/apps/report-app/model-validation.js";
import { normalizeAttendanceReport } from "../src/apps/report-app/normalize-attendance.js";
import { normalizeDetailedReport } from "../src/apps/report-app/normalize-detailed.js";
import { normalizeExpenseReport } from "../src/apps/report-app/normalize-expense.js";
import { normalizeSummaryReport } from "../src/apps/report-app/normalize-summary.js";
import { normalizeWeeklyReport } from "../src/apps/report-app/normalize-weekly.js";

const RANGE = {
    dateRangeStart: "2026-08-03T00:00:00.000Z",
    dateRangeEnd: "2026-08-10T00:00:00.000Z",
    timeZone: "Europe/Belgrade",
};

describe("Reports App model normalization", () => {
    it("flattens summary hierarchy, bounds the chart, and ignores donutChart", () => {
        const groupOne = Array.from({ length: 14 }, (_, parent) => ({
            id: `parent-${parent}`,
            name: `Parent ${parent}`,
            duration: 10_000 - parent,
            children: Array.from({ length: 8 }, (_, child) => ({
                id: `child-${parent}-${child}`,
                name: `Child ${child}`,
                duration: child,
            })),
        }));
        const model = normalizeSummaryReport(
            {
                groupOne,
                groupTotals: { groupOneTotalCount: 14 },
                totals: [{ totalTime: 123_456, totalBillableTime: 100_000, entriesCount: 88 }],
                donutChart: [{ unsafe: "untyped chart data" }],
            },
            { ...RANGE, groups: ["PROJECT", "TASK"] },
        );

        expect(model.kind).toBe("summary");
        if (model.view.kind !== "summary") throw new Error("Expected summary view");
        expect(model.view.rows).toHaveLength(100);
        expect(model.view.chart).toHaveLength(13);
        expect(model.view.chart.at(-1)).toMatchObject({ label: "Other", aggregated: true });
        expect(model.view.topLevelAvailable).toBe(14);
        expect(JSON.stringify(model)).not.toContain("donutChart");
        expect(model.query).toMatchObject(RANGE);
        expect(reportsAppModelBytes(model)).toBeLessThanOrEqual(64 * 1_024);
    });

    it("normalizes both detailed spellings and prunes optional text and tags before rows", () => {
        const huge = "四".repeat(400);
        const entries = Array.from({ length: 50 }, (_, index) => ({
            ...(index === 0 ? { get_id: "legacy-entry-id" } : { id: `entry-${index}` }),
            description: huge,
            projectName: huge,
            projectColor: index === 0 ? "#2E756B" : "not-a-color",
            userName: `Person ${index}`,
            userEmail: `${huge}@example.test`,
            timeInterval: {
                start: `2026-08-03T0${index % 9}:00:00+02:00`,
                end: `2026-08-03T0${index % 9}:30:00+02:00`,
                duration: 1_800,
            },
            tags: Array.from({ length: 30 }, (_, tag) => ({ id: `${index}-${tag}`, name: huge })),
        }));

        const lower = normalizeDetailedReport(
            { timeentries: entries, totals: [{ entriesCount: 50, totalTime: 90_000 }] },
            { ...RANGE, page: 21, pageSize: 50 },
        );
        const camel = normalizeDetailedReport(
            { timeEntries: entries, totals: [{ entriesCount: 50, totalTime: 90_000 }] },
            { ...RANGE, page: 21, pageSize: 50 },
        );

        expect(lower).toEqual(camel);
        if (lower.view.kind !== "detailed") throw new Error("Expected detailed view");
        expect(lower.view.rows).toHaveLength(50);
        expect(lower.view.rows[0]?.id).toBe("legacy-entry-id");
        expect(lower.view.rows[0]?.start).toBe("2026-08-03T00:00:00+02:00");
        expect(lower.query).toMatchObject({ page: 21, pageSize: 50 });
        expect(lower.view.paging).toMatchObject({ page: 21, pageSize: 50 });
        expect(lower.query.timeZone).toBe("Europe/Belgrade");
        expect(lower.limits.truncated).toBe(true);
        expect(lower.warnings.join(" ")).toMatch(/pruned before rows/i);
        expect(reportsAppModelBytes(lower)).toBeLessThanOrEqual(64 * 1_024);
        expect(
            lower.view.rows.every(
                (row) =>
                    Buffer.byteLength(row.description, "utf8") <= 512 &&
                    row.tags.length <= 20 &&
                    row.tags.every((tag) => Buffer.byteLength(tag.name, "utf8") <= 256),
            ),
        ).toBe(true);
    });

    it("produces an exact seven-day weekly grid with bounded groups and absent users", () => {
        const model = normalizeWeeklyReport(
            {
                totalsByDay: [
                    { date: "2026-08-03", duration: 3_600 },
                    { date: "2026-08-04", duration: 7_200 },
                ],
                groupOne: Array.from({ length: 60 }, (_, index) => ({
                    id: `group-${index}`,
                    name: `Group ${index}`,
                    duration: index * 60,
                    days: [{ date: "2026-08-03", duration: index }],
                })),
                usersWithoutTime: Array.from({ length: 30 }, (_, index) => ({
                    id: `user-${index}`,
                    name: `User ${index}`,
                    email: `user-${index}@example.test`,
                })),
            },
            { ...RANGE, group: "USER" },
        );

        if (model.view.kind !== "weekly") throw new Error("Expected weekly view");
        expect(model.view.days.map((day) => day.date)).toEqual([
            "2026-08-03",
            "2026-08-04",
            "2026-08-05",
            "2026-08-06",
            "2026-08-07",
            "2026-08-08",
            "2026-08-09",
        ]);
        expect(model.view.rows).toHaveLength(50);
        expect(model.view.rows.every((row) => row.days.length === 7)).toBe(true);
        expect(model.view.usersWithoutTime).toHaveLength(25);
        expect(model.warnings.join(" ")).toMatch(/users without time were omitted/i);
        expect(model.limits.truncated).toBe(true);
    });

    it("does not positionally assign unknown or malformed day totals", () => {
        const model = normalizeWeeklyReport(
            {
                totalsByDay: [
                    { date: "2099-01-01", duration: 9_999 },
                    { date: "2026-08-03-invalid", duration: 8_888 },
                    { date: "2026-08-04", duration: 7_200 },
                ],
            },
            { ...RANGE, group: "USER" },
        );

        if (model.view.kind !== "weekly") throw new Error("Expected weekly view");
        expect(model.view.days[0]).toMatchObject({
            date: "2026-08-03",
            durationSeconds: null,
            amount: null,
        });
        expect(model.view.days[1]).toMatchObject({
            date: "2026-08-04",
            durationSeconds: 7_200,
        });
        expect(model.warnings).toContain(BUDGET_WARNINGS.weeklyDays);
    });

    it("aligns weekly date extraction with accepted Clockify timestamp variants", () => {
        const model = normalizeWeeklyReport(
            {
                totalsByDay: [{ date: "2026-08-03t00:00:00Z", duration: 3_600 }],
            },
            {
                dateRangeStart: "2026-08-03t00:00:00Z",
                dateRangeEnd: "2026-08-10t00:00:00Z",
                group: "USER",
            },
        );

        if (model.view.kind !== "weekly") throw new Error("Expected weekly view");
        expect(model.view.days[0]).toMatchObject({
            date: "2026-08-03",
            durationSeconds: 3_600,
        });
        expect(model.warnings).not.toContain(BUDGET_WARNINGS.weeklyDays);
    });

    it("rejects malformed group-day timestamps and keeps canonical day labels", () => {
        const model = normalizeWeeklyReport(
            {
                groupOne: [
                    {
                        id: "one",
                        name: "One",
                        days: [
                            { date: "2026-08-03Tnot-a-time", duration: 123 },
                            { date: "2026-08-03T24:00:00Z", duration: 234 },
                            { date: "2026-08-03T00:00", duration: 345 },
                            { date: "2026-08-03T00:00:00.1234567890Z", duration: 345 },
                            { date: "2026-08-03t00:00:00Z", duration: 456 },
                        ],
                    },
                ],
            },
            { ...RANGE, group: "USER" },
        );

        if (model.view.kind !== "weekly") throw new Error("Expected weekly view");
        expect(model.view.rows[0]?.days[0]).toMatchObject({
            date: "2026-08-03",
            durationSeconds: 456,
        });
        expect(model.warnings).toContain(BUDGET_WARNINGS.weeklyDays);
    });

    it("omits valid group days outside the requested week", () => {
        const model = normalizeWeeklyReport(
            {
                groupOne: [
                    {
                        id: "one",
                        name: "One",
                        days: [
                            { date: "2099-01-01", duration: 999 },
                            { date: "2026-08-03", duration: 123 },
                        ],
                    },
                ],
            },
            { ...RANGE, group: "USER" },
        );

        if (model.view.kind !== "weekly") throw new Error("Expected weekly view");
        expect(model.view.rows[0]?.days[0]).toMatchObject({ durationSeconds: 123 });
        expect(model.warnings).toContain(BUDGET_WARNINGS.weeklyDays);
    });

    it("does not reuse malformed group days for synthetic weekly labels", () => {
        const model = normalizeWeeklyReport(
            {
                groupOne: [
                    {
                        id: "one",
                        name: "One",
                        days: [{ date: "not-a-date", duration: 123 }],
                    },
                ],
            },
            { dateRangeStart: "not-a-date", dateRangeEnd: "also-not-a-date", group: "USER" },
        );

        if (model.view.kind !== "weekly") throw new Error("Expected weekly view");
        expect(model.view.rows[0]?.days).toHaveLength(7);
        expect(model.view.rows[0]?.days.every((day) => day.durationSeconds === null)).toBe(true);
    });

    it("does not roll an impossible requested start date into a different week", () => {
        const model = normalizeWeeklyReport(
            {
                totalsByDay: [{ date: "2026-03-02", duration: 123 }],
                groupOne: [
                    {
                        id: "one",
                        name: "One",
                        days: [{ date: "2026-03-02", duration: 123 }],
                    },
                ],
            },
            {
                dateRangeStart: "2026-02-30T00:00:00Z",
                dateRangeEnd: "2026-03-09T00:00:00Z",
                group: "USER",
            },
        );

        if (model.view.kind !== "weekly") throw new Error("Expected weekly view");
        expect(model.view.days.map((day) => day.date)).toEqual([
            "day-1",
            "day-2",
            "day-3",
            "day-4",
            "day-5",
            "day-6",
            "day-7",
        ]);
        expect(model.view.rows[0]?.days.every((day) => day.durationSeconds === null)).toBe(true);
    });

    it("uses synthetic labels when a seven-day grid would leave the four-digit date range", () => {
        const model = normalizeWeeklyReport(
            {},
            {
                dateRangeStart: "9999-12-29T00:00:00.000Z",
                dateRangeEnd: "10000-01-05T00:00:00.000Z",
                group: "USER",
            },
        );

        if (model.view.kind !== "weekly") throw new Error("Expected weekly view");
        expect(model.view.days.map((day) => day.date)).toEqual([
            "day-1",
            "day-2",
            "day-3",
            "day-4",
            "day-5",
            "day-6",
            "day-7",
        ]);
    });

    it("fails closed on sparse weekly response arrays", () => {
        const groupOne = new Array<ClockifyApi.GroupOneDto>(2);
        groupOne[1] = { id: "group", name: "Group" };
        const totalsByDay = new Array<ClockifyApi.DailyTotalDto>(2);
        totalsByDay[1] = { date: "2026-08-03", duration: 1 };
        const usersWithoutTime = new Array<ClockifyApi.UserDto>(2);
        usersWithoutTime[1] = { id: "user", name: "User" };

        for (const response of [{ groupOne }, { totalsByDay }, { usersWithoutTime }]) {
            expect(() => normalizeWeeklyReport(response, { ...RANGE, group: "USER" })).toThrow(
                /sparse entries/u,
            );
        }
    });

    it("fails closed on malformed weekly object entries", () => {
        const malformedTotals = [null] as unknown as ClockifyApi.DailyTotalDto[];
        const malformedUsers = [null] as unknown as ClockifyApi.UserDto[];
        expect(() =>
            normalizeWeeklyReport(
                { totalsByDay: malformedTotals },
                { ...RANGE, group: "USER" },
            ),
        ).toThrow(/totalsByDay.*object/u);
        expect(() =>
            normalizeWeeklyReport(
                { usersWithoutTime: malformedUsers },
                { ...RANGE, group: "USER" },
            ),
        ).toThrow(/usersWithoutTime|object/u);
    });

    it("bounds deeply nested summary groups without relying on call-stack depth", () => {
        let nested: ClockifyApi.GroupOneDto = { id: "leaf", name: "Leaf" };
        for (let depth = 0; depth < 10_000; depth += 1) {
            nested = {
                id: `node-${depth}`,
                name: `Node ${depth}`,
                children: [nested],
            };
        }

        const model = normalizeSummaryReport(
            { groupOne: [nested] },
            { ...RANGE, groups: ["PROJECT"] },
        );

        if (model.view.kind !== "summary") throw new Error("Expected summary view");
        expect(model.view.rows.length).toBeLessThanOrEqual(33);
        expect(model.limits.available).toBeNull();
        expect(model.warnings).toContain(BUDGET_WARNINGS.summaryTraversal);
        expect(reportsAppModelBytes(model)).toBeLessThanOrEqual(64 * 1_024);
    });

    it("bounds summary node and chart scans before rendering large flat responses", () => {
        const model = normalizeSummaryReport(
            {
                groupOne: Array.from({ length: 3_000 }, (_, index) => ({
                    id: `group-${index}`,
                    name: `Group ${index}`,
                    duration: index,
                })),
            },
            { ...RANGE, groups: ["PROJECT"] },
        );

        if (model.view.kind !== "summary") throw new Error("Expected summary view");
        expect(model.view.rows).toHaveLength(100);
        expect(model.view.chart).toHaveLength(13);
        expect(model.view.chart.at(-1)).toMatchObject({
            label: "Other",
            aggregated: true,
            durationSeconds: null,
            amount: null,
        });
        expect(model.limits.available).toBeNull();
        expect(model.warnings).toContain(BUDGET_WARNINGS.summaryTraversal);
        expect(model.warnings).toContain(BUDGET_WARNINGS.chart);
        expect(reportsAppModelBytes(model)).toBeLessThanOrEqual(64 * 1_024);
    });

    it("fails closed on sparse summary group arrays", () => {
        const groups = new Array<ClockifyApi.GroupOneDto>(3);
        groups[0] = { id: "first", name: "First" };
        groups[2] = { id: "third", name: "Third" };

        expect(() =>
            normalizeSummaryReport({ groupOne: groups }, { ...RANGE, groups: ["PROJECT"] }),
        ).toThrow(/group entries must be objects/u);
    });

    it("keeps overflowed chart aggregates unknown instead of emitting Infinity", () => {
        const model = normalizeSummaryReport(
            {
                groupOne: Array.from({ length: 15 }, (_, index) => ({
                    id: `group-${index}`,
                    name: `Group ${index}`,
                    duration: Number.MAX_VALUE,
                })),
            },
            { ...RANGE, groups: ["PROJECT"] },
        );

        if (model.view.kind !== "summary") throw new Error("Expected summary view");
        expect(model.view.chart.at(-1)).toMatchObject({
            label: "Other",
            durationSeconds: null,
            aggregated: true,
        });
        expect(isReportsAppModel(model)).toBe(true);
    });

    it("maps attendance break explicitly, aggregates rendered rows, and omits avatars", () => {
        const entities = Array.from({ length: 55 }, (_, index) => ({
            userId: `user-${index}`,
            userName: `User ${index}`,
            date: `2026-08-${String((index % 7) + 3).padStart(2, "0")}`,
            totalDuration: 28_800,
            break: 1_800,
            overtime: index,
            timeOff: 0,
            hasRunningEntry: index === 0,
            imageUrl: `https://external.example/avatar-${index}.png`,
        }));
        const model = normalizeAttendanceReport({ entities }, { ...RANGE, page: 1, pageSize: 50 });

        if (model.view.kind !== "attendance") throw new Error("Expected attendance view");
        expect(model.view.rows).toHaveLength(50);
        expect(model.view.rows[0]).toMatchObject({ breakSeconds: 1_800, running: true });
        expect(model.view.aggregates.workSeconds).toBe(50 * 28_800);
        expect(model.view.chart).toHaveLength(12);
        expect(JSON.stringify(model)).not.toContain("external.example");
    });

    it("bounds expense rows and current-page chart without inventing money or receipt actions", () => {
        const expenses = Array.from({ length: 55 }, (_, index) => ({
            id: `expense-${index}`,
            date: "2026-08-03T00:00:00.000Z",
            categoryName: `Category ${index % 14}`,
            projectName: `Project ${index}`,
            projectColor: index === 0 ? "#B7682B" : "javascript:red",
            userName: `User ${index}`,
            notes: "Receipt note",
            amount: index + 0.5,
            quantity: 1,
            fileName: `receipt-${index}.pdf`,
        }));
        const model = normalizeExpenseReport(
            {
                expenses,
                totals: { expensesCount: 55, totalAmount: 1_540, totalAmountBillable: 800 },
            },
            { ...RANGE, page: 1, pageSize: 50 },
        );

        if (model.view.kind !== "expense") throw new Error("Expected expense view");
        expect(model.view.rows).toHaveLength(50);
        expect(model.view.chart).toHaveLength(12);
        expect(model.view.chart.at(-1)).toMatchObject({ label: "Other", aggregated: true });
        expect(model.view.rows[0]?.amount).toBe(0.5);
        expect(JSON.stringify(model)).not.toMatch(/currency|download|https?:\/\//iu);
        expect(reportsAppModelBytes(model)).toBeLessThanOrEqual(64 * 1_024);
    });

    it.each([49, 50])(
        "does not claim an exact total for %i-row pages without an upstream count",
        (count) => {
            const paging = { ...RANGE, page: 1, pageSize: 50 };
            const detailed = normalizeDetailedReport(
                {
                    timeEntries: Array.from({ length: count }, (_, index) => ({
                        id: `entry-${index}`,
                        tags: [],
                    })),
                },
                paging,
            );
            const attendance = normalizeAttendanceReport(
                {
                    entities: Array.from({ length: count }, (_, index) => ({
                        userId: "one-user",
                        date: `2026-08-${String((index % 7) + 3).padStart(2, "0")}`,
                    })),
                },
                paging,
            );
            const expense = normalizeExpenseReport(
                {
                    expenses: Array.from({ length: count }, (_, index) => ({
                        id: `expense-${index}`,
                    })),
                },
                paging,
            );

            for (const model of [detailed, attendance, expense]) {
                expect(model.limits).toMatchObject({
                    shown: count,
                    available: null,
                    omitted: null,
                    truncated: count === 50,
                });
                expect(model.totals.entriesCount).toBeNull();
                if (
                    model.view.kind !== "detailed" &&
                    model.view.kind !== "attendance" &&
                    model.view.kind !== "expense"
                ) {
                    throw new Error("Expected a paged report view");
                }
                expect(model.view.paging.mayHaveNext).toBe(count === 50);
            }
        },
    );

    it("receipts amount-total caps as truncation instead of silently slicing", () => {
        const model = normalizeSummaryReport(
            {
                groupOne: [],
                totals: [
                    {
                        amounts: Array.from({ length: 25 }, (_, index) => ({
                            type: "EARNED" as const,
                            value: index,
                        })),
                    },
                ],
            },
            { ...RANGE, groups: ["PROJECT"] },
        );

        expect(model.totals.amounts).toHaveLength(20);
        expect(model.limits.truncated).toBe(true);
        expect(model.warnings).toContain(BUDGET_WARNINGS.totals);
    });

    it("receipts byte-budget removal of totals and ancillary chart data", () => {
        const model = normalizeSummaryReport(
            {
                groupOne: Array.from({ length: 12 }, (_, index) => ({
                    id: `group-${index}`,
                    name: `Group ${index}`,
                    duration: index,
                })),
            },
            { ...RANGE, groups: ["PROJECT"] },
        );
        if (model.view.kind !== "summary") throw new Error("Expected summary view");
        model.totals.amounts = Array.from({ length: 20 }, (_, index) => ({
            type: `TOTAL_${index}`,
            value: index,
        }));
        const firstRow = model.view.rows[0];
        if (!firstRow) throw new Error("Expected a summary row");
        firstRow.path = ["x".repeat(80_000)];

        const fitted = fitReportsAppModel(model, createReportsAppBudget());

        expect(fitted.totals.amounts).toHaveLength(0);
        expect(fitted.view.kind === "summary" ? fitted.view.chart : []).toHaveLength(0);
        expect(fitted.limits.truncated).toBe(true);
        expect(fitted.warnings).toContain(BUDGET_WARNINGS.totals);
        expect(fitted.warnings).toContain(BUDGET_WARNINGS.chart);
        expect(reportsAppModelBytes(fitted)).toBeLessThanOrEqual(64 * 1_024);
    });

    it("receipts byte-budget removal of users without time", () => {
        const model = normalizeWeeklyReport(
            {
                groupOne: [{ id: "one", name: "One", duration: 1 }],
                usersWithoutTime: Array.from({ length: 25 }, (_, index) => ({
                    id: `user-${index}`,
                    name: `User ${index}`,
                    email: `user-${index}@example.test`,
                })),
            },
            { ...RANGE, group: "USER" },
        );
        if (model.view.kind !== "weekly") throw new Error("Expected weekly view");
        const firstRow = model.view.rows[0];
        if (!firstRow) throw new Error("Expected a weekly row");
        firstRow.label = "x".repeat(80_000);

        const fitted = fitReportsAppModel(model, createReportsAppBudget());

        expect(fitted.view.kind === "weekly" ? fitted.view.usersWithoutTime : []).toHaveLength(0);
        expect(fitted.limits.truncated).toBe(true);
        expect(fitted.warnings).toContain(BUDGET_WARNINGS.usersWithoutTime);
        expect(reportsAppModelBytes(fitted)).toBeLessThanOrEqual(64 * 1_024);
    });

    it("prunes attendance date, start, and end fields before primary rows", () => {
        const model = normalizeAttendanceReport(
            {
                entities: Array.from({ length: 50 }, (_, index) => ({
                    userId: `user-${index}`,
                    userName: `User ${index}`,
                    totalDuration: 1,
                })),
            },
            { ...RANGE, page: 1, pageSize: 50 },
        );
        if (model.view.kind !== "attendance") throw new Error("Expected attendance view");
        for (const row of model.view.rows) {
            row.date = "d".repeat(1_000);
            row.startTime = "s".repeat(1_000);
            row.endTime = "e".repeat(1_000);
        }

        const fitted = fitReportsAppModel(model, createReportsAppBudget());

        expect(fitted.view.kind === "attendance" ? fitted.view.rows : []).toHaveLength(50);
        expect(
            fitted.view.kind === "attendance" &&
                fitted.view.rows.some(
                    (row) => row.date === null || row.startTime === null || row.endTime === null,
                ),
        ).toBe(true);
        expect(fitted.warnings).toContain(BUDGET_WARNINGS.optional);
        expect(fitted.limits.truncated).toBe(true);
        expect(reportsAppModelBytes(fitted)).toBeLessThanOrEqual(64 * 1_024);
    });
});
