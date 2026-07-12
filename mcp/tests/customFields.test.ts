import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

const FIELD_ID = "000000000000000000000301";
const PROJECT_ID = "000000000000000000000401";

afterEach(async () => {
    await teardown();
    teardown = async () => {};
});

type CustomFieldsResource = Partial<{
    listForWorkspace: (req: unknown) => Promise<unknown>;
    createForWorkspace: (req: unknown) => Promise<unknown>;
    updateForWorkspace: (req: unknown) => Promise<unknown>;
    deleteForWorkspace: (req: unknown) => Promise<unknown>;
    listForProject: (req: unknown) => Promise<unknown>;
    updateForProject: (req: unknown) => Promise<unknown>;
    removeFromProject: (req: unknown) => Promise<unknown>;
}>;

/**
 * A custom-fields-only Context. Each SDK method records its request into
 * `captured` (keyed by method name) and returns the supplied stub. Overrides
 * replace a default so a single test can force a 4xx by throwing from one
 * method.
 */
function customFieldsContext(
    captured: Record<string, unknown>,
    overrides: CustomFieldsResource = {},
): Context {
    const customFields: CustomFieldsResource = {
        listForWorkspace: async (req: unknown) => {
            captured.listForWorkspace = req;
            return [
                {
                    id: FIELD_ID,
                    name: "Cost Center",
                    type: "TXT",
                    allowedValues: [],
                    description: "",
                    placeholder: "",
                    onlyAdminCanEdit: false,
                    required: true,
                    status: "VISIBLE",
                    workspaceDefaultValue: "",
                },
            ];
        },
        createForWorkspace: async (req: unknown) => {
            captured.createForWorkspace = req;
            return { id: FIELD_ID, name: "Cost Center" };
        },
        updateForWorkspace: async (req: unknown) => {
            captured.updateForWorkspace = req;
            return { id: FIELD_ID, name: "Cost Center" };
        },
        deleteForWorkspace: async (req: unknown) => {
            captured.deleteForWorkspace = req;
            return undefined;
        },
        listForProject: async (req: unknown) => {
            captured.listForProject = req;
            return [{ id: FIELD_ID, name: "Cost Center" }];
        },
        updateForProject: async (req: unknown) => {
            captured.updateForProject = req;
            return { id: FIELD_ID, status: "VISIBLE" };
        },
        removeFromProject: async (req: unknown) => {
            captured.removeFromProject = req;
            return undefined;
        },
        ...overrides,
    };
    return {
        workspaceId: "ws-1",
        client: { customFields } as never,
    };
}

async function connect(ctx: Context): Promise<Client> {
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "custom-fields-test-harness", version: "0.0.0" });
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

describe("clockify_custom_fields_list", () => {
    it("applies default page/page-size, pins the workspace, and counts the rows read-only", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));
        const res = await client.callTool({ name: "clockify_custom_fields_list", arguments: {} });

        expect(res.isError).toBeFalsy();
        // Defaults: page 1, page-size 50 (note the hyphenated SDK arg name).
        expect(captured.listForWorkspace).toEqual({
            workspaceId: "ws-1",
            page: 1,
            "page-size": 50,
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        const meta = json.meta as { workspaceId: string; count: number };
        expect(meta).toEqual({ workspaceId: "ws-1", count: 1 });
        // Read-only tool: no changed receipt.
        expect(json.changed).toBeUndefined();
    });

    it("threads an explicit page/pageSize into the hyphenated SDK request", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));
        const res = await client.callTool({
            name: "clockify_custom_fields_list",
            arguments: { page: 4, pageSize: 25 },
        });

        expect(res.isError).toBeFalsy();
        expect(captured.listForWorkspace).toEqual({
            workspaceId: "ws-1",
            page: 4,
            "page-size": 25,
        });
    });

    it("surfaces an upstream 401 as a structured auth_or_permission error", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            customFieldsContext(captured, {
                listForWorkspace: async () => {
                    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
                },
            }),
        );
        const res = await client.callTool({ name: "clockify_custom_fields_list", arguments: {} });

        expect(res.isError).toBe(true);
        const json = envelope(res);
        expect(json.ok).toBe(false);
        expect(json.error as { code: string; message: string }).toEqual({
            code: "auth_or_permission",
            message: "Unauthorized",
        });
    });
});

