import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerInvoicesCommand } from "../src/commands/invoices.js";
import type { Services } from "../src/commands/types.js";
import type { CliConfig } from "../src/config.js";

interface InvoiceCalls {
    lists: Record<string, unknown>[];
    creates: Record<string, unknown>[];
}

/**
 * Mirror the sibling CRUD/webhooks test harness: a commander program with
 * `--json` registered, `exitOverride()` so usage errors reject rather than
 * call `process.exit`, and a `Services` bag whose `buildClient` hands back a
 * canned typed client. `config` defaults to a populated workspace; pass `{}`
 * to drive the `requireWorkspaceId` failure path.
 */
function makeProgram(
    client: ClockifyClient,
    config: CliConfig = { apiKey: "k", workspaceId: "ws-1" },
): Command {
    const program = new Command();
    program.exitOverride();
    program.option("--json", "Emit JSON.", false);
    const services: Services = {
        loadConfig: () => config,
        buildClient: () => Promise.resolve(client),
    };
    registerInvoicesCommand(program, services);
    return program;
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
    logSpy.mockRestore();
});

function lastPayload(): Record<string, unknown> {
    const line = logSpy.mock.calls[logSpy.mock.calls.length - 1]?.[0] as string;
    return JSON.parse(line) as Record<string, unknown>;
}

describe("invoices list", () => {
    function makeClient(response: unknown): {
        client: ClockifyClient;
        calls: InvoiceCalls;
    } {
        const calls: InvoiceCalls = { lists: [], creates: [] };
        const client = {
            invoices: {
                list: async (req: Record<string, unknown>) => {
                    calls.lists.push(req);
                    return response;
                },
                create: async (req: Record<string, unknown>) => {
                    calls.creates.push(req);
                    return {};
                },
            },
        };
        return { client: client as unknown as ClockifyClient, calls };
    }

    it("forwards the workspace id and maps every populated field", async () => {
        const { client, calls } = makeClient({
            invoices: [
                {
                    id: "inv-1",
                    number: "2026-001",
                    clientId: "c-1",
                    clientName: "Acme Co",
                    currency: "USD",
                    amount: 1200,
                    status: "UNSENT",
                    issuedDate: "2026-05-01T00:00:00Z",
                    dueDate: "2026-05-31T00:00:00Z",
                },
            ],
        });
        await makeProgram(client).parseAsync(["node", "clk115", "--json", "invoices", "list"]);
        expect(calls.lists[0]).toMatchObject({ workspaceId: "ws-1" });
        const rows = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as Record<string, unknown>[];
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual({
            id: "inv-1",
            number: "2026-001",
            client: "Acme Co",
            currency: "USD",
            amount: 1200,
            status: "UNSENT",
            issued: "2026-05-01T00:00:00Z",
            due: "2026-05-31T00:00:00Z",
        });
    });

    it("falls back to clientId when clientName is absent and applies empty/zero defaults", async () => {
        const { client } = makeClient({ invoices: [{ clientId: "c-9" }] });
        await makeProgram(client).parseAsync(["node", "clk115", "--json", "invoices", "list"]);
        const rows = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as Record<string, unknown>[];
        expect(rows[0]).toEqual({
            id: "",
            number: "",
            client: "c-9",
            currency: "",
            amount: 0,
            status: "",
            issued: "",
            due: "",
        });
    });

    it("treats a missing `invoices` key as an empty list", async () => {
        const { client } = makeClient({});
        await makeProgram(client).parseAsync(["node", "clk115", "--json", "invoices", "list"]);
        const rows = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as unknown[];
        expect(rows).toEqual([]);
    });

    it("propagates a list API rejection so the caller sees a non-zero exit", async () => {
        const client = {
            invoices: {
                list: async () => {
                    throw Object.assign(new Error("HTTP 403: workspace not accessible"), {
                        statusCode: 403,
                    });
                },
            },
        } as unknown as ClockifyClient;
        await expect(
            makeProgram(client).parseAsync(["node", "clk115", "--json", "invoices", "list"]),
        ).rejects.toMatchObject({ statusCode: 403 });
    });
});

