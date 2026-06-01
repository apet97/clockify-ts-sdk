import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerApiCommand } from "../src/commands/api.js";
import type { Services } from "../src/commands/types.js";

interface FetchCall {
    input: string;
    init?: RequestInit;
}

function makeClient(pages: unknown[][] = [[{ id: "row-1" }]]): {
    client: ClockifyClient;
    calls: FetchCall[];
} {
    const calls: FetchCall[] = [];
    let index = 0;
    const client = {
        fetch: async (input: string | URL | Request, init?: RequestInit) => {
            calls.push({ input: String(input), init });
            const body = pages[index] ?? [];
            index += 1;
            return new Response(JSON.stringify(body), {
                status: 200,
                headers: { "content-type": "application/json", "x-test": "yes" },
            });
        },
    };
    return { client: client as unknown as ClockifyClient, calls };
}

function makeProgram(client: ClockifyClient): Command {
    const program = new Command();
    program.exitOverride();
    const services: Services = {
        loadConfig: () => ({ apiKey: "k", workspaceId: "ws-1" }),
        buildClient: () => client,
    };
    registerApiCommand(program, services);
    return program;
}

function run(client: ClockifyClient, args: string[]): Promise<Command> {
    return makeProgram(client).parseAsync(["node", "clk115", "api", ...args]);
}

let logged: string[] = [];
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    logged = [];
    logSpy = vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
        logged.push(String(msg ?? ""));
    });
});

afterEach(() => {
    logSpy.mockRestore();
});

describe("api command", () => {
    it("rejects methods outside the allowed set", async () => {
        const { client } = makeClient();
        await expect(run(client, ["FOO", "/x"])).rejects.toThrow(/Unsupported method/);
    });

    it("rejects paths that do not start with /", async () => {
        const { client } = makeClient();
        await expect(run(client, ["GET", "x"])).rejects.toThrow(/must start with/);
    });

    it("replaces {workspaceId} from config", async () => {
        const { client, calls } = makeClient();
        await run(client, ["GET", "/workspaces/{workspaceId}/tags"]);
        expect(calls[0]?.input).toBe("/workspaces/ws-1/tags");
    });

    it("folds repeated --query into the path", async () => {
        const { client, calls } = makeClient();
        await run(client, ["GET", "/x", "--query", "page=1", "--query", "page-size=20"]);
        expect(calls[0]?.input).toBe("/x?page=1&page-size=20");
    });

    it("passes repeated --header to the request", async () => {
        const { client, calls } = makeClient();
        await run(client, ["GET", "/x", "-H", "X-A=1", "-H", "X-B=2"]);
        expect(calls[0]?.init?.headers).toMatchObject({ "X-A": "1", "X-B": "2" });
    });

    it("rejects malformed key=value pairs", async () => {
        const { client } = makeClient();
        await expect(run(client, ["GET", "/x", "-q", "novalue"])).rejects.toThrow(/key=value/);
    });

    it("sends an inline --body and defaults Content-Type", async () => {
        const { client, calls } = makeClient();
        await run(client, ["POST", "/x", "--body", '{"name":"t"}']);
        expect(calls[0]?.init?.body).toBe('{"name":"t"}');
        expect(calls[0]?.init?.headers).toMatchObject({ "Content-Type": "application/json" });
    });

    it("reads --body from a @file", async () => {
        const path = join(tmpdir(), "clk115-api-body.json");
        writeFileSync(path, '{"from":"file"}');
        const { client, calls } = makeClient();
        await run(client, ["POST", "/x", "--body", `@${path}`]);
        expect(calls[0]?.init?.body).toBe('{"from":"file"}');
    });

    it("walks --all pagination and stops on a short page", async () => {
        const { client, calls } = makeClient([
            [{ id: "a" }, { id: "b" }],
            [{ id: "c" }],
        ]);
        await run(client, ["GET", "/x", "--all", "--page-size", "2"]);
        expect(calls).toHaveLength(2);
        expect(calls[0]?.input).toBe("/x?page=1&page-size=2");
        expect(JSON.parse(logged[0] ?? "")).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
    });

    it("rejects --all for non-GET methods", async () => {
        const { client } = makeClient();
        await expect(run(client, ["POST", "/x", "--all"])).rejects.toThrow(/only supported for GET/);
    });

    it("rejects a non-positive --page-size", async () => {
        const { client } = makeClient();
        await expect(run(client, ["GET", "/x", "--all", "--page-size", "0"])).rejects.toThrow(
            /positive integer/,
        );
    });

    it("wraps status and headers with --include-headers", async () => {
        const { client } = makeClient();
        await run(client, ["GET", "/x", "--include-headers"]);
        const payload = JSON.parse(logged[0] ?? "");
        expect(payload.status).toBe(200);
        expect(payload.headers["x-test"]).toBe("yes");
        expect(payload.data).toEqual([{ id: "row-1" }]);
    });
});