describe("clockify_custom_fields_create", () => {
    it("wraps name+type in a body envelope and emits a created receipt with id+name", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));
        const res = await client.callTool({
            name: "clockify_custom_fields_create",
            arguments: { name: "Cost Center", type: "TXT" },
        });

        expect(res.isError).toBeFalsy();
        // Only the supplied fields land in the body; optionals are absent.
        expect(captured.createForWorkspace).toEqual({
            workspaceId: "ws-1",
            body: { name: "Cost Center", type: "TXT" },
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect(json.entity).toBe("custom_field");
        const changed = json.changed as {
            created: Array<{ type: string; id: string; name: string }>;
        };
        expect(changed.created).toEqual([
            { type: "custom_field", id: FIELD_ID, name: "Cost Center" },
        ]);
    });

    it("threads every optional, including required:false via the !== undefined guard", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));
        const res = await client.callTool({
            name: "clockify_custom_fields_create",
            arguments: {
                name: "Region",
                type: "DROPDOWN_SINGLE",
                allowedValues: ["EU", "US"],
                required: false,
                placeholder: "Pick one",
                description: "Sales region",
            },
        });

        expect(res.isError).toBeFalsy();
        // required:false is falsy but must still be forwarded (guard is `!== undefined`).
        expect(captured.createForWorkspace).toEqual({
            workspaceId: "ws-1",
            body: {
                name: "Region",
                type: "DROPDOWN_SINGLE",
                allowedValues: ["EU", "US"],
                required: false,
                placeholder: "Pick one",
                description: "Sales region",
            },
        });
    });

    it("rejects an empty name at the schema boundary before any write", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));
        const res = await client.callTool({
            name: "clockify_custom_fields_create",
            arguments: { name: "", type: "TXT" },
        });

        expect(res.isError).toBe(true);
        // min(1) on name fails in the transport layer; the handler never runs.
        expect(captured.createForWorkspace).toBeUndefined();
    });

    it("rejects an empty type at the schema boundary before any write", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));
        const res = await client.callTool({
            name: "clockify_custom_fields_create",
            arguments: { name: "Cost Center", type: "" },
        });

        expect(res.isError).toBe(true);
        expect(captured.createForWorkspace).toBeUndefined();
    });

    it("maps an upstream 409 conflict to a structured conflict error with no receipt", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            customFieldsContext(captured, {
                createForWorkspace: async () => {
                    throw Object.assign(new Error("Custom field already exists"), {
                        statusCode: 409,
                    });
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_custom_fields_create",
            arguments: { name: "Dup", type: "TXT" },
        });

        expect(res.isError).toBe(true);
        const json = envelope(res);
        expect((json.error as { code: string }).code).toBe("conflict");
        expect(json.changed).toBeUndefined();
    });
});

