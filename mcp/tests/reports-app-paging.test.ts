import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { REPORTS_APP_MODEL_META_KEY } from "../src/apps/report-app/constants.js";
import type { ReportsAppModelV1 } from "../src/apps/report-app/model-types.js";
import { isReportsAppModel } from "../src/apps/report-app/model-validation.js";
import { createContext } from "../src/client.js";
import { buildServer } from "../src/server.js";

const RANGE = {
    dateRangeStart: "2026-08-03T00:00:00.000Z",
    dateRangeEnd: "2026-08-10T00:00:00.000Z",
};

type PagedToolName =
    "clockify_reports_detailed" | "clockify_reports_attendance" | "clockify_reports_expense";

type PagedReportKind = "detailed" | "attendance" | "expense";

interface PagedToolSpec {
    name: PagedToolName;
    kind: PagedReportKind;
    arguments: (page: number, pageSize: number) => Record<string, unknown>;
    response: (prefix: string, count: number, total: number) => Record<string, unknown>;
}

interface PagingCase {
    label: string;
    page: number;
    pageSize: number;
    originalRows: number;
    canonicalRows: number;
    total: number;
    canonicalPage: number;
}

const PAGED_TOOLS: PagedToolSpec[] = [
    {
        name: "clockify_reports_detailed",
        kind: "detailed",
        arguments: (page, pageSize) => ({
            ...RANGE,
            detailedFilter: { page, pageSize },
        }),
        response: (prefix, count, total) => ({
            timeEntries: Array.from({ length: count }, (_, index) => ({
                id: `${prefix}-entry-${index}`,
                description: `Entry ${index}`,
                timeInterval: {
                    start: "2026-08-03T08:00:00.000Z",
                    end: "2026-08-03T08:01:00.000Z",
                    duration: 60,
                },
                tags: [],
            })),
            totals: [{ entriesCount: total, totalTime: total * 60 }],
        }),
    },
    {
        name: "clockify_reports_attendance",
        kind: "attendance",
        arguments: (page, pageSize) => ({
            ...RANGE,
            attendanceFilter: { page, pageSize },
        }),
        response: (prefix, count) => ({
            entities: Array.from({ length: count }, (_, index) => ({
                userId: `${prefix}-user-${index}`,
                userName: `User ${index}`,
                totalDuration: 60,
                break: 10,
                overtime: 5,
                timeOff: 0,
            })),
        }),
    },
    {
        name: "clockify_reports_expense",
        kind: "expense",
        arguments: (page, pageSize) => ({ ...RANGE, page, pageSize }),
        response: (prefix, count, total) => ({
            expenses: Array.from({ length: count }, (_, index) => ({
                id: `${prefix}-expense-${index}`,
                date: "2026-08-03T00:00:00.000Z",
                categoryName: "Travel",
                projectName: "Project",
                userName: `User ${index}`,
                notes: `Expense ${index}`,
                amount: index + 1,
            })),
            totals: {
                expensesCount: total,
                totalAmount: total * 100,
                totalAmountBillable: total * 50,
            },
        }),
    },
];

const PAGING_CASES: PagingCase[] = [
    {
        label: "below 50",
        page: 2,
        pageSize: 10,
        originalRows: 10,
        canonicalRows: 50,
        total: 100,
        canonicalPage: 1,
    },
    {
        label: "above 50",
        page: 2,
        pageSize: 100,
        originalRows: 75,
        canonicalRows: 55,
        total: 175,
        canonicalPage: 3,
    },
];

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
    teardown = async () => {};
});

