import { afterEach, describe, expect, it, vi } from "vitest";

import { createClockifyClient } from "../create-client.js";
import type { HealthCheckResult } from "../health.js";

// Two tests below freeze Date.now. `restoreMocks` is not set in
// wrapper/vitest.config.ts, so restore here rather than only at the end of each
// test body — a failure before the inline restore would otherwise leak the
// frozen clock into the retry-heavy "connection error" case and mask it.
afterEach(() => {
    vi.restoreAllMocks();
});

const USER_PAYLOAD = JSON.stringify({
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
});

describe("client.health()", () => {
    it("returns ok=true with user + latency + serverTime", async () => {
        // Freeze Date.now and advance it inside the fetch mock: a hardcoded
        // `latencyMs = 0` would satisfy `toBeGreaterThanOrEqual(0)`, so pin the
        // exact measured duration instead. A mutable `now` read by the mock is
        // immune to however many times the SDK core calls Date.now().
        let now = 1_000;
        vi.spyOn(Date, "now").mockImplementation(() => now);
        const fetchMock = vi.fn(async () => {
            now += 250;
            return new Response(USER_PAYLOAD, {
                status: 200,
                headers: {
                    "content-type": "application/json",
                    date: "Mon, 25 May 2026 22:00:00 GMT",
                },
            });
        });
        const client = createClockifyClient({
            apiKey: "test",
            fetch: fetchMock as typeof fetch,
        });
        const result: HealthCheckResult = await client.health();
        expect(result.ok).toBe(true);
        expect(result.user?.id).toBe("user-1");
        expect(result.latencyMs).toBe(250);
        expect(result.serverTime).toBeInstanceOf(Date);
        expect(result.error).toBeUndefined();
    });

    it("returns ok=false on 401", async () => {
        let now = 5_000;
        vi.spyOn(Date, "now").mockImplementation(() => now);
        const fetchMock = vi.fn(async () => {
            now += 120;
            return new Response(JSON.stringify({ code: "unauthorized", message: "bad token" }), {
                status: 401,
                headers: { "content-type": "application/json" },
            });
        });
        const client = createClockifyClient({
            apiKey: "bad",
            fetch: fetchMock as typeof fetch,
        });
        const result = await client.health();
        expect(result.ok).toBe(false);
        expect(result.user).toBeUndefined();
        expect(result.error).toBeDefined();
        expect(result.latencyMs).toBe(120);
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