describe("clockify_custom_fields_update", () => {
    it("preserves the full listed definition and overlays supplied fields, including false", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));
        const res = await client.callTool({
            name: "clockify_custom_fields_update",
            arguments: {
                customFieldId: FIELD_ID,
                name: "Renamed",
                required: false,
                status: "INACTIVE",
            },
        });

        expect(res.isError).toBeFalsy();
        expect(captured.updateForWorkspace).toEqual({
            workspaceId: "ws-1",
            customFieldId: FIELD_ID,
            body: {
                name: "Renamed",
                type: "TXT",
                allowedValues: [],
                description: "",
                placeholder: "",
                onlyAdminCanEdit: false,
                required: false,
                status: "INACTIVE",
                workspaceDefaultValue: "",
            },
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect(json.entity).toBe("custom_field");
        const meta = json.meta as { workspaceId: string; customFieldId: string };
        expect(meta).toEqual({ workspaceId: "ws-1", customFieldId: FIELD_ID });
        const changed = json.changed as { updated: Array<{ type: string; id: string }> };
        expect(changed.updated).toEqual([{ type: "custom_field", id: FIELD_ID }]);
    });

    it("rejects a no-op after list-scanning and never mutates", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));
        const res = await client.callTool({
            name: "clockify_custom_fields_update",
            arguments: { customFieldId: FIELD_ID },
        });

        expect(res.isError).toBe(true);
        expect(captured.listForWorkspace).toEqual({
            workspaceId: "ws-1",
            page: 1,
            "page-size": 200,
        });
        expect(captured.updateForWorkspace).toBeUndefined();
    });

    it("continues the list scan until it finds a field on a later page", async () => {
        const captured: Record<string, unknown> = {};
        const pages: number[] = [];
        const client = await connect(
            customFieldsContext(captured, {
                listForWorkspace: async (req: unknown) => {
                    const page = (req as { page: number }).page;
                    pages.push(page);
                    if (page === 1) {
                        return Array.from({ length: 200 }, (_, index) => ({
                            id: `other-${index}`,
                            name: `Other ${index}`,
                            type: "TXT",
                        }));
                    }
                    return [{ id: FIELD_ID, name: "Cost Center", type: "TXT", required: false }];
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_custom_fields_update",
            arguments: { customFieldId: FIELD_ID, name: "Renamed" },
        });
        expect(res.isError).toBeFalsy();
        expect(pages).toEqual([1, 2]);
        expect(captured.updateForWorkspace).toEqual({
            workspaceId: "ws-1",
            customFieldId: FIELD_ID,
            body: { name: "Renamed", type: "TXT", required: false },
        });
    });

    it("stops when a full page repeats instead of scanning forever", async () => {
        const captured: Record<string, unknown> = {};
        let calls = 0;
        const repeated = Array.from({ length: 200 }, (_, index) => ({
            id: `other-${index}`,
            name: `Other ${index}`,
            type: "TXT",
        }));
        const client = await connect(
            customFieldsContext(captured, {
                listForWorkspace: async () => {
                    calls += 1;
                    if (calls > 2) throw new Error("repeated scan did not terminate");
                    return repeated;
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_custom_fields_update",
            arguments: { customFieldId: FIELD_ID, name: "Renamed" },
        });
        expect(res.isError).toBe(true);
        expect(calls).toBe(2);
        expect(captured.updateForWorkspace).toBeUndefined();
    });

    it("rejects an unreconstructable current default value before mutation", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            customFieldsContext(captured, {
                listForWorkspace: async () => [
                    { id: FIELD_ID, name: "Cost Center", type: "TXT", workspaceDefaultValue: [1] },
                ],
            }),
        );
        const res = await client.callTool({
            name: "clockify_custom_fields_update",
            arguments: { customFieldId: FIELD_ID, name: "Renamed" },
        });
        expect(res.isError).toBe(true);
        expect(captured.updateForWorkspace).toBeUndefined();
    });

    it("rejects a missing customFieldId at the schema boundary before any write", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));
        const res = await client.callTool({
            name: "clockify_custom_fields_update",
            arguments: { name: "Renamed" },
        });

        expect(res.isError).toBe(true);
        expect(captured.updateForWorkspace).toBeUndefined();
    });

    it("maps an upstream 400 to a structured invalid_request error", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            customFieldsContext(captured, {
                updateForWorkspace: async () => {
                    throw Object.assign(new Error("Bad Request"), { statusCode: 400 });
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_custom_fields_update",
            arguments: { customFieldId: FIELD_ID, name: "x" },
        });

        expect(res.isError).toBe(true);
        expect((envelope(res).error as { code: string }).code).toBe("invalid_request");
    });
});

