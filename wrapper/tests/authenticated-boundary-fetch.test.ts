import { describe, expect, it, vi } from "vitest";

import { authenticatedBoundaryFetch } from "../internal/authenticated-boundary-fetch.js";

describe("authenticatedBoundaryFetch", () => {
    it.each([
        "https://attacker.example/collect",
        "http://api.clockify.me/api/v1/user",
        "ftp://localhost/api/v1/user",
    ])("blocks an unsafe destination before the underlying dispatch: %s", async (destination) => {
        const dispatch = vi.fn<typeof fetch>();
        const guarded = authenticatedBoundaryFetch(dispatch, false);

        await expect(guarded(destination, { redirect: "manual" })).rejects.toBeDefined();
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("blocks redirect follow independently of generated prevalidation", async () => {
        const dispatch = vi.fn<typeof fetch>();
        const guarded = authenticatedBoundaryFetch(dispatch, false);

        await expect(
            guarded("https://api.clockify.me/api/v1/user", { redirect: "follow" }),
        ).rejects.toThrow(/redirect.*follow|follow.*redirect/i);
        expect(dispatch).not.toHaveBeenCalled();
    });

    it.each([
        "https://api.clockify.me/api/v1/user",
        "https://reports.api.clockify.me/v1/workspaces/workspace/reports/summary",
        "http://127.0.0.1:19091/api/v1/user",
    ])("dispatches an allowed destination: %s", async (destination) => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));
        const guarded = authenticatedBoundaryFetch(dispatch, false);

        await expect(guarded(destination, { redirect: "manual" })).resolves.toHaveProperty(
            "status",
            204,
        );
        expect(dispatch).toHaveBeenCalledOnce();
    });

    it("dispatches an explicitly trusted alternate HTTPS host", async () => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));
        const guarded = authenticatedBoundaryFetch(dispatch, true);

        await expect(
            guarded("https://trusted-proxy.example/api/v1/user", { redirect: "manual" }),
        ).resolves.toHaveProperty("status", 204);
        expect(dispatch).toHaveBeenCalledOnce();
    });
});
