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

function context(calls: Calls): Context {
    const record =
        (key: string, result?: unknown) =>
        async (request: unknown) => {
            (calls[key] ??= []).push(request);
            return result;
        };
    return {
        workspaceId: "ws-1",
        client: {
            invoiceItems: {
                create: record("itemAdd", { id: "inv-1" }),
                delete: record("itemDelete"),
            },
            invoicePayments: {
                create: record("payCreate", { id: "pay-1" }),
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
    it("sends the item body and defaults applyTaxes to NONE", async () => {
        const calls: Calls = {};
        const client = await connect(context(calls));
        const res = await callGuarded(client, {
            name: "clockify_invoices_items_add",
            arguments: {
                invoiceId: "inv-1",
                description: "Consulting",
                itemType: "SERVICE",
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
                itemType: "SERVICE",
                quantity: 2,
                unitPrice: 15000,
            },
        });
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
    it("omits optional fields that were not given", async () => {
        const calls: Calls = {};
        const client = await connect(context(calls));
        await callGuarded(client, {
            name: "clockify_invoices_payments_create",
            arguments: { invoiceId: "inv-1", amount: 5000 },
        });
        expect(calls.payCreate?.[0]).toEqual({
            workspaceId: "ws-1",
            invoiceId: "inv-1",
            body: { amount: 5000 },
        });
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