describe("clockify_custom_fields_delete", () => {
    it("previews on dry_run without deleting and carries an actionable next step", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));
        const res = await client.callTool({
            name: "clockify_custom_fields_delete",
            arguments: { customFieldId: FIELD_ID, dry_run: true },
        });

        expect(res.isError).toBeFalsy();
        // No mutation on a dry run.
        expect(captured.deleteForWorkspace).toBeUndefined();
        const json = envelope(res);
        expect(json.ok).toBe(true);
        const data = json.data as {
            preview: { action: string; entity: string; id: string };
            confirm_token: string;
            risk_class: string;
        };
        expect(data.preview).toMatchObject({
            action: "delete",
            entity: "custom_field",
            id: FIELD_ID,
            request: { workspaceId: "ws-1", customFieldId: FIELD_ID },
        });
        expect(data.risk_class).toBe("destructive");
        expect(typeof data.confirm_token).toBe("string");
        const next = json.next as Array<{ tool: string; args: { confirm_token: string } }>;
        expect(next[0]?.tool).toBe("clockify_custom_fields_delete");
        expect(next[0]?.args.confirm_token).toBe(data.confirm_token);
    });

    it("deletes once a valid confirm_token is replayed and emits a deleted receipt", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));

        const preview = await client.callTool({
            name: "clockify_custom_fields_delete",
            arguments: { customFieldId: FIELD_ID, dry_run: true },
        });
        const token = (envelope(preview).data as { confirm_token: string }).confirm_token;

        const res = await client.callTool({
            name: "clockify_custom_fields_delete",
            arguments: { customFieldId: FIELD_ID, confirm_token: token },
        });

        expect(res.isError).toBeFalsy();
        expect(captured.deleteForWorkspace).toEqual({
            workspaceId: "ws-1",
            customFieldId: FIELD_ID,
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect(json.entity).toBe("custom_field");
        expect(json.data as { deleted: boolean; customFieldId: string }).toEqual({
            deleted: true,
            customFieldId: FIELD_ID,
        });
        const changed = json.changed as { deleted: Array<{ type: string; id: string }> };
        expect(changed.deleted).toEqual([{ type: "custom_field", id: FIELD_ID }]);
    });

    it("refuses to delete with no dry_run and no token, instructing a dry_run first", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));
        const res = await client.callTool({
            name: "clockify_custom_fields_delete",
            arguments: { customFieldId: FIELD_ID },
        });

        expect(res.isError).toBe(true);
        expect(captured.deleteForWorkspace).toBeUndefined();
        const json = envelope(res);
        expect(json.ok).toBe(false);
        expect(JSON.stringify(json)).toMatch(/dry_run/i);
    });

    it("rejects a bogus confirm_token and never reaches the delete call", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));
        const res = await client.callTool({
            name: "clockify_custom_fields_delete",
            arguments: { customFieldId: FIELD_ID, confirm_token: "not-a-real-token" },
        });

        expect(res.isError).toBe(true);
        expect(captured.deleteForWorkspace).toBeUndefined();
        expect((envelope(res).error as { code: string }).code).toBe("invalid_request");
    });

    it("rejects a confirm_token issued for a different custom field id (payload mismatch)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));

        const preview = await client.callTool({
            name: "clockify_custom_fields_delete",
            arguments: { customFieldId: FIELD_ID, dry_run: true },
        });
        const token = (envelope(preview).data as { confirm_token: string }).confirm_token;

        const res = await client.callTool({
            name: "clockify_custom_fields_delete",
            arguments: { customFieldId: "000000000000000000000999", confirm_token: token },
        });

        expect(res.isError).toBe(true);
        expect(captured.deleteForWorkspace).toBeUndefined();
        expect((envelope(res).error as { code: string }).code).toBe("invalid_request");
    });
});

