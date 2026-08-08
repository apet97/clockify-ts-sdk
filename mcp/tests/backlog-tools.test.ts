import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

import { callGuarded } from "./guarded-call.js";

/**
 * Behavior tests for the nine tools that closed the ADR 0006 backlog:
 * invoice items and payments, project estimates and templates, workspace
 * settings, and the on-behalf-of time-off request. Each asserts the exact
 * request envelope the guarded execute path sends after a
 * dry_run/confirm_token handshake.
 */

const USER = "aaaaaaaaaaaaaaaaaaaaaaaa";
const POLICY = "cccccccccccccccccccccccc";
const PROJECT = "dddddddddddddddddddddddd";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
    teardown = async () => {};
});

type Calls = Record<string, unknown[]>;

/**
 * How the fake invoice behaves around a payment write. The payment POST answers
 * with the invoice, so the tool recovers the new id by diffing the payments list
 * — these knobs drive the one-new-id, zero-diff, ambiguous-diff, and
 * beyond-page-one cases.
 */
interface PaymentLedger {
    /** Payment ids already recorded on the invoice. */
    existing?: readonly string[];
    /** Payment ids the POST makes appear in the list. */
    adds?: readonly string[];
}

function context(calls: Calls, ledger: PaymentLedger = {}): Context {
    const record =
        (key: string, result?: unknown) =>
        async (request: unknown) => {
            (calls[key] ??= []).push(request);
            return result;
        };
    const payments = [...(ledger.existing ?? [])];
    return {
        workspaceId: "ws-1",
        client: {
            invoiceItems: {
                create: record("itemAdd", { id: "inv-1" }),
                delete: record("itemDelete"),
            },
            invoicePayments: {
                list: async (request: unknown) => {
                    (calls.payList ??= []).push(request);
                    const { page, "page-size": pageSize } = request as {
                        page: number;
                        "page-size": number;
                    };
                    return payments.slice((page - 1) * pageSize, page * pageSize).map((id) => ({ id }));
                },
                create: async (request: unknown) => {
                    (calls.payCreate ??= []).push(request);
                    payments.push(...(ledger.adds ?? ["pay-new"]));
                    return { id: "inv-1", balance: 0 };
                },
                delete: record("payDelete"),
            },
            projects: {
                list: record("projectList", [{ id: PROJECT, name: "Template A" }]),
                updateTemplate: record("templateMark", { id: PROJECT, isTemplate: true }),
                updateEstimate: record("estimate", { id: PROJECT }),
            },
            workspaces: { get: record("workspaceGet", { id: "ws-1", name: "Sandbox" }) },
            timeOffPolicies: { list: async () => [{ id: POLICY, name: "PTO" }] },
            timeOff: { submitForUser: record("timeOffForUser", { id: "to-1" }) },
            users: {
                list: async () => [{ id: USER, name: "Alice", email: "alice@example.com" }],
                getCurrentUser: async () => ({ id: USER }),
            },
        } as never,
    };
}

async function connect(ctx: Context): Promise<Client> {
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "backlog-tools-test", version: "0.0.0" });
    await client.connect(clientTransport);
    teardown = async () => {
        await client.close();
        await server.close();
    };
    return client;
}

function envelope(result: unknown): Record<string, unknown> {
    const text = (result as { content: Array<{ text: string }> }).content[0]?.text ?? "{}";
    return JSON.parse(text) as Record<string, unknown>;
}

