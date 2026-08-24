import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { REPORTS_APP_MODEL_META_KEY } from "../src/apps/report-app/constants.js";
import type { Context } from "../src/client.js";
import { successResult } from "../src/result.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

// Capture each report request so we can assert the workspace, body, and merged
// `extra` reach the SDK; the returned payload is echoed back as the receipt data.
function reportsContext(
    captured: Record<string, unknown>,
    responses: Record<string, unknown> = {},
): Context {
    const capture = (method: string) => async (req: unknown) => {
        if (!(method in captured)) captured[method] = req;
        return method in responses ? responses[method] : { method, ...record(req) };
    };
    return {
        workspaceId: "ws-1",
        client: {
            reports: {
                summary: capture("summary"),
                detailed: capture("detailed"),
                weekly: capture("weekly"),
                attendance: capture("attendance"),
            },
            expenseReport: {
                generateDetailedReportV1: capture("expense"),
            },
        } as Context["client"],
    };
}

function record(value: unknown): Record<string, unknown> {
    return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function connect(ctx: Context): Promise<Client> {
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "test-harness", version: "0.0.0" });
    await client.connect(clientTransport);
    teardown = async () => {
        await client.close();
        await server.close();
    };
    return client;
}

function envelope(res: unknown): Record<string, unknown> {
    const text = (res as { content: Array<{ text: string }> }).content[0]?.text ?? "{}";
    return JSON.parse(text) as Record<string, unknown>;
}

