import { describe, expect, it, vi } from "vitest";

import { createClockifyClient } from "../create-client.js";
import type { HealthCheckResult } from "../health.js";

const USER_PAYLOAD = JSON.stringify({
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
});

describe("client.health()", () => {
    it("returns ok=true with user + latency + serverTime", async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response(USER_PAYLOAD, {
                    status: 200,
                    headers: {
                        "content-type": "application/json",
                        date: "Mon, 25 May 2026 22:00:00 GMT",
                    },
                }),
        );
        const client = createClockifyClient({
            apiKey: "test",
            fetch: fetchMock as typeof fetch,
        });
        const result: HealthCheckResult = await client.health();
        expect(result.ok).toBe(true);
        expect(result.user?.id).toBe("user-1");
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
        expect(result.serverTime).toBeInstanceOf(Date);
        expect(result.error).toBeUndefined();
    });

    it("returns ok=false on 401", async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response(JSON.stringify({ code: "unauthorized", message: "bad token" }), {
                    status: 401,
                    headers: { "content-type": "application/json" },
                }),
        );
        const client = createClockifyClient({
            apiKey: "bad",
            fetch: fetchMock as typeof fetch,
        });
        const result = await client.health();
        expect(result.ok).toBe(false);
        expect(result.user).toBeUndefined();
        expect(result.error).toBeDefined();
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("returns ok=false on connection error", async () => {
        const fetchMock = vi.fn(async () => {
            throw new TypeError("fetch failed");
        });
        const client = createClockifyClient({
            apiKey: "test",
            fetch: fetchMock as typeof fetch,
        });
        const result = await client.health();
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
    });

    it("omits serverTime when response has no Date header", async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response(USER_PAYLOAD, {
                    status: 200,
                    headers: { "content-type": "application/json" }, // no Date
                }),
        );
        const client = createClockifyClient({
            apiKey: "test",
            fetch: fetchMock as typeof fetch,
        });
        const result = await client.health();
        expect(result.ok).toBe(true);
        expect(result.serverTime).toBeUndefined();
    });
});