describe("invoice line items", () => {
    // `unitPrice` is minor x100 on the wire — the only money field on the API
    // with that scale. Live-probed 2026-08-09: quantity 1 at unitPrice 100000
    // bills amount 1000, so sending plain minor units undercharges by 100x.
    it("scales unitPrice to the item wire value and defaults applyTaxes to NONE", async () => {
        const calls: Calls = {};
        const client = await connect(context(calls));
        const res = await callGuarded(client, {
            name: "clockify_invoices_items_add",
            arguments: {
                invoiceId: "inv-1",
                description: "Consulting",
                itemType: "NEW DEFAULT",
                quantity: 2,
                unitPrice: 15000,
            },
        });
        expect(res.isError).toBeFalsy();
        expect(calls.itemAdd?.[0]).toEqual({
            workspaceId: "ws-1",
            invoiceId: "inv-1",
            body: {
                applyTaxes: "NONE",
                description: "Consulting",
                itemType: "NEW DEFAULT",
                quantity: 2,
                unitPrice: 1500000,
            },
        });
    });

    it("refuses a unitPrice whose wire value would leave the exact-integer envelope", async () => {
        const calls: Calls = {};
        const client = await connect(context(calls));
        const res = await client.callTool({
            name: "clockify_invoices_items_add",
            arguments: {
                invoiceId: "inv-1",
                description: "Too big",
                itemType: "NEW DEFAULT",
                quantity: 1,
                unitPrice: Number.MAX_SAFE_INTEGER,
                dry_run: true,
            },
        });
        expect(res.isError).toBe(true);
        expect(calls.itemAdd).toBeUndefined();
    });

    it("deletes by order and does not mutate on a dry run", async () => {
        const calls: Calls = {};
        const client = await connect(context(calls));
        await client.callTool({
            name: "clockify_invoices_items_delete",
            arguments: { invoiceId: "inv-1", order: 2, dry_run: true },
        });
        expect(calls.itemDelete).toBeUndefined();

        await callGuarded(client, {
            name: "clockify_invoices_items_delete",
            arguments: { invoiceId: "inv-1", order: 2 },
        });
        // `order` binds to a Java int on the wire: a string body reaches the
        // API as a 400 conversion error, so the tool sends a number.
        expect(calls.itemDelete?.[0]).toEqual({
            workspaceId: "ws-1",
            invoiceId: "inv-1",
            order: 2,
        });
    });
});

describe("invoice payments", () => {
    async function recordPayment(calls: Calls, ledger: PaymentLedger = {}) {
        const client = await connect(context(calls, ledger));
        const res = await callGuarded(client, {
            name: "clockify_invoices_payments_create",
            arguments: { invoiceId: "inv-1", amount: 5000 },
        });
        return envelope(res);
    }

    it("omits optional fields that were not given", async () => {
        const calls: Calls = {};
        await recordPayment(calls);
        expect(calls.payCreate?.[0]).toEqual({
            workspaceId: "ws-1",
            invoiceId: "inv-1",
            body: { amount: 5000 },
        });
    });

    // The POST answers with the updated INVOICE, not the payment (live-probed
    // 2026-08-09), so the receipt id has to come from a list diff around the
    // write. Naming the invoice id there points a caller's reconcile or delete
    // at the wrong record.
    it("reports the recovered payment id, not the invoice id", async () => {
        const calls: Calls = {};
        const body = await recordPayment(calls, { existing: ["pay-old"], adds: ["pay-new"] });
        expect(body.data).toMatchObject({ paymentId: "pay-new" });
        expect(body.changed).toEqual({ created: [{ type: "invoice_payment", id: "pay-new" }] });
        expect(calls.payList).toHaveLength(2);
    });

    it("recovers a payment that lands beyond the first page", async () => {
        const calls: Calls = {};
        const existing = Array.from({ length: 200 }, (_, i) => `pay-${i}`);
        const body = await recordPayment(calls, { existing, adds: ["pay-new"] });
        expect(body.data).toMatchObject({ paymentId: "pay-new" });
        expect(body.warnings).toBeUndefined();
    });

    it("warns instead of guessing when the diff names no new payment", async () => {
        const body = await recordPayment({}, { existing: ["pay-old"], adds: [] });
        expect(body.data).toMatchObject({ paymentId: null });
        expect(body.changed).toBeUndefined();
        expect(body.warnings).toEqual([
            { code: "payment_id_unrecovered", message: expect.stringContaining("could not be recovered") },
        ]);
    });

    it("warns instead of guessing when a concurrent write makes the diff ambiguous", async () => {
        const body = await recordPayment({}, { adds: ["pay-new", "pay-concurrent"] });
        expect(body.data).toMatchObject({ paymentId: null });
        expect(body.changed).toBeUndefined();
        expect((body.warnings as unknown[])?.[0]).toMatchObject({ code: "payment_id_unrecovered" });
    });

    it("passes the payment id through on delete", async () => {
        const calls: Calls = {};
        const client = await connect(context(calls));
        await callGuarded(client, {
            name: "clockify_invoices_payments_delete",
            arguments: { invoiceId: "inv-1", paymentId: "pay-9" },
        });
        expect(calls.payDelete?.[0]).toEqual({
            workspaceId: "ws-1",
            invoiceId: "inv-1",
            paymentId: "pay-9",
        });
    });
});