describe("reports tools", () => {
    it("registers the five report tools as read-only", async () => {
        const client = await connect(reportsContext({}));
        const tools = (await client.listTools()).tools.filter((tool) =>
            tool.name.startsWith("clockify_reports_"),
        );
        expect(tools.map((tool) => tool.name).sort()).toEqual([
            "clockify_reports_attendance",
            "clockify_reports_detailed",
            "clockify_reports_expense",
            "clockify_reports_summary",
            "clockify_reports_weekly",
        ]);
        expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
        for (const tool of tools) {
            const properties = tool.inputSchema.properties as Record<
                string,
                {
                    enum?: string[];
                    properties?: Record<string, { maximum?: number }>;
                }
            >;
            expect(properties.exportType?.enum).toEqual(["JSON", "JSON_V1"]);
        }

        for (const [toolName, filterName] of [
            ["clockify_reports_detailed", "detailedFilter"],
            ["clockify_reports_attendance", "attendanceFilter"],
        ] as const) {
            const tool = tools.find((candidate) => candidate.name === toolName);
            const properties = tool?.inputSchema.properties as
                Record<string, { properties?: Record<string, { maximum?: number }> }> | undefined;
            expect(properties?.[filterName]?.properties?.pageSize?.maximum).toBe(1_000);
        }
    });

    it("clockify_reports_summary passes workspace, core, and filter through with no change set", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(reportsContext(captured));
        const res = await client.callTool({
            name: "clockify_reports_summary",
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00Z",
                dateRangeEnd: "2026-06-30T23:59:59Z",
                summaryFilter: { groups: ["PROJECT"] },
            },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.summary).toEqual({
            workspaceId: "ws-1",
            dateRangeStart: "2026-06-01T00:00:00Z",
            dateRangeEnd: "2026-06-30T23:59:59Z",
            summaryFilter: { groups: ["PROJECT"] },
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect(json.changed).toBeUndefined();
        expect(json.entity).toBe("report");
        const expectedData = {
            method: "summary",
            workspaceId: "ws-1",
            dateRangeStart: "2026-06-01T00:00:00Z",
            dateRangeEnd: "2026-06-30T23:59:59Z",
            summaryFilter: { groups: ["PROJECT"] },
        };
        expect(json.data).toEqual(expectedData);
        expect(res.structuredContent).toMatchObject({ data: expectedData });
        expect(res._meta?.[REPORTS_APP_MODEL_META_KEY]).toMatchObject({
            version: 1,
            sourceTool: "clockify_reports_summary",
            kind: "summary",
        });
    });

    it("clockify_reports_summary accepts the live TAG grouping", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(reportsContext(captured));
        const res = await client.callTool({
            name: "clockify_reports_summary",
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00Z",
                dateRangeEnd: "2026-06-30T23:59:59Z",
                summaryFilter: { groups: ["TAG"] },
            },
        });

        expect(res.isError).toBeFalsy();
        expect(captured.summary).toMatchObject({ summaryFilter: { groups: ["TAG"] } });
    });

    it("rejects non-JSON exports before they reach the JSON receipt path", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(reportsContext(captured));
        for (const exportType of ["CSV", "PDF", "XLSX", "ZIP"]) {
            const res = await client.callTool({
                name: "clockify_reports_detailed",
                arguments: {
                    dateRangeStart: "2026-06-01T00:00:00Z",
                    dateRangeEnd: "2026-06-30T23:59:59Z",
                    exportType,
                    detailedFilter: { page: 1, pageSize: 50 },
                },
            });

            expect(res.isError).toBe(true);
            expect(captured.detailed).toBeUndefined();
        }
    });

    it.each([
        ["clockify_reports_detailed", "detailedFilter", "detailed"],
        ["clockify_reports_attendance", "attendanceFilter", "attendance"],
    ] as const)(
        "%s rejects an oversized page before the SDK call",
        async (name, filter, captureKey) => {
            const captured: Record<string, unknown> = {};
            const client = await connect(reportsContext(captured));
            const res = await client.callTool({
                name,
                arguments: {
                    dateRangeStart: "2026-06-01T00:00:00Z",
                    dateRangeEnd: "2026-06-30T23:59:59Z",
                    [filter]: { page: 1, pageSize: 1_001 },
                },
            });

            expect(res.isError).toBe(true);
            expect(captured[captureKey]).toBeUndefined();
        },
    );

    it("clockify_reports_detailed merges extra fields into the SDK request", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(reportsContext(captured));
        const res = await client.callTool({
            name: "clockify_reports_detailed",
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00Z",
                dateRangeEnd: "2026-06-30T23:59:59Z",
                detailedFilter: { page: 1, pageSize: 50 },
                extra: { rounding: true, users: { ids: ["u-1"] } },
            },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.detailed).toEqual({
            workspaceId: "ws-1",
            dateRangeStart: "2026-06-01T00:00:00Z",
            dateRangeEnd: "2026-06-30T23:59:59Z",
            detailedFilter: { page: 1, pageSize: 50 },
            rounding: true,
            users: { ids: ["u-1"] },
        });
        expect(envelope(res).ok).toBe(true);
    });

    it("clockify_reports_weekly and clockify_reports_attendance reach their SDK methods", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(reportsContext(captured));
        await client.callTool({
            name: "clockify_reports_weekly",
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00.000Z",
                dateRangeEnd: "2026-06-07T23:59:59.999Z",
                weeklyFilter: { group: "USER", subgroup: "TIME" },
            },
        });
        await client.callTool({
            name: "clockify_reports_attendance",
            arguments: {
                dateRangeStart: "s",
                dateRangeEnd: "e",
                attendanceFilter: { page: 1 },
                extra: { users: { ids: ["u-1"] } },
            },
        });
        expect(captured.weekly).toMatchObject({
            workspaceId: "ws-1",
            weeklyFilter: { group: "USER", subgroup: "TIME" },
        });
        expect(captured.attendance).toMatchObject({
            workspaceId: "ws-1",
            attendanceFilter: { page: 1 },
            users: { ids: ["u-1"] },
        });
    });

    it("accepts the live exclusive seven-day weekly boundary", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(reportsContext(captured));
        const res = await client.callTool({
            name: "clockify_reports_weekly",
            arguments: {
                dateRangeStart: "2026-07-27T00:00:00.000Z",
                dateRangeEnd: "2026-08-03T00:00:00.000Z",
                weeklyFilter: { group: "USER", subgroup: "TIME" },
            },
        });

        expect(res.isError).toBeFalsy();
        expect(captured.weekly).toMatchObject({
            dateRangeStart: "2026-07-27T00:00:00.000Z",
            dateRangeEnd: "2026-08-03T00:00:00.000Z",
        });
    });

    it("rejects protected date/filter/workspace overrides before the SDK call", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(reportsContext(captured));
        const res = await client.callTool({
            name: "clockify_reports_detailed",
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00Z",
                dateRangeEnd: "2026-06-30T23:59:59Z",
                detailedFilter: { page: 1, pageSize: 50 },
                extra: {
                    workspaceId: "attacker-workspace",
                    dateRangeStart: "attacker-start",
                    detailedFilter: { page: 999 },
                },
            },
        });

        expect(res.isError).toBe(true);
        expect(captured.detailed).toBeUndefined();
    });

    it("rejects weekly ranges that are not exactly seven calendar days", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(reportsContext(captured));
        const res = await client.callTool({
            name: "clockify_reports_weekly",
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00.000Z",
                dateRangeEnd: "2026-06-30T23:59:59.999Z",
                weeklyFilter: { group: "USER", subgroup: "TIME" },
            },
        });

        expect(res.isError).toBe(true);
        expect(captured.weekly).toBeUndefined();
    });

    it("rejects timestamps that merely touch seven UTC calendar dates", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(reportsContext(captured));
        const res = await client.callTool({
            name: "clockify_reports_weekly",
            arguments: {
                dateRangeStart: "2026-07-01T23:00:00.000Z",
                dateRangeEnd: "2026-07-07T00:00:00.000Z",
                weeklyFilter: { group: "USER", subgroup: "TIME" },
            },
        });

        expect(res.isError).toBe(true);
        expect(captured.weekly).toBeUndefined();
    });

    it("rejects invalid operation-specific extra field types locally", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(reportsContext(captured));
        const res = await client.callTool({
            name: "clockify_reports_summary",
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00Z",
                dateRangeEnd: "2026-06-30T23:59:59Z",
                summaryFilter: { groups: ["PROJECT"] },
                extra: { rounding: "yes" },
            },
        });

        expect(res.isError).toBe(true);
        expect(captured.summary).toBeUndefined();
    });

    it("uses explicit protected pagination for expense reports", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(reportsContext(captured));
        const res = await client.callTool({
            name: "clockify_reports_expense",
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00Z",
                dateRangeEnd: "2026-06-30T23:59:59Z",
                page: 2,
                pageSize: 25,
                extra: { billable: false, note: "taxi" },
            },
        });

        expect(res.isError).toBeFalsy();
        expect(captured.expense).toEqual({
            workspaceId: "ws-1",
            dateRangeStart: "2026-06-01T00:00:00Z",
            dateRangeEnd: "2026-06-30T23:59:59Z",
            page: 2,
            pageSize: 25,
            billable: false,
            note: "taxi",
        });
    });
    // --- every optional filter, forwarded ---------------------------------
    // The report tools map 25+ optional fields through `x !== undefined ? {x}
    // : {}` spreads. The tests above only ever exercise the `undefined` side,
    // so a mapping that silently dropped a field would pass all of them --
    // exactly the failure mode that made the CLI/MCP `--public` flag a no-op
    // when SharedReport's wire field turned out to be `isPublic`. These
    // populate EVERY optional and assert the whole body arrives intact.

    const archived = { contains: "CONTAINS", ids: ["id-1"], status: "ACTIVE" } as const;
    const usersF = { contains: "CONTAINS", ids: ["u-1"], status: "ACTIVE" } as const;
    const customField = {
        id: "cf-1",
        isEmpty: false,
        numberCondition: "EQUAL",
        type: "NUMBER",
        value: 7,
    } as const;

    const fullCommonExtra = {
        amountShown: "EARNED",
        amounts: ["EARNED", "COST"],
        approvalState: "APPROVED",
        archived: false,
        billable: true,
        clients: archived,
        currency: archived,
        customFields: [customField],
        dateFormat: "DD/MM/YYYY",
        description: "sprint work",
        invoicingState: "UNINVOICED",
        projects: archived,
        rounding: true,
        sortOrder: "DESCENDING",
        tags: { ...archived, containedInTimeentry: "CONTAINS_ONLY" },
        tasks: archived,
        timeFormat: "HOUR24",
        timeZone: "Europe/Belgrade",
        userCustomFields: [customField],
        userGroups: usersF,
        userLocale: "en_GB",
        users: usersF,
        weekStart: "MONDAY",
        withoutDescription: false,
        zoomLevel: "MONTH",
    } as const;

    // What commonReportFields() should produce from fullCommonExtra: the same
    // values, with the nested filters normalised through their own mappers.
    const fullCommonMapped = { ...fullCommonExtra };

    it("clockify_reports_summary forwards every optional common field and filter", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(reportsContext(captured));
        const res = await client.callTool({
            name: "clockify_reports_summary",
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00Z",
                dateRangeEnd: "2026-06-30T23:59:59Z",
                dateRangeType: "THIS_MONTH",
                exportType: "JSON",
                extra: fullCommonExtra,
                summaryFilter: {
                    groups: ["PROJECT", "TASK"],
                    sortColumn: "DURATION",
                    summaryChartType: "PROJECT",
                },
            },
        });

        expect(res.isError).toBeFalsy();
        expect(captured.summary).toEqual({
            ...fullCommonMapped,
            workspaceId: "ws-1",
            dateRangeStart: "2026-06-01T00:00:00Z",
            dateRangeEnd: "2026-06-30T23:59:59Z",
            dateRangeType: "THIS_MONTH",
            exportType: "JSON",
            summaryFilter: {
                groups: ["PROJECT", "TASK"],
                sortColumn: "DURATION",
                summaryChartType: "PROJECT",
            },
        });
    });

    it("clockify_reports_detailed forwards every optional detailedFilter branch", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(reportsContext(captured));
        const res = await client.callTool({
            name: "clockify_reports_detailed",
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00Z",
                dateRangeEnd: "2026-06-30T23:59:59Z",
                dateRangeType: "ABSOLUTE",
                exportType: "JSON_V1",
                extra: fullCommonExtra,
                detailedFilter: {
                    auditFilter: {
                        duration: 3600,
                        durationShorter: true,
                        withoutProject: false,
                        withoutTask: true,
                    },
                    options: { totals: "CALCULATE" },
                    page: 3,
                    pageSize: 50,
                    sortColumn: "DATE",
                },
            },
        });

        expect(res.isError).toBeFalsy();
        expect(captured.detailed).toEqual({
            ...fullCommonMapped,
            workspaceId: "ws-1",
            dateRangeStart: "2026-06-01T00:00:00Z",
            dateRangeEnd: "2026-06-30T23:59:59Z",
            dateRangeType: "ABSOLUTE",
            exportType: "JSON_V1",
            detailedFilter: {
                auditFilter: {
                    duration: 3600,
                    durationShorter: true,
                    withoutProject: false,
                    withoutTask: true,
                },
                options: { totals: "CALCULATE" },
                page: 3,
                pageSize: 50,
                sortColumn: "DATE",
            },
        });
    });

    it("clockify_reports_weekly forwards every optional common field", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(reportsContext(captured));
        const res = await client.callTool({
            name: "clockify_reports_weekly",
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00Z",
                dateRangeEnd: "2026-06-07T23:59:59.999Z",
                dateRangeType: "THIS_WEEK",
                exportType: "JSON",
                extra: fullCommonExtra,
                weeklyFilter: { group: "PROJECT", subgroup: "TIME" },
            },
        });

        expect(res.isError).toBeFalsy();
        expect(captured.weekly).toEqual({
            ...fullCommonMapped,
            workspaceId: "ws-1",
            dateRangeStart: "2026-06-01T00:00:00Z",
            dateRangeEnd: "2026-06-07T23:59:59.999Z",
            dateRangeType: "THIS_WEEK",
            exportType: "JSON",
            weeklyFilter: { group: "PROJECT", subgroup: "TIME" },
        });
    });

    it("clockify_reports_attendance forwards every optional attendanceFilter branch and drops userCustomFields", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(reportsContext(captured));
        const compare = [{ filtrationType: "LARGER_THAN", value: "PT1H" }];
        const { userCustomFields: _omitted, ...attendanceExtra } = fullCommonExtra;
        const res = await client.callTool({
            name: "clockify_reports_attendance",
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00Z",
                dateRangeEnd: "2026-06-30T23:59:59Z",
                dateRangeType: "LAST_MONTH",
                exportType: "JSON_V1",
                // attendance omits userCustomFields from its schema entirely,
                // and the schema is .strict() -- so the key must be absent,
                // not merely undefined.
                extra: attendanceExtra,
                attendanceFilter: {
                    breakFilters: compare,
                    capacityFilters: compare,
                    endFilters: compare,
                    hasTimeOff: true,
                    overtimeFilters: compare,
                    page: 2,
                    pageSize: 10,
                    sortColumn: "USER",
                    startFilters: compare,
                    workFilters: compare,
                },
            },
        });

        expect(res.isError).toBeFalsy();
        const body = captured.attendance as Record<string, unknown>;
        // attendanceReportFields strips userCustomFields even if it arrived.
        expect(body).not.toHaveProperty("userCustomFields");
        expect(body.attendanceFilter).toEqual({
            breakFilters: compare,
            capacityFilters: compare,
            endFilters: compare,
            hasTimeOff: true,
            overtimeFilters: compare,
            page: 2,
            pageSize: 10,
            sortColumn: "USER",
            startFilters: compare,
            workFilters: compare,
        });
        expect(body.weekStart).toBe("MONDAY");
        expect(body.tags).toEqual({ ...archived, containedInTimeentry: "CONTAINS_ONLY" });
        expect(body.dateRangeType).toBe("LAST_MONTH");
        expect(body.exportType).toBe("JSON_V1");
    });

    it("clockify_reports_expense forwards every optional expense-report field", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(reportsContext(captured));
        const fullExpenseExtra = {
            approvalState: "ALL",
            billable: true,
            categories: archived,
            clients: archived,
            currency: archived,
            invoicingState: "INVOICED",
            note: "client dinner",
            projects: archived,
            sortColumn: "AMOUNT",
            sortOrder: "ASCENDING",
            tasks: archived,
            timeZone: "Europe/Belgrade",
            userGroups: usersF,
            userLocale: "en_GB",
            users: usersF,
            weekStart: "SUNDAY",
            withoutNote: false,
            zoomLevel: "YEAR",
        } as const;

        const res = await client.callTool({
            name: "clockify_reports_expense",
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00Z",
                dateRangeEnd: "2026-06-30T23:59:59Z",
                page: 1,
                pageSize: 100,
                dateRangeType: "THIS_WEEK",
                exportType: "JSON",
                extra: fullExpenseExtra,
            },
        });

        expect(res.isError).toBeFalsy();
        expect(captured.expense).toEqual({
            ...fullExpenseExtra,
            workspaceId: "ws-1",
            dateRangeStart: "2026-06-01T00:00:00Z",
            dateRangeEnd: "2026-06-30T23:59:59Z",
            page: 1,
            pageSize: 100,
            dateRangeType: "THIS_WEEK",
            exportType: "JSON",
        });
    });

    it("an empty extra object adds no fields to the request body", async () => {
        // Pins the `if (!extra) return {}` guard's sibling path: an extra that
        // is present but empty must still contribute nothing.
        const captured: Record<string, unknown> = {};
        const client = await connect(reportsContext(captured));
        await client.callTool({
            name: "clockify_reports_summary",
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00Z",
                dateRangeEnd: "2026-06-30T23:59:59Z",
                extra: {},
                summaryFilter: { groups: ["PROJECT"] },
            },
        });

        expect(captured.summary).toEqual({
            workspaceId: "ws-1",
            dateRangeStart: "2026-06-01T00:00:00Z",
            dateRangeEnd: "2026-06-30T23:59:59Z",
            summaryFilter: { groups: ["PROJECT"] },
        });
    });

    it("preserves the structured feature-unavailable recovery when no App model exists", async () => {
        const error = new Error("This report requires a higher workspace plan.");
        Object.assign(error, { statusCode: 402 });
        const context: Context = {
            workspaceId: "ws-1",
            client: {
                reports: { summary: async () => Promise.reject(error) },
            } as unknown as Context["client"],
        };
        const client = await connect(context);
        const res = await client.callTool({
            name: "clockify_reports_summary",
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00Z",
                dateRangeEnd: "2026-06-30T23:59:59Z",
                summaryFilter: { groups: ["PROJECT"] },
            },
        });

        expect(res.isError).toBe(true);
        expect(envelope(res)).toMatchObject({
            ok: false,
            error: { code: "feature_unavailable" },
            recovery: { retryable: false },
        });
        expect(res._meta?.[REPORTS_APP_MODEL_META_KEY]).toBeUndefined();
    });

    it.each([
        {
            name: "clockify_reports_summary",
            responseKey: "summary",
            response: { groupOne: "malformed" },
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00Z",
                dateRangeEnd: "2026-06-30T23:59:59Z",
                summaryFilter: { groups: ["PROJECT"] },
            },
        },
        {
            name: "clockify_reports_detailed",
            responseKey: "detailed",
            response: { timeEntries: "malformed" },
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00Z",
                dateRangeEnd: "2026-06-30T23:59:59Z",
                detailedFilter: { page: 1, pageSize: 50 },
            },
        },
        {
            name: "clockify_reports_weekly",
            responseKey: "weekly",
            response: { groupOne: "malformed", totalsByDay: [] },
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00.000Z",
                dateRangeEnd: "2026-06-07T23:59:59.999Z",
                weeklyFilter: { group: "USER", subgroup: "TIME" },
            },
        },
        {
            name: "clockify_reports_attendance",
            responseKey: "attendance",
            response: { entities: "malformed" },
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00Z",
                dateRangeEnd: "2026-06-30T23:59:59Z",
                attendanceFilter: { page: 1, pageSize: 50 },
            },
        },
        {
            name: "clockify_reports_expense",
            responseKey: "expense",
            response: { expenses: "malformed" },
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00Z",
                dateRangeEnd: "2026-06-30T23:59:59Z",
                page: 1,
                pageSize: 50,
            },
        },
    ])(
        "$name preserves its success receipt when App normalization rejects malformed runtime data",
        async ({ name, responseKey, response, arguments: arguments_ }) => {
            const client = await connect(reportsContext({}, { [responseKey]: response }));
            const result = await client.callTool({ name, arguments: arguments_ });
            const expected = successResult(name, response, undefined, {
                entity: "report",
                ...(name === "clockify_reports_summary"
                    ? {
                          next: [
                              {
                                  tool: "clockify_reports_detailed",
                                  reason: "Drill into the time entries behind these totals.",
                              },
                          ],
                      }
                    : {}),
            });

            expect(result.isError).toBeFalsy();
            expect(result.content).toEqual(expected.content);
            expect(result.structuredContent).toEqual(expected.structuredContent);
            expect(result._meta?.[REPORTS_APP_MODEL_META_KEY]).toBeUndefined();
        },
    );
});
