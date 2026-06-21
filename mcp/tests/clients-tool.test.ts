/**
 * Behavioral coverage for the clients MCP domain tools
 * (`mcp/src/tools/clients.ts`). The happy-path archive-then-delete
 * sequence and the no-name guard already live in
 * `archive-then-delete.test.ts`; this file targets the previously
 * uncovered branches of every other handler:
 *   - list: name/archived filter slots, pagination defaults vs explicit
 *     values, the `hasMore` page-boundary calculation, and 4xx mapping
 *   - create: note-present vs note-absent body branch, the
 *     `changed.created` write receipt + id, and 4xx mapping
 *   - get: pin-through plus 4xx mapping
 *   - update: each optional-field branch (the truthy `name` guard vs the
 *     `!== undefined` note/address/archived guards), the wireBody body
 *     envelope, the `changed.updated` receipt, and 4xx mapping
 *   - delete: the confirm-guard "no dry_run / no token" rejection, the
 *     dry_run preview shape (token/expiry/hash/risk-class/next), and a
 *     tampered confirm_token rejection
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

interface ClientsStubOptions {
    listResult?: unknown[];
    getResult?: unknown;
    createResult?: unknown;
    updateResult?: unknown;
    listError?: Error;
    getError?: Error;
    createError?: Error;
    updateError?: Error;
}

/**
 * A Context whose `clients` resource records the request it received under
 * `captured.<method>` and returns the configured result (or throws the
 * configured error). Mirrors the `as never` client idiom used by the
 * sibling domain-tool tests.
 */
function clientsContext(captured: Record<string, unknown>, options: ClientsStubOptions = {}): Context {
    return {
        workspaceId: "ws-1",
        client: {
            clients: {
                list: async (req: unknown) => {
                    captured.list = req;
                    if (options.listError) throw options.listError;
                    return options.listResult ?? [];
                },
                get: async (req: unknown) => {
                    captured.get = req;
                    if (options.getError) throw options.getError;
                    return options.getResult ?? { id: "c-1", name: "Acme" };
                },
                create: async (req: unknown) => {
                    captured.create = req;
                    if (options.createError) throw options.createError;
                    return options.createResult ?? { id: "c-1", name: "Acme" };
                },
                update: async (req: unknown) => {
                    captured.update = req;
                    if (options.updateError) throw options.updateError;
                    return options.updateResult ?? { id: "c-1", name: "Acme", archived: true };
                },
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

function envelope(res: unknown): Record<string, unknown> {
    const text = (res as { content: Array<{ text: string }> }).content[0]?.text ?? "{}";
    return JSON.parse(text) as Record<string, unknown>;
}

/** An Error carrying a Clockify-style HTTP status, used to drive the status->code mapping. */
function httpError(status: number, message: string): Error {
    return Object.assign(new Error(message), { statusCode: status });
}

describe("clockify_clients_list", () => {
    it("applies defaults and omits the name/archived filter slots when absent", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(clientsContext(captured, { listResult: [{ id: "c-1" }, { id: "c-2" }] }));
        const res = await client.callTool({ name: "clockify_clients_list", arguments: {} });
        expect(res.isError).toBeFalsy();
        // Defaults: page 1, page-size 50. No name/archived keys when not supplied.
        expect(captured.list).toEqual({ workspaceId: "ws-1", page: 1, "page-size": 50 });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        const meta = json.meta as { count?: number; page?: number; pageSize?: number; hasMore?: boolean };
        expect(meta.count).toBe(2);
        expect(meta.page).toBe(1);
        expect(meta.pageSize).toBe(50);
        // 2 rows < page size 50 -> not a full page -> no more pages.
        expect(meta.hasMore).toBe(false);
    });

    it("threads the name + archived filters and explicit pagination onto the request", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(clientsContext(captured, { listResult: [{ id: "c-1" }, { id: "c-2" }] }));
        await client.callTool({
            name: "clockify_clients_list",
            arguments: { page: 3, pageSize: 2, name: "Acme", archived: true },
        });
        expect(captured.list).toEqual({
            workspaceId: "ws-1",
            page: 3,
            "page-size": 2,
            name: "Acme",
            archived: true,
        });
    });

    it("keeps an explicit archived:false filter (the !== undefined branch, not truthiness)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(clientsContext(captured, { listResult: [] }));
        await client.callTool({ name: "clockify_clients_list", arguments: { archived: false } });
        expect((captured.list as { archived?: boolean }).archived).toBe(false);
    });

    it("reports hasMore:true when the returned rows fill the page", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(clientsContext(captured, { listResult: [{ id: "a" }, { id: "b" }] }));
        const res = await client.callTool({
            name: "clockify_clients_list",
            arguments: { pageSize: 2 },
        });
        const meta = envelope(res).meta as { count?: number; hasMore?: boolean };
        expect(meta.count).toBe(2);
        expect(meta.hasMore).toBe(true);
    });

    it("maps a 403 from the list call to auth_or_permission and flags isError", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            clientsContext(captured, { listError: httpError(403, "Forbidden for this workspace") }),
        );
        const res = await client.callTool({ name: "clockify_clients_list", arguments: {} });
        expect(res.isError).toBe(true);
        const json = envelope(res);
        expect(json.ok).toBe(false);
        expect((json.error as { code?: string }).code).toBe("auth_or_permission");
    });
});

