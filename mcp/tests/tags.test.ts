import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

const TAG_ID = "000000000000000000000201";

afterEach(async () => {
    await teardown();
    teardown = async () => {};
});

type TagsResource = Partial<{
    list: (req: unknown) => Promise<unknown>;
    create: (req: unknown) => Promise<unknown>;
    get: (req: unknown) => Promise<unknown>;
    update: (req: unknown) => Promise<unknown>;
    delete: (req: unknown) => Promise<unknown>;
}>;

/**
 * A tags-only Context. Each SDK method records its request into `captured`
 * (keyed by method name) and returns the supplied stub. Overrides replace a
 * default so a single test can force a 4xx by throwing from one method.
 */
function tagsContext(
    captured: Record<string, unknown>,
    overrides: TagsResource = {},
): Context {
    const tags: TagsResource = {
        list: async (req: unknown) => {
            captured.list = req;
            return [{ id: TAG_ID, name: "Billable" }];
        },
        create: async (req: unknown) => {
            captured.create = req;
            return { id: TAG_ID };
        },
        get: async (req: unknown) => {
            captured.get = req;
            return { id: TAG_ID, name: "Billable" };
        },
        update: async (req: unknown) => {
            captured.update = req;
            return { id: TAG_ID, name: "Billable", archived: false };
        },
        delete: async (req: unknown) => {
            captured.delete = req;
            return undefined;
        },
        ...overrides,
    };
    return {
        workspaceId: "ws-1",
        client: { tags } as never,
    };
}

async function connect(ctx: Context): Promise<Client> {
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "tags-test-harness", version: "0.0.0" });
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

function responseAware<T>(data: T, headers: Record<string, string>) {
    const promise = Promise.resolve(data) as Promise<T> & {
        withRawResponse(): Promise<{ data: T; rawResponse: { headers: Headers } }>;
    };
    promise.withRawResponse = async () => ({ data, rawResponse: { headers: new Headers(headers) } });
    return promise;
}

describe("clockify_tags_list", () => {
    it("applies default page/pageSize and reports hasMore=false when the page is short", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(tagsContext(captured));
        const res = await client.callTool({ name: "clockify_tags_list", arguments: {} });

        expect(res.isError).toBeFalsy();
        // Defaults: page 1, page-size 50; no name/archived filters in the request.
        expect(captured.list).toEqual({ workspaceId: "ws-1", page: 1, "page-size": 50 });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        const meta = json.meta as { count: number; page: number; pageSize: number; hasMore: boolean };
        expect(meta).toEqual({ workspaceId: "ws-1", count: 1, page: 1, pageSize: 50, hasMore: false });
    });

    it("threads name and archived=false filters into the SDK request", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(tagsContext(captured));
        const res = await client.callTool({
            name: "clockify_tags_list",
            arguments: { name: "Billable", archived: false, page: 3, pageSize: 25 },
        });

        expect(res.isError).toBeFalsy();
        // archived:false must still be forwarded (the guard is `!== undefined`, not truthiness),
        // and the explicit page/pageSize override the defaults.
        expect(captured.list).toEqual({
            workspaceId: "ws-1",
            page: 3,
            "page-size": 25,
            name: "Billable",
            archived: false,
        });
        const meta = envelope(res).meta as { page: number; pageSize: number };
        expect(meta).toMatchObject({ page: 3, pageSize: 25 });
    });

    it("sets hasMore=true when the returned page exactly fills pageSize", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            tagsContext(captured, {
                list: async () => [
                    { id: "t1", name: "A" },
                    { id: "t2", name: "B" },
                ],
            }),
        );
        const res = await client.callTool({
            name: "clockify_tags_list",
            arguments: { pageSize: 2 },
        });

        expect(res.isError).toBeFalsy();
        const meta = envelope(res).meta as { count: number; pageSize: number; hasMore: boolean };
        expect(meta.count).toBe(2);
        expect(meta.pageSize).toBe(2);
        expect(meta.hasMore).toBe(true);
    });

    it("uses Last-Page:true to report no more rows on a full page", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            tagsContext(captured, {
                list: () =>
                    responseAware(
                        [
                            { id: "t1", name: "A" },
                            { id: "t2", name: "B" },
                        ],
                        { "Last-Page": "true" },
                    ) as unknown as Promise<unknown>,
            }),
        );
        const res = await client.callTool({
            name: "clockify_tags_list",
            arguments: { pageSize: 2 },
        });

        const meta = envelope(res).meta as { hasMore: boolean; lastPageHeader?: boolean };
        expect(meta.hasMore).toBe(false);
        expect(meta.lastPageHeader).toBe(true);
    });

    it("surfaces an upstream 401 as a structured auth_or_permission error", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            tagsContext(captured, {
                list: async () => {
                    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
                },
            }),
        );
        const res = await client.callTool({ name: "clockify_tags_list", arguments: {} });

        expect(res.isError).toBe(true);
        const json = envelope(res);
        expect(json.ok).toBe(false);
        expect((json.error as { code: string; message: string })).toEqual({
            code: "auth_or_permission",
            message: "Unauthorized",
        });
    });
});

