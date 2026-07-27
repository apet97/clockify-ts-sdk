import assert from "node:assert/strict";

import { describe, test } from "vitest";

import {
    buildServiceBaseUrlOverrides,
    resolveServiceBaseUrl,
    validateRoutingOptions,
    type ClockifyRoutingOptions,
} from "../internal/routing.js";

const FALLBACK = "https://api.clockify.me/api/v1";

describe("validateRoutingOptions", () => {
    test("accepts undefined (no routing configured)", () => {
        assert.doesNotThrow(() => validateRoutingOptions(undefined));
    });

    test("accepts the global profile", () => {
        assert.doesNotThrow(() => validateRoutingOptions({ profile: "global" }));
    });

    test("rejects an unrecognized profile name at runtime (JS caller, no compiler)", () => {
        assert.throws(
            () => validateRoutingOptions({ profile: "mars" } as unknown as ClockifyRoutingOptions),
            /not a recognized Clockify routing profile/i,
        );
    });

    test("rejects a non-global region without acknowledgeUnconfirmedRegion (JS caller, no compiler)", () => {
        assert.throws(
            () => validateRoutingOptions({ profile: "eu" } as unknown as ClockifyRoutingOptions),
            /acknowledgeUnconfirmedRegion/,
        );
    });

    test("accepts a non-global region with acknowledgeUnconfirmedRegion: true", () => {
        assert.doesNotThrow(() =>
            validateRoutingOptions({ profile: "eu", acknowledgeUnconfirmedRegion: true }),
        );
    });

    test("rejects a subdomain profile whose region has no regional prefix (JS caller, no compiler)", () => {
        assert.throws(
            () =>
                validateRoutingOptions({
                    profile: "subdomain",
                    region: "global",
                    subdomain: "acme",
                    acknowledgeUnconfirmedRegion: true,
                } as unknown as ClockifyRoutingOptions),
            /region/i,
        );
    });

    test("rejects an invalid subdomain label", () => {
        assert.throws(
            () =>
                validateRoutingOptions({
                    profile: "subdomain",
                    region: "eu",
                    subdomain: "Not Valid!",
                    acknowledgeUnconfirmedRegion: true,
                }),
            /subdomain/i,
        );
    });

    test("accepts a valid subdomain profile", () => {
        assert.doesNotThrow(() =>
            validateRoutingOptions({
                profile: "subdomain",
                region: "eu",
                subdomain: "acme-corp",
                acknowledgeUnconfirmedRegion: true,
            }),
        );
    });

    test("rejects a custom profile with a non-HTTPS service URL", () => {
        assert.throws(
            () =>
                validateRoutingOptions({
                    profile: "custom",
                    services: { regular: "http://proxy.example.com/api/v1" },
                    allowCustomHttpsHosts: true,
                }),
            /https/i,
        );
    });

    test("rejects a custom profile with embedded credentials in a service URL", () => {
        assert.throws(
            () =>
                validateRoutingOptions({
                    profile: "custom",
                    services: { regular: "https://user:pass@proxy.example.com/api/v1" },
                    allowCustomHttpsHosts: true,
                }),
            /credentials/i,
        );
    });

    test("accepts a valid custom profile", () => {
        assert.doesNotThrow(() =>
            validateRoutingOptions({
                profile: "custom",
                services: { regular: "https://proxy.example.com/api/v1" },
                allowCustomHttpsHosts: true,
            }),
        );
    });
});

