import { describe, expect, it, vi } from "vitest";

import { ClockifyApiClient } from "../index.js";

function client(fetchImpl: typeof fetch, environment = "https://api.clockify.me/api/v1") {
    return new ClockifyApiClient({ apiKey: "secret", environment, fetch: fetchImpl });
}

describe("ClockifyApiClient.fetch", () => {
    it.each([
        "https://attacker.example/collect",
        new URL("https://attacker.example/collect"),
        new Request("https://attacker.example/collect"),
    ])("rejects an authenticated cross-origin destination before dispatch: %s", async (input) => {
        const dispatch = vi.fn<typeof fetch>();

        await expect(client(dispatch).fetch(input)).rejects.toThrow(/cross-origin/i);
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("resolves relative destinations against the configured base origin", async () => {
        const dispatch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));

        await client(dispatch).fetch("/workspaces/me");

        expect(dispatch.mock.calls[0]?.[0]).toBe(
            "https://api.clockify.me/api/v1/workspaces/me",
        );
    });

    it("preserves Request headers while authentication has final precedence", async () => {
        const dispatch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
        const sdk = client(dispatch);

        await sdk.fetch(
            new Request("https://api.clockify.me/api/v1/user", {
                headers: { "X-Input": "request", "X-Api-Key": "attacker" },
            }),
            { headers: { "X-Init": "init" } },
            { headers: { "X-Option": "option" } },
        );

        const headers = new Headers(dispatch.mock.calls[0]?.[1]?.headers);
        expect(headers.get("X-Input")).toBe("request");
        expect(headers.get("X-Init")).toBe("init");
        expect(headers.get("X-Option")).toBe("option");
        expect(headers.get("X-Api-Key")).toBe("secret");
    });

    it("encodes scalar and repeated query parameters", async () => {
        const dispatch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));

        await client(dispatch).fetch("users", undefined, {
            queryParams: { page: 2, status: ["ACTIVE", "PENDING"], omitted: undefined },
        });

        const rawTarget = dispatch.mock.calls[0]?.[0];
        expect(typeof rawTarget).toBe("string");
        const target = new URL(rawTarget as string);
        expect(target.searchParams.get("page")).toBe("2");
        expect(target.searchParams.getAll("status")).toEqual(["ACTIVE", "PENDING"]);
        expect(target.searchParams.has("omitted")).toBe(false);
    });

    it("validates a Promise base URL before dispatch", async () => {
        const dispatch = vi.fn<typeof fetch>();
        const sdk = new ClockifyApiClient({
            apiKey: "secret",
            environment: Promise.resolve("https://attacker.example/api/v1"),
            fetch: dispatch,
        });

        await expect(sdk.fetch("users")).rejects.toThrow(/not an allowlisted Clockify host/i);
        expect(dispatch).not.toHaveBeenCalled();
    });
});