describe("invoices create", () => {
    function makeClient(created: unknown = { id: "inv-1", number: "2026-001", status: "UNSENT" }): {
        client: ClockifyClient;
        calls: InvoiceCalls;
    } {
        const calls: InvoiceCalls = { lists: [], creates: [] };
        const client = {
            invoices: {
                list: async () => ({ invoices: [] }),
                create: async (req: Record<string, unknown>) => {
                    calls.creates.push(req);
                    return created;
                },
            },
        };
        return { client: client as unknown as ClockifyClient, calls };
    }

    const requiredArgs = [
        "--client",
        "c-1",
        "--number",
        "2026-001",
        "--currency",
        "USD",
        "--issued",
        "2026-05-01",
        "--due",
        "2026-05-31",
    ];

    it("builds the body envelope and promotes date-only fields to midnight UTC", async () => {
        const { client, calls } = makeClient();
        await makeProgram(client).parseAsync([
            "node",
            "clk115",
            "--json",
            "invoices",
            "create",
            ...requiredArgs,
        ]);
        expect(calls.creates[0]).toMatchObject({
            workspaceId: "ws-1",
            body: {
                clientId: "c-1",
                number: "2026-001",
                currency: "USD",
                issuedDate: "2026-05-01T00:00:00Z",
                dueDate: "2026-05-31T00:00:00Z",
            },
        });
        // The optional time-view-mode branch must NOT add the field when absent.
        const body = (calls.creates[0]?.body ?? {}) as Record<string, unknown>;
        expect(body).not.toHaveProperty("timeViewMode");
    });

    it("passes an already-RFC3339 date through unchanged", async () => {
        const { client, calls } = makeClient();
        await makeProgram(client).parseAsync([
            "node",
            "clk115",
            "--json",
            "invoices",
            "create",
            "--client",
            "c-1",
            "--number",
            "2026-001",
            "--currency",
            "EUR",
            "--issued",
            "2026-05-01T09:30:00Z",
            "--due",
            "2026-05-31T17:00:00Z",
        ]);
        const body = (calls.creates[0]?.body ?? {}) as Record<string, unknown>;
        expect(body.issuedDate).toBe("2026-05-01T09:30:00Z");
        expect(body.dueDate).toBe("2026-05-31T17:00:00Z");
    });

    it("includes timeViewMode in the body when the optional flag is set", async () => {
        const { client, calls } = makeClient();
        await makeProgram(client).parseAsync([
            "node",
            "clk115",
            "--json",
            "invoices",
            "create",
            ...requiredArgs,
            "--time-view-mode",
            "DETAILED_TIME_VIEW",
        ]);
        const body = (calls.creates[0]?.body ?? {}) as Record<string, unknown>;
        expect(body.timeViewMode).toBe("DETAILED_TIME_VIEW");
    });

    it("emits a created receipt with ids, changed, and a verify next-step", async () => {
        const { client } = makeClient({
            id: "inv-7",
            number: "2026-007",
            status: "UNSENT",
            currency: "USD",
            amount: 950,
        });
        await makeProgram(client).parseAsync([
            "node",
            "clk115",
            "--json",
            "invoices",
            "create",
            ...requiredArgs,
        ]);
        const payload = lastPayload();
        expect(payload.ok).toBe(true);
        expect(payload.action).toBe("invoices.create");
        expect(payload.entity).toBe("invoice");
        expect(payload.ids).toMatchObject({ invoiceId: "inv-7" });
        expect(payload).toMatchObject({
            id: "inv-7",
            number: "2026-007",
            status: "UNSENT",
            currency: "USD",
            amount: 950,
        });
        const changed = payload.changed as { created: { type: string; id: string; name: string }[] };
        expect(changed.created).toEqual([{ type: "invoice", id: "inv-7", name: "2026-007" }]);
        const next = payload.next as { command: string; reason?: string }[];
        expect(next[0]?.command).toBe("clk115 invoices list --json");
    });

    it("applies empty/zero data defaults when the API returns a sparse object", async () => {
        const { client } = makeClient({});
        await makeProgram(client).parseAsync([
            "node",
            "clk115",
            "--json",
            "invoices",
            "create",
            ...requiredArgs,
        ]);
        const payload = lastPayload();
        expect(payload).toMatchObject({ id: "", number: "", status: "", currency: "", amount: 0 });
        expect(payload.ids).toMatchObject({ invoiceId: "" });
        const changed = payload.changed as { created: { id: string; name: string }[] };
        expect(changed.created[0]).toMatchObject({ id: "", name: "" });
    });

    it("propagates a 4xx create rejection without emitting a receipt", async () => {
        let createCalls = 0;
        const client = {
            invoices: {
                create: async () => {
                    createCalls += 1;
                    throw Object.assign(new Error("HTTP 400: invalid currency"), {
                        statusCode: 400,
                    });
                },
            },
        } as unknown as ClockifyClient;
        await expect(
            makeProgram(client).parseAsync([
                "node",
                "clk115",
                "--json",
                "invoices",
                "create",
                ...requiredArgs,
            ]),
        ).rejects.toThrow(/HTTP 400/);
        expect(createCalls).toBe(1);
        expect(logSpy).not.toHaveBeenCalled();
    });

    it("rejects when a required option is missing and never calls the API", async () => {
        let createCalls = 0;
        const client = {
            invoices: {
                create: async () => {
                    createCalls += 1;
                    return { id: "inv-1" };
                },
            },
        } as unknown as ClockifyClient;
        // Omit --due; commander must reject before the handler runs.
        await expect(
            makeProgram(client).parseAsync([
                "node",
                "clk115",
                "--json",
                "invoices",
                "create",
                "--client",
                "c-1",
                "--number",
                "2026-001",
                "--currency",
                "USD",
                "--issued",
                "2026-05-01",
            ]),
        ).rejects.toThrow(/required option/i);
        expect(createCalls).toBe(0);
    });

    it("rejects an empty --issued value via the date guard before any write", async () => {
        let createCalls = 0;
        const client = {
            invoices: {
                create: async () => {
                    createCalls += 1;
                    return { id: "inv-1" };
                },
            },
        } as unknown as ClockifyClient;
        await expect(
            makeProgram(client).parseAsync([
                "node",
                "clk115",
                "--json",
                "invoices",
                "create",
                "--client",
                "c-1",
                "--number",
                "2026-001",
                "--currency",
                "USD",
                "--issued",
                "",
                "--due",
                "2026-05-31",
            ]),
        ).rejects.toThrow(/--issued is required/);
        expect(createCalls).toBe(0);
    });

    it("fails through requireWorkspaceId when no workspace is configured", async () => {
        const { client, calls } = makeClient();
        await expect(
            makeProgram(client, { apiKey: "k" }).parseAsync([
                "node",
                "clk115",
                "--json",
                "invoices",
                "create",
                ...requiredArgs,
            ]),
        ).rejects.toThrow(/workspace ID not set/);
        expect(calls.creates).toHaveLength(0);
    });
});