describe("resolveServiceBaseUrl precedence", () => {
    test("no routing configured: falls back to the caller-supplied default", () => {
        assert.equal(resolveServiceBaseUrl("regular", undefined, FALLBACK), FALLBACK);
    });

    test("global profile: falls back to the caller-supplied default (no override)", () => {
        assert.equal(resolveServiceBaseUrl("regular", { profile: "global" }, FALLBACK), FALLBACK);
    });

    test("region profile: overrides regular with the approved regional template", () => {
        const result = resolveServiceBaseUrl(
            "regular",
            { profile: "eu", acknowledgeUnconfirmedRegion: true },
            FALLBACK,
        );
        assert.equal(result, "https://euc1.clockify.me/api/v1");
    });

    test("region profile: overrides reports with the approved regional template", () => {
        const result = resolveServiceBaseUrl(
            "reports",
            { profile: "us", acknowledgeUnconfirmedRegion: true },
            FALLBACK,
        );
        assert.equal(result, "https://use2.clockify.me/report/v1");
    });

    test("region profile: falls back to the default for a service with no regional row (audit)", () => {
        const result = resolveServiceBaseUrl(
            "audit",
            { profile: "eu", acknowledgeUnconfirmedRegion: true },
            FALLBACK,
        );
        assert.equal(result, FALLBACK);
    });

    test("developer profile: overrides regular and reports with the documented developer hosts", () => {
        const routing: ClockifyRoutingOptions = {
            profile: "developer",
            acknowledgeUnconfirmedRegion: true,
        };
        assert.equal(resolveServiceBaseUrl("regular", routing, FALLBACK), "https://developer.clockify.me/api/v1");
        assert.equal(
            resolveServiceBaseUrl("reports", routing, FALLBACK),
            "https://developer.clockify.me/report/v1",
        );
    });

    test("subdomain profile: overrides reports with the subdomain host, regular stays on the region prefix", () => {
        const routing: ClockifyRoutingOptions = {
            profile: "subdomain",
            region: "eu",
            subdomain: "acme",
            acknowledgeUnconfirmedRegion: true,
        };
        assert.equal(resolveServiceBaseUrl("reports", routing, FALLBACK), "https://acme.clockify.me/report/v1");
        assert.equal(resolveServiceBaseUrl("regular", routing, FALLBACK), "https://euc1.clockify.me/api/v1");
    });

    test("custom profile: an explicit per-service URL wins outright over any profile row", () => {
        const routing: ClockifyRoutingOptions = {
            profile: "custom",
            services: { regular: "https://proxy.example.com/api/v1" },
            allowCustomHttpsHosts: true,
        };
        assert.equal(resolveServiceBaseUrl("regular", routing, FALLBACK), "https://proxy.example.com/api/v1");
    });

    test("custom profile: a service missing from the explicit map falls back to the default", () => {
        const routing: ClockifyRoutingOptions = {
            profile: "custom",
            services: { regular: "https://proxy.example.com/api/v1" },
            allowCustomHttpsHosts: true,
        };
        assert.equal(resolveServiceBaseUrl("reports", routing, FALLBACK), FALLBACK);
    });
});

describe("buildServiceBaseUrlOverrides", () => {
    test("undefined routing produces no overrides", () => {
        assert.deepEqual(buildServiceBaseUrlOverrides(undefined), {});
    });

    test("global profile produces no overrides", () => {
        assert.deepEqual(buildServiceBaseUrlOverrides({ profile: "global" }), {});
    });

    test("a region profile overrides only the services it has rows for", () => {
        assert.deepEqual(buildServiceBaseUrlOverrides({ profile: "eu", acknowledgeUnconfirmedRegion: true }), {
            regular: "https://euc1.clockify.me/api/v1",
            reports: "https://euc1.clockify.me/report/v1",
        });
    });

    test("a custom profile naming only regular does not erase reports/audit (no entry for them)", () => {
        const overrides = buildServiceBaseUrlOverrides({
            profile: "custom",
            services: { regular: "https://proxy.example.com/api/v1" },
            allowCustomHttpsHosts: true,
        });
        assert.deepEqual(overrides, { regular: "https://proxy.example.com/api/v1" });
        assert.ok(!("reports" in overrides), "reports must have no entry, not be erased to a fallback");
        assert.ok(!("audit" in overrides), "audit must have no entry, not be erased to a fallback");
    });

    test("subdomain profile overrides only reports, regular stays on the region prefix", () => {
        const overrides = buildServiceBaseUrlOverrides({
            profile: "subdomain",
            region: "eu",
            subdomain: "acme",
            acknowledgeUnconfirmedRegion: true,
        });
        assert.deepEqual(overrides, {
            regular: "https://euc1.clockify.me/api/v1",
            reports: "https://acme.clockify.me/report/v1",
        });
    });
});