describe("clockify_tags_create", () => {
    it("pins the workspace, wraps the name in a body envelope, and emits a created receipt", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(tagsContext(captured));
        const res = await client.callTool({
            name: "clockify_tags_create",
            arguments: { name: "Urgent" },
        });

        expect(res.isError).toBeFalsy();
        expect(captured.create).toEqual({ workspaceId: "ws-1", body: { name: "Urgent" } });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect(json.entity).toBe("tag");
        // writeReceipt("created", "tag", { id, name }) -> changed.created carries the new id + name.
        const changed = json.changed as { created: Array<{ type: string; id: string; name: string }> };
        expect(changed.created).toEqual([{ type: "tag", id: TAG_ID, name: "Urgent" }]);
    });

    it("rejects an empty name at the schema boundary before any write", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(tagsContext(captured));
        const res = await client.callTool({
            name: "clockify_tags_create",
            arguments: { name: "" },
        });

        expect(res.isError).toBe(true);
        // min(1) on the name fails validation in the transport layer; the handler never runs.
        expect(captured.create).toBeUndefined();
    });

    it("maps an upstream 409 conflict to a structured conflict error", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            tagsContext(captured, {
                create: async () => {
                    throw Object.assign(new Error("Tag already exists"), { statusCode: 409 });
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_tags_create",
            arguments: { name: "Dup" },
        });

        expect(res.isError).toBe(true);
        const json = envelope(res);
        expect((json.error as { code: string }).code).toBe("conflict");
        expect(json.changed).toBeUndefined();
    });
});

describe("clockify_tags_get", () => {
    it("fetches by id, pins the workspace, and echoes the id in meta", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(tagsContext(captured));
        const res = await client.callTool({
            name: "clockify_tags_get",
            arguments: { tagId: TAG_ID },
        });

        expect(res.isError).toBeFalsy();
        expect(captured.get).toEqual({ workspaceId: "ws-1", tagId: TAG_ID });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect((json.meta as { workspaceId: string; tagId: string })).toEqual({
            workspaceId: "ws-1",
            tagId: TAG_ID,
        });
        // Read-only tool: no changed receipt.
        expect(json.changed).toBeUndefined();
    });

    it("surfaces a missing tag (404) as a structured not_found error", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            tagsContext(captured, {
                get: async () => {
                    throw Object.assign(new Error("Not Found"), { statusCode: 404 });
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_tags_get",
            arguments: { tagId: TAG_ID },
        });

        expect(res.isError).toBe(true);
        expect((envelope(res).error as { code: string; message: string })).toEqual({
            code: "not_found",
            message: "Not Found",
        });
    });
});

describe("clockify_tags_update", () => {
    it("sends only the name when archived is omitted", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(tagsContext(captured));
        const res = await client.callTool({
            name: "clockify_tags_update",
            arguments: { tagId: TAG_ID, name: "Renamed" },
        });

        expect(res.isError).toBeFalsy();
        expect(captured.update).toEqual({
            workspaceId: "ws-1",
            tagId: TAG_ID,
            body: { name: "Renamed" },
        });
        expect((envelope(res).meta as { tagId: string }).tagId).toBe(TAG_ID);
    });

    it("forwards archived=false in the body (the !== undefined guard, not truthiness)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(tagsContext(captured));
        const res = await client.callTool({
            name: "clockify_tags_update",
            arguments: { tagId: TAG_ID, archived: false },
        });

        expect(res.isError).toBeFalsy();
        // A falsy `archived` must still land in the body; an empty `name` must not.
        expect(captured.update).toEqual({
            workspaceId: "ws-1",
            tagId: TAG_ID,
            body: { archived: false },
        });
    });

    it("sends an empty body when neither name nor archived is supplied", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(tagsContext(captured));
        const res = await client.callTool({
            name: "clockify_tags_update",
            arguments: { tagId: TAG_ID },
        });

        expect(res.isError).toBeFalsy();
        expect(captured.update).toEqual({ workspaceId: "ws-1", tagId: TAG_ID, body: {} });
    });

    it("maps an upstream 400 to a structured invalid_request error", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            tagsContext(captured, {
                update: async () => {
                    throw Object.assign(new Error("Bad Request"), { statusCode: 400 });
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_tags_update",
            arguments: { tagId: TAG_ID, name: "x" },
        });

        expect(res.isError).toBe(true);
        expect((envelope(res).error as { code: string }).code).toBe("invalid_request");
    });
});

