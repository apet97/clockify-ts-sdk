import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ClockifyConnectionError, UnauthorizedError } from "clockify-sdk-ts-115/errors";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { MissingCredentialsError } from "../src/client.js";
import { buildServer } from "../src/server.js";

interface HealthOverride {
    ok: boolean;
    user?: { id: string; email: string; name: string };
    latencyMs?: number;
    serverTime?: Date;
    error?: unknown;
}

function fakeContext(overrides?: {
    health?: HealthOverride;
    workspaces?: () => Promise<unknown[]>;
    workspaceId?: string;
}): Context {
    const health: HealthOverride = overrides?.health ?? {
        ok: true,
        user: { id: "user-1", email: "alice@example.com", name: "Alice" },
        latencyMs: 12,
        serverTime: new Date(),
    };
    return {
        workspaceId: overrides?.workspaceId ?? "ws-1",
        client: {
            health: async () => ({
                ok: health.ok,
                user: health.user,
                latencyMs: health.latencyMs ?? 0,
                serverTime: health.serverTime,
                error: health.error,
            }),
            workspaces: {
                list: overrides?.workspaces ?? (async () => [{ id: "ws-1", name: "WS" }]),
            },
            // status.ts and other tools registered by buildServer need these to exist
            // for listTools()/initialize, but the doctor test only calls clockify_doctor.
            users: { getCurrentUser: async () => health.user ?? {} },
            timeEntries: { listInProgress: async () => [] },
        } as never,
    };
}

/** A Context whose `client` / `workspaceId` getters throw, like a server that
 *  started without credentials. `setupError` is the safe flag the doctor reads. */
function setupRequiredContext(): Context {
    const error = new MissingCredentialsError(["CLOCKIFY_API_KEY", "CLOCKIFY_WORKSPACE_ID"]);
    const fail = (): never => {
        throw error;
    };
    return {
        get client() {
            return fail();
        },
        get workspaceId() {
            return fail();
        },
        setupError: error,
    } as unknown as Context;
}

let teardown: () => Promise<void> = async () => {};
afterEach(async () => {
    await teardown();
    delete process.env.CLOCKIFY_BASE_URL;
});

async function connect(ctx: Context): Promise<Client> {
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "doctor-test", version: "0.0.0" });
    await client.connect(clientTransport);
    teardown = async () => {
        await client.close();
        await server.close();
    };
    return client;
}

function parse(res: { content: { text: string }[] }) {
    return JSON.parse(res.content[0].text);
}

describe("clockify_doctor", () => {
    it("passes when key, workspace pin, base url, and clock are all healthy", async () => {
        const client = await connect(fakeContext());
        const res = await client.callTool({ name: "clockify_doctor", arguments: {} });
        expect(res.isError).toBeFalsy();
        const env = parse(res as never);
        expect(env.ok).toBe(true);
        expect(env.data.ok).toBe(true);
        expect(env.data.workspaceId).toBe("ws-1");
        expect(env.data.user.email).toBe("alice@example.com");
        const byName = Object.fromEntries(env.data.checks.map((c: { name: string }) => [c.name, c]));
        expect(byName.auth.ok).toBe(true);
        expect(byName.workspace_pin.ok).toBe(true);
        expect(byName.base_url.ok).toBe(true);
        expect(byName.clock_skew.ok).toBe(true);
        expect(env.next[0].tool).toBe("clockify_status");
    });

    it("fails the auth check with a regenerate-key remediation on 401", async () => {
        const client = await connect(
            fakeContext({ health: { ok: false, latencyMs: 5, error: new UnauthorizedError() } }),
        );
        const res = await client.callTool({ name: "clockify_doctor", arguments: {} });
        expect(res.isError).toBeFalsy(); // diagnostic call itself succeeds
        const env = parse(res as never);
        expect(env.data.ok).toBe(false);
        const auth = env.data.checks.find((c: { name: string }) => c.name === "auth");
        expect(auth.ok).toBe(false);
        expect(auth.code).toBe("auth_or_permission");
        expect(auth.remediation).toMatch(/Profile Settings > API/);
        expect(env.data.user).toBeNull();
    });

    it("flags a wrong workspace pin not in the key's workspaces", async () => {
        const client = await connect(
            fakeContext({ workspaces: async () => [{ id: "other-ws", name: "Other" }] }),
        );
        const res = await client.callTool({ name: "clockify_doctor", arguments: {} });
        const env = parse(res as never);
        expect(env.data.ok).toBe(false);
        const pin = env.data.checks.find((c: { name: string }) => c.name === "workspace_pin");
        expect(pin.ok).toBe(false);
        expect(pin.code).toBe("not_found");
        expect(pin.remediation).toMatch(/24-character workspace id/);
    });

    it("reports a connection_error remediation when health cannot reach Clockify", async () => {
        const client = await connect(
            fakeContext({
                health: {
                    ok: false,
                    latencyMs: 3,
                    error: new ClockifyConnectionError({ cause: new TypeError("fetch failed") }),
                },
            }),
        );
        const env = parse((await client.callTool({ name: "clockify_doctor", arguments: {} })) as never);
        const auth = env.data.checks.find((c: { name: string }) => c.name === "auth");
        expect(auth.code).toBe("connection_error");
        expect(auth.remediation).toMatch(/network/i);
    });

    it("warns on large clock skew but keeps the overall verdict on critical checks", async () => {
        const client = await connect(
            fakeContext({
                health: {
                    ok: true,
                    user: { id: "user-1", email: "alice@example.com", name: "Alice" },
                    latencyMs: 10,
                    serverTime: new Date(Date.now() + 30 * 60 * 1000), // +30 min
                },
            }),
        );
        const env = parse((await client.callTool({ name: "clockify_doctor", arguments: {} })) as never);
        const skew = env.data.checks.find((c: { name: string }) => c.name === "clock_skew");
        expect(skew.ok).toBe(false);
        expect(env.data.ok).toBe(true); // skew is non-critical; auth + pin still pass
        expect(env.warnings.some((w: { message: string }) => /skew/i.test(w.message))).toBe(true);
    });

    it("reports custom base-URL posture as host-only, never the full value", async () => {
        process.env.CLOCKIFY_BASE_URL = "https://mock.internal.example/api/v1?secret=x";
        const client = await connect(fakeContext());
        const env = parse((await client.callTool({ name: "clockify_doctor", arguments: {} })) as never);
        const baseUrl = env.data.checks.find((c: { name: string }) => c.name === "base_url");
        expect(baseUrl.detail).toContain("mock.internal.example");
        expect(baseUrl.detail).not.toContain("secret=x");
    });

    it("returns a structured setup_required fail when the server has no credentials", async () => {
        const client = await connect(setupRequiredContext());
        const res = await client.callTool({ name: "clockify_doctor", arguments: {} });
        expect(res.isError).toBeFalsy(); // diagnostic call itself still succeeds, never crashes
        const env = parse(res as never);
        expect(env.ok).toBe(true);
        expect(env.data.ok).toBe(false);
        expect(env.data.user).toBeNull();
        const config = env.data.checks.find((c: { name: string }) => c.name === "config");
        expect(config.ok).toBe(false);
        expect(config.code).toBe("setup_required");
        expect(config.remediation).toMatch(/CLOCKIFY_API_KEY/);
        expect(env.next[0].tool).toBe("clockify_status");
    });
});