describe("clockify_project_custom_fields_list", () => {
    it("scopes to the project, applies defaults, and counts the rows read-only", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));
        const res = await client.callTool({
            name: "clockify_project_custom_fields_list",
            arguments: { projectId: PROJECT_ID },
        });

        expect(res.isError).toBeFalsy();
        expect(captured.listForProject).toEqual({
            workspaceId: "ws-1",
            projectId: PROJECT_ID,
            page: 1,
            "page-size": 50,
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        const meta = json.meta as { workspaceId: string; projectId: string; count: number };
        expect(meta).toEqual({ workspaceId: "ws-1", projectId: PROJECT_ID, count: 1 });
        expect(json.changed).toBeUndefined();
    });

    it("rejects a missing projectId at the schema boundary before any read", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));
        const res = await client.callTool({
            name: "clockify_project_custom_fields_list",
            arguments: {},
        });

        expect(res.isError).toBe(true);
        expect(captured.listForProject).toBeUndefined();
    });
});

describe("clockify_project_custom_fields_update", () => {
    it("sends only the supplied association fields, forwarding an empty-string defaultValue", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));
        const res = await client.callTool({
            name: "clockify_project_custom_fields_update",
            arguments: {
                projectId: PROJECT_ID,
                customFieldId: FIELD_ID,
                status: "VISIBLE",
                defaultValue: "",
            },
        });

        expect(res.isError).toBeFalsy();
        // defaultValue:"" is falsy but must still land via the !== undefined guard.
        expect(captured.updateForProject).toEqual({
            workspaceId: "ws-1",
            projectId: PROJECT_ID,
            customFieldId: FIELD_ID,
            body: { status: "VISIBLE", defaultValue: "" },
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect(json.entity).toBe("project_custom_field");
        const meta = json.meta as { workspaceId: string; projectId: string; customFieldId: string };
        expect(meta).toEqual({
            workspaceId: "ws-1",
            projectId: PROJECT_ID,
            customFieldId: FIELD_ID,
        });
        const changed = json.changed as { updated: Array<{ type: string; id: string }> };
        expect(changed.updated).toEqual([{ type: "project_custom_field", id: FIELD_ID }]);
    });

    it("never sends allowedValues to the project PATCH (not part of CustomFieldProjectDefaultValuesRequest)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));
        // `allowedValues` is no longer a schema field. Passing it is ignored by the
        // transport (additional props are stripped) and never reaches the wire body —
        // the project default-value PATCH only accepts defaultValue + status.
        const res = await client.callTool({
            name: "clockify_project_custom_fields_update",
            arguments: {
                projectId: PROJECT_ID,
                customFieldId: FIELD_ID,
                status: "VISIBLE",
                defaultValue: "Manila",
                allowedValues: ["A", "B"],
            },
        });

        expect(res.isError).toBeFalsy();
        const sent = captured.updateForProject as { body: Record<string, unknown> };
        expect(sent.body).toEqual({ status: "VISIBLE", defaultValue: "Manila" });
        expect("allowedValues" in sent.body).toBe(false);
    });

    it("rejects an empty update before calling the SDK", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));
        const res = await client.callTool({
            name: "clockify_project_custom_fields_update",
            arguments: { projectId: PROJECT_ID, customFieldId: FIELD_ID },
        });

        expect(res.isError).toBe(true);
        expect(captured.updateForProject).toBeUndefined();
    });

    it("rejects an invalid status before calling the SDK", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));
        const res = await client.callTool({
            name: "clockify_project_custom_fields_update",
            arguments: { projectId: PROJECT_ID, customFieldId: FIELD_ID, status: "HIDDEN" },
        });
        expect(res.isError).toBe(true);
        expect(captured.updateForProject).toBeUndefined();
    });

    it("maps an upstream 404 to a structured not_found error", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            customFieldsContext(captured, {
                updateForProject: async () => {
                    throw Object.assign(new Error("Not Found"), { statusCode: 404 });
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_project_custom_fields_update",
            arguments: { projectId: PROJECT_ID, customFieldId: FIELD_ID, status: "INACTIVE" },
        });

        expect(res.isError).toBe(true);
        expect(envelope(res).error as { code: string; message: string }).toEqual({
            code: "not_found",
            message: "Not Found",
        });
    });
});

