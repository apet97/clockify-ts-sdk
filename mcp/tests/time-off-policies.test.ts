import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

/** A policy as the GET exposes it: scope is FLAT (userIds/userGroupIds). */
function existingPolicy(): Record<string, unknown> {
    return {
        id: "pol-1",
        name: "PTO",
        color: "#00ff00",
        negativeBalance: 5,
        allowNegativeBalance: true,
        approve: true,
        archived: false,
        userIds: ["u1", "u2"],
        userGroupIds: ["g1"],
    };
}

function policiesContext(captured: Record<string, unknown>, policy = existingPolicy()): Context {
    return {
        workspaceId: "ws-1",
        client: {
            timeOffPolicies: {
                list: async (req: unknown) => {
                    captured.list = req;
                    return [{ id: "pol-1" }, { id: "pol-2" }];
                },
                get: async (req: unknown) => {
                    captured.get = req;
                    return policy;
                },
                update: async (req: unknown) => {
                    captured.update = req;
                    return { id: "pol-1" };
                },
                create: async (req: unknown) => {
                    captured.create = req;
                    return { id: "pol-9" };
                },
                updateStatus: async (req: unknown) => {
                    captured.updateStatus = req;
                    return { id: "pol-1", archived: true };
                },
            },
            // The scope tools now resolve a name in an id slot through the list/filter
            // resolvers; the resolver matches a non-hex ref against listed ids first, so
            // the short ids these fixtures use must appear in the listed users/groups.
            users: {
                list: async () => [
                    { id: "u1", name: "User One" },
                    { id: "u2", name: "User Two" },
                    { id: "u9", name: "User Nine" },
                ],
                getCurrentUser: async () => ({ id: "me-1" }),
            },
            userGroups: {
                list: async () => [{ id: "g1", name: "Group One" }],
            },
        } as never,
    };
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

describe("clockify_time_off_policies_list — query-string page form", () => {
    it("sends page as a string and kebab page-size (the GET serializes to query, not a body whitelist)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(policiesContext(captured));
        const res = await client.callTool({
            name: "clockify_time_off_policies_list",
            arguments: {},
        });
        expect(res.isError).toBeFalsy();
        const list = captured.list as Record<string, unknown>;
        expect(list.workspaceId).toBe("ws-1");
        // ListTimeOffPoliciesRequest declares page:string; the wire form is the
        // query string (live-verified 200 honoring page-size, 2026-06-18).
        expect(list.page).toBe("1");
        expect(list["page-size"]).toBe(50);
    });
});

describe("clockify_time_off_policies_update — replace-safe, flat body, scope reconstruction", () => {
    it("GET-then-PUTs the full body and rebuilds scope as a CONTAINS filter (flat, not nested)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(policiesContext(captured));
        const res = await client.callTool({
            name: "clockify_time_off_policies_update",
            arguments: { policyId: "pol-1", name: "Vacation" },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.get).toEqual({ workspaceId: "ws-1", policyId: "pol-1" });
        const update = captured.update as Record<string, unknown>;
        // Fields are FLAT on the request (the generated method reads them flat).
        expect(update.body).toBeUndefined();
        expect(update.name).toBe("Vacation");
        // Carried forward from the GET (replace-safety).
        expect(update.color).toBe("#00ff00");
        expect(update.negativeBalance).toBe(5);
        expect(update.allowNegativeBalance).toBe(true);
        expect(update.approve).toBe(true);
        // Scope reconstructed from flat userIds/userGroupIds.
        expect(update.users).toEqual({ contains: "CONTAINS", ids: ["u1", "u2"], status: "ACTIVE" });
        expect(update.userGroups).toEqual({ contains: "CONTAINS", ids: ["g1"], status: "ACTIVE" });
        expect(update.userIds).toBeUndefined();
        expect(update.workspaceId).toBe("ws-1");
        expect(update.policyId).toBe("pol-1");
    });

    it("lets explicit userIds replace the scope", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(policiesContext(captured));
        await client.callTool({
            name: "clockify_time_off_policies_update",
            arguments: { policyId: "pol-1", userIds: ["u9"] },
        });
        const update = captured.update as Record<string, unknown>;
        expect(update.users).toEqual({ contains: "CONTAINS", ids: ["u9"], status: "ACTIVE" });
    });

    it("sends status ACTIVE (not ALL) for the policy scope filter", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(policiesContext(captured));
        await client.callTool({
            name: "clockify_time_off_policies_update",
            arguments: { policyId: "pol-1", name: "Vacation" },
        });
        const update = captured.update as Record<string, unknown>;
        // Policies diverge from holidays: the live-verified addon sends ACTIVE.
        expect((update.users as { status: string }).status).toBe("ACTIVE");
        expect((update.users as { status: string }).status).not.toBe("ALL");
        expect((update.userGroups as { status: string }).status).toBe("ACTIVE");
        expect((update.userGroups as { status: string }).status).not.toBe("ALL");
    });
});

describe("clockify_time_off_policies_create — flat body + scope", () => {
    it("spreads the body fields flat and sends scope as a CONTAINS filter", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(policiesContext(captured));
        const res = await client.callTool({
            name: "clockify_time_off_policies_create",
            arguments: { name: "Sick", timeUnit: "DAYS", userIds: ["u1"] },
        });
        expect(res.isError).toBeFalsy();
        const create = captured.create as Record<string, unknown>;
        expect(create.body).toBeUndefined();
        expect(create.name).toBe("Sick");
        expect(create.timeUnit).toBe("DAYS");
        expect(create.users).toEqual({ contains: "CONTAINS", ids: ["u1"], status: "ACTIVE" });
    });

    it("sends status ACTIVE on create scope, not ALL", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(policiesContext(captured));
        await client.callTool({
            name: "clockify_time_off_policies_create",
            arguments: { name: "Sick", userIds: ["u1"], userGroupIds: ["g1"] },
        });
        const create = captured.create as Record<string, unknown>;
        expect((create.users as { status: string }).status).toBe("ACTIVE");
        expect((create.userGroups as { status: string }).status).toBe("ACTIVE");
    });
});

describe("clockify_time_off_policies_archive — maps the boolean to the wire {status} field", () => {
    it("sends status ARCHIVED (not archived) when archived is true", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(policiesContext(captured));
        const res = await client.callTool({
            name: "clockify_time_off_policies_archive",
            arguments: { policyId: "pol-1", archived: true },
        });
        expect(res.isError).toBeFalsy();
        const sent = captured.updateStatus as {
            workspaceId: string;
            policyId: string;
            body: Record<string, unknown>;
        };
        expect(sent.workspaceId).toBe("ws-1");
        expect(sent.policyId).toBe("pol-1");
        expect(sent.body).toEqual({ status: "ARCHIVED" });
        expect(sent.body.archived).toBeUndefined();
    });

    it("sends status ACTIVE when archived is false", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(policiesContext(captured));
        const res = await client.callTool({
            name: "clockify_time_off_policies_archive",
            arguments: { policyId: "pol-1", archived: false },
        });
        expect(res.isError).toBeFalsy();
        const sent = captured.updateStatus as { body: Record<string, unknown> };
        expect(sent.body).toEqual({ status: "ACTIVE" });
    });
});