describe("clockify_clients_create", () => {
    it("omits note when absent and emits a created receipt carrying the new id", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            clientsContext(captured, { createResult: { id: "c-99", name: "Acme" } }),
        );
        const res = await client.callTool({
            name: "clockify_clients_create",
            arguments: { name: "Acme" },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.create).toEqual({ workspaceId: "ws-1", body: { name: "Acme" } });
        const json = envelope(res);
        expect(json.entity).toBe("client");
        const created = (json.changed as { created?: Array<{ id?: string; name?: string; type?: string }> }).created;
        expect(created?.[0]).toEqual({ type: "client", id: "c-99", name: "Acme" });
        // Chain-to-next hint: create a project for the new client, carrying its id.
        const next = json.next as Array<{ tool?: string; args?: { clientId?: string } }>;
        expect(next[0]?.tool).toBe("clockify_projects_create");
        expect(next[0]?.args?.clientId).toBe("c-99");
    });

    it("includes note in the body when supplied", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(clientsContext(captured));
        await client.callTool({
            name: "clockify_clients_create",
            arguments: { name: "Acme", note: "VIP" },
        });
        expect(captured.create).toEqual({ workspaceId: "ws-1", body: { name: "Acme", note: "VIP" } });
    });

    it("rejects a blank name at the schema before any create call", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(clientsContext(captured));
        const res = await client.callTool({
            name: "clockify_clients_create",
            arguments: { name: "" },
        });
        expect(res.isError).toBe(true);
        expect(captured.create).toBeUndefined();
    });

    it("maps a 409 conflict from create to the conflict code", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            clientsContext(captured, { createError: httpError(409, "name already in use") }),
        );
        const res = await client.callTool({
            name: "clockify_clients_create",
            arguments: { name: "Acme" },
        });
        expect(res.isError).toBe(true);
        expect((envelope(res).error as { code?: string }).code).toBe("conflict");
    });
});

describe("clockify_clients_get", () => {
    it("pins the workspace and clientId, returning the record read-only", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            clientsContext(captured, { getResult: { id: "c-7", name: "Globex" } }),
        );
        const res = await client.callTool({
            name: "clockify_clients_get",
            arguments: { clientId: "c-7" },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.get).toEqual({ workspaceId: "ws-1", clientId: "c-7" });
        const json = envelope(res);
        expect(json.changed).toBeUndefined();
        expect((json.data as { id?: string }).id).toBe("c-7");
        expect((json.meta as { clientId?: string }).clientId).toBe("c-7");
    });

    it("maps a 404 from get to not_found", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            clientsContext(captured, { getError: httpError(404, "client not found") }),
        );
        const res = await client.callTool({
            name: "clockify_clients_get",
            arguments: { clientId: "missing" },
        });
        expect(res.isError).toBe(true);
        expect((envelope(res).error as { code?: string }).code).toBe("not_found");
    });
});