describe("clockify_tags_delete", () => {
    it("previews on dry_run without deleting and carries an actionable next step", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(tagsContext(captured));
        const res = await client.callTool({
            name: "clockify_tags_delete",
            arguments: { tagId: TAG_ID, dry_run: true },
        });

        expect(res.isError).toBeFalsy();
        // No mutation on a dry run.
        expect(captured.delete).toBeUndefined();
        const json = envelope(res);
        expect(json.ok).toBe(true);
        const data = json.data as {
            preview: { action: string; entity: string; id: string };
            confirm_token: string;
            risk_class: string;
        };
        expect(data.preview).toEqual({ action: "delete", entity: "tag", id: TAG_ID });
        expect(data.risk_class).toBe("tag_delete");
        expect(typeof data.confirm_token).toBe("string");
        // The `next` action re-invokes the same tool with the issued token.
        const next = json.next as Array<{ tool: string; args: { confirm_token: string } }>;
        expect(next[0]?.tool).toBe("clockify_tags_delete");
        expect(next[0]?.args.confirm_token).toBe(data.confirm_token);
    });

    it("deletes once a valid confirm_token is replayed and emits a deleted receipt", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(tagsContext(captured));

        const preview = await client.callTool({
            name: "clockify_tags_delete",
            arguments: { tagId: TAG_ID, dry_run: true },
        });
        const token = (envelope(preview).data as { confirm_token: string }).confirm_token;

        const res = await client.callTool({
            name: "clockify_tags_delete",
            arguments: { tagId: TAG_ID, confirm_token: token },
        });

        expect(res.isError).toBeFalsy();
        expect(captured.delete).toEqual({ workspaceId: "ws-1", tagId: TAG_ID });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect(json.entity).toBe("tag");
        expect((json.data as { deleted: boolean; tagId: string })).toEqual({
            deleted: true,
            tagId: TAG_ID,
        });
        expect((json.meta as { tagId: string }).tagId).toBe(TAG_ID);
        const changed = json.changed as { deleted: Array<{ type: string; id: string }> };
        expect(changed.deleted).toEqual([{ type: "tag", id: TAG_ID }]);
    });

    it("refuses to delete with no dry_run and no token, instructing a dry_run first", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(tagsContext(captured));
        const res = await client.callTool({
            name: "clockify_tags_delete",
            arguments: { tagId: TAG_ID },
        });

        expect(res.isError).toBe(true);
        expect(captured.delete).toBeUndefined();
        const json = envelope(res);
        expect(json.ok).toBe(false);
        expect(JSON.stringify(json)).toMatch(/dry_run/i);
    });

    it("rejects a bogus confirm_token and never reaches the delete call", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(tagsContext(captured));
        const res = await client.callTool({
            name: "clockify_tags_delete",
            arguments: { tagId: TAG_ID, confirm_token: "not-a-real-token" },
        });

        expect(res.isError).toBe(true);
        expect(captured.delete).toBeUndefined();
        // A tampered/unissued token is classified as a local invalid_request.
        expect((envelope(res).error as { code: string }).code).toBe("invalid_request");
    });

    it("rejects a confirm_token issued for a different tag id (payload mismatch)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(tagsContext(captured));

        // Issue a token for one tag...
        const preview = await client.callTool({
            name: "clockify_tags_delete",
            arguments: { tagId: TAG_ID, dry_run: true },
        });
        const token = (envelope(preview).data as { confirm_token: string }).confirm_token;

        // ...then try to spend it against a different tag id.
        const res = await client.callTool({
            name: "clockify_tags_delete",
            arguments: { tagId: "000000000000000000000999", confirm_token: token },
        });

        expect(res.isError).toBe(true);
        expect(captured.delete).toBeUndefined();
        expect((envelope(res).error as { code: string }).code).toBe("invalid_request");
    });
});
