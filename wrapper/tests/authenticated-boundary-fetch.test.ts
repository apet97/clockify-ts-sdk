import { describe, expect, it, vi } from "vitest";

import { authenticatedBoundaryFetch } from "../internal/authenticated-boundary-fetch.js";

describe("authenticatedBoundaryFetch", () => {
    // Each row pins WHICH boundary rejected: a bare `rejects.toBeDefined()` is
    // satisfied by any rejection, so a classifier regression that re-bucketed a
    // destination would keep passing.
    it.each([
        ["https://attacker.example/collect", /is not an allowlisted Clockify host/],
        ["http://api.clockify.me/api/v1/user", /must use https:\/\/ for non-loopback hosts/],
        ["ftp://localhost/api/v1/user", /must use the http:\/\/ or https:\/\/ protocol/],
    ])("blocks an unsafe destination before the underlying dispatch: %s", async (destination, expected) => {
        const dispatch = vi.fn<typeof fetch>();
        const guarded = authenticatedBoundaryFetch(dispatch, false);

        await expect(guarded(destination, { redirect: "manual" })).rejects.toThrow(expected);
        expect(dispatch).not.toHaveBeenCalled();
    });

    it.each([
        ["official", "https://boundary-user:boundary-pass@api.clockify.me/api/v1/user", false],
        ["loopback", "http://boundary-user:boundary-pass@127.0.0.1:19091/api/v1/user", false],
        ["alternate", "https://boundary-user:boundary-pass@trusted-proxy.example/api/v1/user", true],
    ])("rejects credentials on %s hosts without echoing them", async (_kind, destination, allowAlternate) => {
        const dispatch = vi.fn<typeof fetch>();
        const guarded = authenticatedBoundaryFetch(dispatch, allowAlternate);

        const error = await guarded(destination, { redirect: "manual" }).then(
            () => undefined,
            (raised: unknown) => raised,
        );

        expect(error).toBeInstanceOf(TypeError);
        expect(String(error)).toMatch(/must not contain embedded credentials/i);
        expect(String(error)).not.toContain("boundary-user");
        expect(String(error)).not.toContain("boundary-pass");
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

    it("classifies a blocked redirect-follow config as RedirectNotAllowedError, not TypeError (SDK-1)", async () => {
        // A plain TypeError matched no guard in the retry loop, so this
        // deterministic, permanent validation failure slept through the full
        // backoff schedule before surfacing (and inflated retry metrics).
        const dispatch = vi.fn<typeof fetch>();
        const guarded = authenticatedBoundaryFetch(dispatch, false);

        const error = await guarded("https://api.clockify.me/api/v1/user", {
            redirect: "follow",
        }).then(
            () => undefined,
            (raised: unknown) => raised as Error,
        );
        expect(error).toBeInstanceOf(Error);
        expect(error?.name).toBe("RedirectNotAllowedError");
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("blocks redirect follow carried by a Request without an init override", async () => {
        const dispatch = vi.fn<typeof fetch>();
        const guarded = authenticatedBoundaryFetch(dispatch, false);
        const request = new Request("https://api.clockify.me/api/v1/user", {
            redirect: "follow",
        });

        await expect(guarded(request)).rejects.toThrow(/redirect.*follow|follow.*redirect/i);
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

    it.each([
        "https://euc1.clockify.me/api/v1/user",
        "https://use2.clockify.me/report/v1/workspaces/w/reports/summary",
        "https://euw2.clockify.me/api/v1/user",
        "https://apse2.clockify.me/api/v1/user",
        "https://developer.clockify.me/api/v1/user",
    ])("dispatches an approved regional/developer host without the alternate-host escape: %s", async (destination) => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));
        const guarded = authenticatedBoundaryFetch(dispatch, false);

        await expect(guarded(destination, { redirect: "manual" })).resolves.toHaveProperty("status", 204);
        expect(dispatch).toHaveBeenCalledOnce();
    });

    it.each([
        "https://acme.clockify.me/report/v1",
        "https://a-b-9.clockify.me/report/v1",
    ])("dispatches a well-formed workspace-subdomain host without the alternate-host escape: %s", async (destination) => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));
        const guarded = authenticatedBoundaryFetch(dispatch, false);

        await expect(guarded(destination, { redirect: "manual" })).resolves.toHaveProperty("status", 204);
        expect(dispatch).toHaveBeenCalledOnce();
    });

    it.each([
        "https://pto.api.clockify.me/v1/user",
        "https://a.b.clockify.me/report/v1",
        "https://xn--mnchen-3ya.clockify.me/report/v1",
        "https://-acme.clockify.me/report/v1",
        "https://clockify.me.attacker.example/report/v1",
    ])("rejects a dead, malformed-subdomain, or lookalike host without the alternate-host escape: %s", async (destination) => {
        const dispatch = vi.fn<typeof fetch>();
        const guarded = authenticatedBoundaryFetch(dispatch, false);

        // All five rows classify `non-clockify`; pin that, so a regression to
        // `unparseable` (which would silently stop honoring the
        // `allowNonClockifyHttpsHost` opt-in for them) is caught here.
        await expect(guarded(destination, { redirect: "manual" })).rejects.toThrow(
            /is not an allowlisted Clockify host/,
        );
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("dispatches an explicitly trusted alternate HTTPS host", async () => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));
        const guarded = authenticatedBoundaryFetch(dispatch, true);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        try {
            await expect(
                guarded("https://trusted-proxy.example/api/v1/user", { redirect: "manual" }),
            ).resolves.toHaveProperty("status", 204);
            expect(dispatch).toHaveBeenCalledOnce();
            expect(warn).toHaveBeenCalledOnce();
        } finally {
            warn.mockRestore();
        }
    });
});