describe("clockify_project_custom_fields_remove", () => {
    it("previews on dry_run without detaching and carries an actionable next step", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));
        const res = await client.callTool({
            name: "clockify_project_custom_fields_remove",
            arguments: { projectId: PROJECT_ID, customFieldId: FIELD_ID, dry_run: true },
        });

        expect(res.isError).toBeFalsy();
        expect(captured.removeFromProject).toBeUndefined();
        const json = envelope(res);
        expect(json.ok).toBe(true);
        const data = json.data as {
            preview: { action: string; entity: string; projectId: string; customFieldId: string };
            confirm_token: string;
            risk_class: string;
        };
        expect(data.preview).toMatchObject({
            action: "remove",
            entity: "project_custom_field",
            projectId: PROJECT_ID,
            customFieldId: FIELD_ID,
            request: {
                workspaceId: "ws-1",
                projectId: PROJECT_ID,
                customFieldId: FIELD_ID,
            },
        });
        expect(data.risk_class).toBe("destructive");
        expect(typeof data.confirm_token).toBe("string");
        const next = json.next as Array<{ tool: string; args: { confirm_token: string } }>;
        expect(next[0]?.tool).toBe("clockify_project_custom_fields_remove");
        expect(next[0]?.args.confirm_token).toBe(data.confirm_token);
    });

    it("detaches once a valid confirm_token is replayed and emits a deleted receipt", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));

        const preview = await client.callTool({
            name: "clockify_project_custom_fields_remove",
            arguments: { projectId: PROJECT_ID, customFieldId: FIELD_ID, dry_run: true },
        });
        const token = (envelope(preview).data as { confirm_token: string }).confirm_token;

        const res = await client.callTool({
            name: "clockify_project_custom_fields_remove",
            arguments: { projectId: PROJECT_ID, customFieldId: FIELD_ID, confirm_token: token },
        });

        expect(res.isError).toBeFalsy();
        expect(captured.removeFromProject).toEqual({
            workspaceId: "ws-1",
            projectId: PROJECT_ID,
            customFieldId: FIELD_ID,
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect(json.entity).toBe("project_custom_field");
        expect(json.data as { removed: boolean; projectId: string; customFieldId: string }).toEqual(
            {
                removed: true,
                projectId: PROJECT_ID,
                customFieldId: FIELD_ID,
            },
        );
        const changed = json.changed as { deleted: Array<{ type: string; id: string }> };
        expect(changed.deleted).toEqual([{ type: "project_custom_field", id: FIELD_ID }]);
    });

    it("refuses to detach with no dry_run and no token, instructing a dry_run first", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));
        const res = await client.callTool({
            name: "clockify_project_custom_fields_remove",
            arguments: { projectId: PROJECT_ID, customFieldId: FIELD_ID },
        });

        expect(res.isError).toBe(true);
        expect(captured.removeFromProject).toBeUndefined();
        expect(JSON.stringify(envelope(res))).toMatch(/dry_run/i);
    });

    it("rejects a confirm_token issued for a different project id (payload mismatch)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(customFieldsContext(captured));

        const preview = await client.callTool({
            name: "clockify_project_custom_fields_remove",
            arguments: { projectId: PROJECT_ID, customFieldId: FIELD_ID, dry_run: true },
        });
        const token = (envelope(preview).data as { confirm_token: string }).confirm_token;

        // Same custom field, different project id -> the hashed payload no longer matches.
        const res = await client.callTool({
            name: "clockify_project_custom_fields_remove",
            arguments: {
                projectId: "000000000000000000000888",
                customFieldId: FIELD_ID,
                confirm_token: token,
            },
        });

        expect(res.isError).toBe(true);
        expect(captured.removeFromProject).toBeUndefined();
        expect((envelope(res).error as { code: string }).code).toBe("invalid_request");
    });
});