describe("clockify_clients_update", () => {
    it("only includes the supplied fields and wraps them in the wireBody envelope", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(clientsContext(captured));
        const res = await client.callTool({
            name: "clockify_clients_update",
            arguments: { clientId: "c-1", name: "Renamed", archived: true },
        });
        expect(res.isError).toBeFalsy();
        // note + address were absent -> dropped; name + archived -> present, body envelope.
        expect(captured.update).toEqual({
            workspaceId: "ws-1",
            clientId: "c-1",
            body: { name: "Renamed", archived: true },
        });
        const json = envelope(res);
        const updated = (json.changed as { updated?: Array<{ id?: string }> }).updated;
        expect(updated?.[0]?.id).toBe("c-1");
    });

    it("keeps empty-string note/address (!== undefined) but drops an empty name (truthy guard)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(clientsContext(captured));
        await client.callTool({
            name: "clockify_clients_update",
            arguments: { clientId: "c-1", name: "", note: "", address: "" },
        });
        // The truthy `if (args.name)` guard drops "" but the `!== undefined`
        // guards keep "" for note/address.
        expect(captured.update).toEqual({
            workspaceId: "ws-1",
            clientId: "c-1",
            body: { note: "", address: "" },
        });
    });

    it("supports an archived:false update via the !== undefined branch", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(clientsContext(captured));
        await client.callTool({
            name: "clockify_clients_update",
            arguments: { clientId: "c-1", archived: false },
        });
        expect((captured.update as { body?: { archived?: boolean } }).body).toEqual({ archived: false });
    });

    it("maps a 400 from update to invalid_request", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            clientsContext(captured, { updateError: httpError(400, "bad address field") }),
        );
        const res = await client.callTool({
            name: "clockify_clients_update",
            arguments: { clientId: "c-1", name: "X" },
        });
        expect(res.isError).toBe(true);
        expect((envelope(res).error as { code?: string }).code).toBe("invalid_request");
    });
});

describe("clockify_clients_delete confirm-guard", () => {
    it("rejects a bare call (no dry_run, no confirm_token) and instructs dry_run first", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(clientsContext(captured));
        const res = await client.callTool({
            name: "clockify_clients_delete",
            arguments: { clientId: "c-1" },
        });
        expect(res.isError).toBe(true);
        // The guard short-circuits before touching the resource.
        expect(captured.get).toBeUndefined();
        expect(captured.update).toBeUndefined();
        const json = envelope(res);
        expect((json.error as { code?: string }).code).toBe("invalid_request");
        const recovery = json.recovery as { hint?: string; args?: { dry_run?: boolean }; retryable?: boolean };
        expect(recovery.hint).toMatch(/dry_run/);
        expect(recovery.args?.dry_run).toBe(true);
        expect(recovery.retryable).toBe(true);
    });

    it("dry_run issues a preview with a confirm_token, expiry, hash, risk class and a next step", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(clientsContext(captured));
        const res = await client.callTool({
            name: "clockify_clients_delete",
            arguments: { clientId: "c-1", dry_run: true },
        });
        expect(res.isError).toBeFalsy();
        // Dry-run must not perform any read or write on the resource.
        expect(captured.get).toBeUndefined();
        expect(captured.update).toBeUndefined();
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect(json.entity).toBe("confirmation");
        const data = json.data as {
            preview?: { action?: string; entity?: string; id?: string };
            confirm_token?: string;
            expires_at?: string;
            preview_hash?: string;
            risk_class?: string;
        };
        expect(data.preview).toEqual({ action: "delete", entity: "client", id: "c-1" });
        expect(typeof data.confirm_token).toBe("string");
        expect((data.confirm_token ?? "").length).toBeGreaterThan(0);
        expect(typeof data.expires_at).toBe("string");
        expect(typeof data.preview_hash).toBe("string");
        expect(data.risk_class).toBe("client_delete");
        const next = json.next as Array<{ tool?: string; args?: { clientId?: string; confirm_token?: string } }>;
        expect(next[0]?.tool).toBe("clockify_clients_delete");
        expect(next[0]?.args?.clientId).toBe("c-1");
        expect(next[0]?.args?.confirm_token).toBe(data.confirm_token);
    });

    it("rejects a fabricated confirm_token before deleting", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(clientsContext(captured));
        const res = await client.callTool({
            name: "clockify_clients_delete",
            arguments: { clientId: "c-1", confirm_token: "not-a-real-token" },
        });
        expect(res.isError).toBe(true);
        // A bad token must stop before any GET/archive/delete.
        expect(captured.get).toBeUndefined();
        expect(captured.update).toBeUndefined();
        const json = envelope(res);
        expect((json.error as { code?: string }).code).toBe("invalid_request");
        expect((json.error as { message?: string }).message).toMatch(/confirmation token/i);
    });

    it("rejects a token minted for a different clientId (argsHash mismatch)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(clientsContext(captured));
        const dry = envelope(
            await client.callTool({
                name: "clockify_clients_delete",
                arguments: { clientId: "c-1", dry_run: true },
            }),
        );
        const token = (dry.data as { confirm_token?: string }).confirm_token;
        expect(token).toBeTruthy();
        // Replay the token against a DIFFERENT client id -> payload mismatch.
        const res = await client.callTool({
            name: "clockify_clients_delete",
            arguments: { clientId: "c-2", confirm_token: token },
        });
        expect(res.isError).toBe(true);
        expect(captured.get).toBeUndefined();
        expect((envelope(res).error as { code?: string }).code).toBe("invalid_request");
    });
});