describe("Reports App canonical paging integration", () => {
    for (const tool of PAGED_TOOLS) {
        describe(tool.name, () => {
            it.each(PAGING_CASES)(
                "keeps the $label caller page in the receipt and builds App meta from a canonical refetch",
                async (pagingCase) => {
                    const original = tool.response(
                        `${pagingCase.label}-original`,
                        pagingCase.originalRows,
                        pagingCase.total,
                    );
                    const canonical = tool.response(
                        `${pagingCase.label}-canonical`,
                        pagingCase.canonicalRows,
                        pagingCase.total,
                    );
                    const mock = reportFetch([original, canonical]);
                    const client = await connect(mock.fetch);

                    const result = await client.callTool({
                        name: tool.name,
                        arguments: tool.arguments(pagingCase.page, pagingCase.pageSize),
                    });

                    expect(result.isError).toBeFalsy();
                    expect(result.structuredContent).toMatchObject({ data: original });
                    expect(mock.requests).toHaveLength(2);
                    expectPagingRequest(
                        mock.requests[0],
                        tool.name,
                        pagingCase.page,
                        pagingCase.pageSize,
                    );
                    expectPagingRequest(mock.requests[1], tool.name, pagingCase.canonicalPage, 50);

                    const model = reportsAppModel(result._meta?.[REPORTS_APP_MODEL_META_KEY]);
                    expect(model.sourceTool).toBe(tool.name);
                    expect(model.kind).toBe(tool.kind);
                    const view = pagedView(model);
                    expect(view.rows).toHaveLength(Math.min(pagingCase.canonicalRows, 50));
                    expect(model.limits.shown).toBe(Math.min(pagingCase.canonicalRows, 50));
                    expect(view.paging).toEqual({
                        page: pagingCase.canonicalPage,
                        pageSize: 50,
                        returned: Math.min(pagingCase.canonicalRows, 50),
                        mayHaveNext: pagingCase.canonicalRows >= 50,
                    });
                    expect(firstRowIdentity(model)).toContain(`${pagingCase.label}-canonical`);
                    expect(firstRowIdentity(model)).not.toContain("original");
                    if (model.view.kind === "attendance") {
                        expect(model.view.aggregates).toMatchObject({
                            users: Math.min(pagingCase.canonicalRows, 50),
                            workSeconds: Math.min(pagingCase.canonicalRows, 50) * 60,
                        });
                    }
                },
            );

            it("preserves the original success receipt when the canonical App refetch fails", async () => {
                const original = tool.response("original", 10, 100);
                const mock = reportFetch([original, new Error("canonical refetch failed")]);
                const client = await connect(mock.fetch);

                const result = await client.callTool({
                    name: tool.name,
                    arguments: tool.arguments(2, 10),
                });

                expect(result.isError).toBeFalsy();
                expect(result.structuredContent).toMatchObject({ data: original });
                expect(result._meta?.[REPORTS_APP_MODEL_META_KEY]).toBeUndefined();
                expect(mock.requests).toHaveLength(2);
                expectPagingRequest(mock.requests[0], tool.name, 2, 10);
                expectPagingRequest(mock.requests[1], tool.name, 1, 50);
            });

            it("propagates cancellation from the canonical App refetch", async () => {
                const original = tool.response("original", 10, 100);
                let canonicalStartedResolve: (() => void) | undefined;
                const canonicalStarted = new Promise<void>((resolve) => {
                    canonicalStartedResolve = resolve;
                });
                let calls = 0;
                const mockFetch: typeof fetch = async (input, init) => {
                    calls += 1;
                    if (calls === 1) {
                        return new Response(JSON.stringify(original), {
                            status: 200,
                            headers: { "content-type": "application/json" },
                        });
                    }
                    const signal = init?.signal ??
                        (input instanceof Request ? input.signal : undefined);
                    canonicalStartedResolve?.();
                    return await new Promise<Response>((_resolve, reject) => {
                        const abort = (): void => {
                            reject(new DOMException("cancelled", "AbortError"));
                        };
                        if (signal?.aborted) abort();
                        else signal?.addEventListener("abort", abort, { once: true });
                    });
                };
                const client = await connect(mockFetch);
                const controller = new AbortController();
                const pending = client.callTool(
                    {
                        name: tool.name,
                        arguments: tool.arguments(2, 10),
                    },
                    undefined,
                    { signal: controller.signal },
                );

                await canonicalStarted;
                controller.abort("cancelled App refetch");

                await expect(pending).rejects.toThrow(/cancelled App refetch/);
                expect(calls).toBe(2);
            });
        });
    }
});

function reportFetch(responses: readonly unknown[]): {
    fetch: typeof fetch;
    requests: Array<Record<string, unknown>>;
} {
    const requests: Array<Record<string, unknown>> = [];
    const mockFetch: typeof fetch = async (input, init) => {
        const request = new Request(input, init);
        const body: unknown = JSON.parse(await request.text());
        if (!isRecord(body)) throw new Error("Expected a JSON object request body.");
        requests.push(body);

        const response = responses[requests.length - 1];
        if (response === undefined) throw new Error("Unexpected report request.");
        if (response instanceof Error) throw response;
        return new Response(JSON.stringify(response), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    };
    return { fetch: mockFetch, requests };
}

async function connect(mockFetch: typeof fetch): Promise<Client> {
    const server = buildServer(
        createContext({
            apiKey: "test-api-key",
            workspaceId: "ws-1",
            environment: "http://127.0.0.1:3115/v1",
            fetch: mockFetch,
        }),
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "reports-app-paging-test", version: "0.0.0" });
    await client.connect(clientTransport);
    teardown = async () => {
        await client.close();
        await server.close();
    };
    return client;
}

function expectPagingRequest(
    request: Record<string, unknown> | undefined,
    tool: PagedToolName,
    page: number,
    pageSize: number,
): void {
    expect(request).toMatchObject(RANGE);
    if (tool === "clockify_reports_detailed") {
        expect(request).toMatchObject({ detailedFilter: { page, pageSize } });
        return;
    }
    if (tool === "clockify_reports_attendance") {
        expect(request).toMatchObject({ attendanceFilter: { page, pageSize } });
        return;
    }
    expect(request).toMatchObject({ page, pageSize });
}

function reportsAppModel(value: unknown): ReportsAppModelV1 {
    if (!isReportsAppModel(value)) throw new Error("Expected Reports App model metadata.");
    return value;
}

function pagedView(model: ReportsAppModelV1) {
    if (
        model.view.kind === "detailed" ||
        model.view.kind === "attendance" ||
        model.view.kind === "expense"
    ) {
        return model.view;
    }
    throw new Error(`Expected a paged report view, received ${model.view.kind}.`);
}

function firstRowIdentity(model: ReportsAppModelV1): string {
    if (model.view.kind === "detailed") return model.view.rows[0]?.id ?? "";
    if (model.view.kind === "attendance") return model.view.rows[0]?.userId ?? "";
    if (model.view.kind === "expense") return model.view.rows[0]?.id ?? "";
    throw new Error(`Expected a paged report view, received ${model.view.kind}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