describe("project templates and estimates", () => {
    it("filters the project list to templates", async () => {
        const calls: Calls = {};
        const client = await connect(context(calls));
        const res = await client.callTool({
            name: "clockify_projects_templates_list",
            arguments: {},
        });
        expect(res.isError).toBeFalsy();
        expect(calls.projectList?.[0]).toMatchObject({ "is-template": true, page: 1 });
        expect((envelope(res).meta as { count: number }).count).toBe(1);
    });

    it("marks a project as a template by resolved id", async () => {
        const calls: Calls = {};
        const client = await connect(context(calls));
        await callGuarded(client, {
            name: "clockify_projects_templates_mark",
            arguments: { projectId: PROJECT, isTemplate: true },
        });
        expect(calls.templateMark?.[0]).toEqual({
            workspaceId: "ws-1",
            projectId: PROJECT,
            body: { isTemplate: true },
        });
    });

    it("sends only the estimate that was given", async () => {
        const calls: Calls = {};
        const client = await connect(context(calls));
        await callGuarded(client, {
            name: "clockify_projects_estimates_update",
            arguments: { projectId: PROJECT, timeEstimate: "PT40H", active: true },
        });
        expect(calls.estimate?.[0]).toEqual({
            workspaceId: "ws-1",
            projectId: PROJECT,
            body: { timeEstimate: { estimate: "PT40H", active: true } },
        });
    });

    it("rejects an estimate update with neither estimate", async () => {
        const calls: Calls = {};
        const client = await connect(context(calls));
        const res = await client.callTool({
            name: "clockify_projects_estimates_update",
            arguments: { projectId: PROJECT, dry_run: true },
        });
        expect(res.isError).toBe(true);
        expect(calls.estimate).toBeUndefined();
    });
});

describe("clockify_workspace_settings", () => {
    it("reads the pinned workspace and takes no arguments", async () => {
        const calls: Calls = {};
        const client = await connect(context(calls));
        const res = await client.callTool({ name: "clockify_workspace_settings", arguments: {} });
        expect(res.isError).toBeFalsy();
        expect(calls.workspaceGet?.[0]).toEqual({ workspaceId: "ws-1" });
    });
});

describe("clockify_time_off_requests_create_for_user", () => {
    it("resolves the user and sends a DAYS-unit period", async () => {
        const calls: Calls = {};
        const client = await connect(context(calls));
        await callGuarded(client, {
            name: "clockify_time_off_requests_create_for_user",
            arguments: { policyId: "PTO", userId: "Alice", start: "2099-06-01", days: 2 },
        });
        expect(calls.timeOffForUser?.[0]).toEqual({
            workspaceId: "ws-1",
            policyId: POLICY,
            userId: USER,
            body: {
                note: "",
                timeOffPeriod: {
                    isHalfDay: false,
                    halfDayPeriod: "NOT_DEFINED",
                    period: { start: "2099-06-01", days: 2 },
                },
            },
        });
    });

    it("requires either end or days", async () => {
        const calls: Calls = {};
        const client = await connect(context(calls));
        const res = await client.callTool({
            name: "clockify_time_off_requests_create_for_user",
            arguments: { policyId: "PTO", userId: "Alice", start: "2099-06-01", dry_run: true },
        });
        expect(res.isError).toBe(true);
        expect(calls.timeOffForUser).toBeUndefined();
    });
});
