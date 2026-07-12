import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

import {
    buildClientArchiveBody,
    buildProjectArchiveBody,
    buildTaskDoneBody,
    countExactInvoiceNumber,
    entitlementMarker,
    exerciseGuardedLiveWrite,
    isAllowedEntitlementSkip,
    liveObjectName,
    requireLivePrefix,
    runCleanupSteps,
} from "./live-sandbox-support.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
    teardown = async () => {};
    vi.unstubAllEnvs();
});

async function connect(ctx: Context): Promise<Client> {
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "live-sandbox-support-test", version: "0.0.0" });
    await client.connect(clientTransport);
    teardown = async () => {
        await client.close();
        await server.close();
    };
    return client;
}

describe("live sandbox support", () => {
    function toolResult(envelope: Record<string, unknown>): unknown {
        return { content: [{ type: "text", text: JSON.stringify(envelope) }] };
    }

    it("requires the orchestrator prefix and uses it verbatim for every object name", () => {
        expect(() => requireLivePrefix({})).toThrowError(/CLOCKIFY_LIVE_PREFIX/);
        expect(() =>
            requireLivePrefix({
                CLOCKIFY_WORKSPACE_ID: "workspace-1",
                CLOCKIFY_LIVE_WORKSPACE_CONFIRM: "workspace-2",
                CLOCKIFY_LIVE_PREFIX: "clockify115-live-20260712-ab12-",
            }),
        ).toThrowError(/unconfirmed/);
        expect(() =>
            requireLivePrefix({
                CLOCKIFY_WORKSPACE_ID: "workspace-1",
                CLOCKIFY_LIVE_WORKSPACE_CONFIRM: "workspace-1",
                CLOCKIFY_LIVE_PREFIX: "unsafe-prefix-",
            }),
        ).toThrowError(/clockify115-live/);

        const prefix = requireLivePrefix({
            CLOCKIFY_WORKSPACE_ID: "workspace-1",
            CLOCKIFY_LIVE_WORKSPACE_CONFIRM: "workspace-1",
            CLOCKIFY_LIVE_PREFIX: "clockify115-live-20260712-ab12-",
        });
        expect(liveObjectName(prefix, "mcp-tag")).toBe(
            "clockify115-live-20260712-ab12-mcp-tag",
        );
    });

    it("recognizes only feature_unavailable or HTTP 402 as an entitlement limitation", () => {
        expect(
            isAllowedEntitlementSkip({
                ok: false,
                error: { code: "feature_unavailable", message: "upgrade required" },
            }),
        ).toBe(true);
        expect(isAllowedEntitlementSkip({ code: "feature_unavailable" })).toBe(true);
        expect(
            isAllowedEntitlementSkip(
                Object.assign(new Error("Payment Required"), { statusCode: 402 }),
            ),
        ).toBe(true);
        expect(isAllowedEntitlementSkip({ error: { statusCode: 402 } })).toBe(true);
        expect(isAllowedEntitlementSkip({ response: { status: 402 } })).toBe(true);
        expect(entitlementMarker({ statusCode: 402 })).toBe(
            "CLOCKIFY_LIVE_ENTITLEMENT:http_402",
        );
        expect(entitlementMarker({ code: "feature_unavailable" })).toBe(
            "CLOCKIFY_LIVE_ENTITLEMENT:feature_unavailable",
        );

        expect(isAllowedEntitlementSkip({ ok: false, error: { code: "auth_or_permission" } })).toBe(
            false,
        );
        expect(
            isAllowedEntitlementSkip(Object.assign(new Error("Forbidden"), { statusCode: 403 })),
        ).toBe(false);
        expect(
            isAllowedEntitlementSkip(Object.assign(new Error("Not Found"), { statusCode: 404 })),
        ).toBe(false);
    });

    it("reconstructs archive bodies without dropping false, zero, or empty state", () => {
        expect(
            buildClientArchiveBody({
                name: "Client",
                address: "",
                email: "",
                note: "",
                currencyCode: "USD",
                archived: false,
            }),
        ).toEqual({
            name: "Client",
            address: "",
            email: "",
            note: "",
            currencyCode: "USD",
            archived: true,
        });
        expect(
            buildProjectArchiveBody({
                name: "Project",
                archived: false,
                billable: false,
                clientId: "",
                color: "#123456",
                costRate: { amount: 0, currency: "USD" },
                hourlyRate: { amount: 0, currency: "USD" },
                note: "",
                public: false,
            }),
        ).toEqual({
            name: "Project",
            archived: true,
            billable: false,
            clientId: "",
            color: "#123456",
            costRate: { amount: 0 },
            hourlyRate: { amount: 0 },
            isPublic: false,
            note: "",
        });
        expect(
            buildTaskDoneBody({
                name: "Task",
                assigneeId: "",
                assigneeIds: [],
                billable: false,
                budgetEstimate: 0,
                estimate: "",
                status: "ACTIVE",
                userGroupIds: [],
            }),
        ).toEqual({
            name: "Task",
            assigneeId: "",
            assigneeIds: [],
            billable: false,
            budgetEstimate: 0,
            estimate: "",
            status: "DONE",
            userGroupIds: [],
        });
        expect(() => buildClientArchiveBody({ archived: false })).toThrowError(/name/);
        expect(() => buildProjectArchiveBody({ name: "Project" })).toThrowError(/billable/);
        expect(() => buildTaskDoneBody({ name: "Task", status: "ACTIVE" })).toThrowError(
            /billable/,
        );
        expect(() =>
            buildTaskDoneBody({ name: "Task", billable: false, status: "ALL" }),
        ).toThrowError(/status/);
        expect(() => buildTaskDoneBody({ name: "Task", billable: "false" })).toThrowError(
            /billable/,
        );
    });

    it("scans every invoice page for an exact number without fuzzy matches", async () => {
        const pages: unknown[] = [
            {
                invoices: [
                    { id: "i-1", number: "clockify115-live-run-mcp-invoice-old" },
                    { id: "i-2", number: "other" },
                ],
            },
            { invoices: [{ id: "i-3", number: "clockify115-live-run-mcp-invoice" }] },
            { invoices: [] },
        ];
        const requested: number[] = [];

        const count = await countExactInvoiceNumber(
            async (page) => {
                requested.push(page);
                return pages[page - 1];
            },
            "clockify115-live-run-mcp-invoice",
            { pageSize: 2, maxPages: 3 },
        );

        expect(count).toBe(1);
        expect(requested).toEqual([1, 2, 3]);
    });

    it("proves the guarded business-write live sequence offline with blank credentials", async () => {
        vi.stubEnv("CLOCKIFY_API_KEY", "");
        vi.stubEnv("CLOCKIFY_WORKSPACE_ID", "");
        const creates: unknown[] = [];
        const client = await connect({
            workspaceId: "test-workspace",
            client: {
                invoices: {
                    create: async (request: unknown) => {
                        creates.push(request);
                        return { id: "invoice-1", number: "clockify115-live-test-mcp-invoice" };
                    },
                },
            } as never,
        });
        const checkpoints: Array<{ stage: string; mutations: number }> = [];
        let probeCalls = 0;
        const calls: Array<{ name: string; arguments?: Record<string, unknown> }> = [];
        const recordingClient = {
            callTool: async (request: { name: string; arguments?: Record<string, unknown> }) => {
                calls.push(structuredClone(request));
                return client.callTool(request);
            },
        } as Pick<Client, "callTool">;

        const result = await exerciseGuardedLiveWrite(
            recordingClient,
            "clockify_invoices_create",
            {
                clientId: "client-1",
                number: "clockify115-live-test-mcp-invoice",
                currency: "USD",
                issuedDate: "2026-07-12",
                dueDate: "2026-07-19",
            },
            {
                countExactMatches: async () => {
                    probeCalls += 1;
                    return creates.length;
                },
                checkpoint: (stage) => checkpoints.push({ stage, mutations: creates.length }),
            },
        );

        expect(result.outcome).toBe("executed");
        expect(checkpoints).toEqual([
            { stage: "bare_rejected", mutations: 0 },
            { stage: "previewed", mutations: 0 },
        ]);
        expect(probeCalls).toBe(2);
        expect(creates).toEqual([
            {
                workspaceId: "test-workspace",
                body: {
                    clientId: "client-1",
                    number: "clockify115-live-test-mcp-invoice",
                    currency: "USD",
                    issuedDate: "2026-07-12T00:00:00Z",
                    dueDate: "2026-07-19T00:00:00Z",
                },
            },
        ]);
        if (result.outcome !== "executed") throw new Error("expected guarded execution");
        const issuedToken = (result.preview.data as { confirm_token?: string }).confirm_token;
        expect(calls).toHaveLength(3);
        expect(calls[2]?.arguments).toEqual({
            clientId: "client-1",
            number: "clockify115-live-test-mcp-invoice",
            currency: "USD",
            issuedDate: "2026-07-12",
            dueDate: "2026-07-19",
            confirm_token: issuedToken,
        });
        expect(calls[0]?.arguments?.number).toBe(calls[2]?.arguments?.number);
    });

    it("fails a guarded live flow on generic 403 instead of treating it as entitlement", async () => {
        let call = 0;
        const client = {
            callTool: async () => {
                call += 1;
                return call === 1
                    ? toolResult({
                          ok: false,
                          action: "guarded",
                          error: {
                              code: "invalid_input",
                              message: "dry_run confirmation required",
                          },
                      })
                    : toolResult({
                          ok: false,
                          action: "guarded",
                          error: { code: "auth_or_permission", message: "Forbidden" },
                      });
            },
        } as Pick<Client, "callTool">;

        await expect(
            exerciseGuardedLiveWrite(client, "clockify_invoices_create", {
                clientId: "client-1",
                number: "clockify115-live-test-mcp-invoice",
                currency: "USD",
                issuedDate: "2026-07-12",
                dueDate: "2026-07-19",
            }, {
                countExactMatches: async () => 0,
            }),
        ).rejects.toThrowError(/auth_or_permission/);
        expect(call).toBe(2);
    });

    it("blocks token execution when an exact-state probe finds a bare or preview mutation", async () => {
        const bareMutated = {
            callTool: async () =>
                toolResult({
                    ok: false,
                    action: "guarded",
                    error: { code: "invalid_input", message: "dry_run confirmation required" },
                }),
        } as Pick<Client, "callTool">;
        await expect(
            exerciseGuardedLiveWrite(bareMutated, "clockify_invoices_create", {}, {
                countExactMatches: async () => 1,
            }),
        ).rejects.toThrowError(/bare.*exact target count 1/i);

        let call = 0;
        const previewMutated = {
            callTool: async () => {
                call += 1;
                return call === 1
                    ? toolResult({
                          ok: false,
                          action: "guarded",
                          error: {
                              code: "invalid_input",
                              message: "dry_run confirmation required",
                          },
                      })
                    : toolResult({
                          ok: true,
                          action: "guarded",
                          data: { confirm_token: "must-not-execute" },
                      });
            },
        } as Pick<Client, "callTool">;
        const counts = [0, 1];
        await expect(
            exerciseGuardedLiveWrite(previewMutated, "clockify_invoices_create", {}, {
                countExactMatches: async () => counts.shift() ?? 1,
            }),
        ).rejects.toThrowError(/preview.*exact target count 1/i);
        expect(call).toBe(2);
    });

    it("returns a sanitized deterministic receipt after attempting every cleanup step", async () => {
        const calls: string[] = [];
        const secretId = "000000000000000000000123";

        const receipt = await runCleanupSteps([
            {
                entityType: "time_entry",
                idCount: 1,
                cleanup: async () => {
                    calls.push("time_entry");
                },
            },
            {
                entityType: "project",
                idCount: 1,
                cleanup: async () => {
                    calls.push("project");
                    throw new Error(`could not delete ${secretId}`);
                },
            },
            {
                entityType: "tag",
                idCount: 1,
                cleanup: async () => {
                    calls.push("tag");
                },
            },
        ]);

        expect(calls).toEqual(["time_entry", "project", "tag"]);
        expect(receipt).toEqual({
            surface: "mcp",
            resources: [
                { entityType: "time_entry", idCount: 1, deleted: 1, failed: 0, remaining: 0 },
                { entityType: "project", idCount: 1, deleted: 0, failed: 1, remaining: 1 },
                { entityType: "tag", idCount: 1, deleted: 1, failed: 0, remaining: 0 },
            ],
            idCount: 3,
            deleted: 2,
            failed: 1,
            remaining: 1,
        });
        expect(JSON.stringify(receipt)).not.toContain(secretId);
    });
});
