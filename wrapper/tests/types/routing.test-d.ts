import { expectTypeOf, test } from "vitest";

import {
    createClockifyClient,
    type ClockifyRegion,
    type ClockifyRoutingOptions,
    type ClockifyService,
} from "../../create-client.js";

test("ClockifyService names exactly the services with live-proven routing", () => {
    expectTypeOf<ClockifyService>().toEqualTypeOf<"regular" | "reports" | "audit">();
});

test("ClockifyRegion names every documented profile, confirmed or not", () => {
    expectTypeOf<ClockifyRegion>().toEqualTypeOf<"global" | "eu" | "us" | "uk" | "au" | "developer">();
});

test("global profile needs no acknowledgement", () => {
    const routing: ClockifyRoutingOptions = { profile: "global" };
    expectTypeOf(routing).toExtend<ClockifyRoutingOptions>();
});

test("an unconfirmed region requires acknowledgeUnconfirmedRegion: true", () => {
    const routing: ClockifyRoutingOptions = {
        profile: "eu",
        acknowledgeUnconfirmedRegion: true,
    };
    expectTypeOf(routing).toExtend<ClockifyRoutingOptions>();

    // @ts-expect-error: acknowledgeUnconfirmedRegion is required for a non-global region
    const missingAck: ClockifyRoutingOptions = {
        profile: "eu",
    };
    void missingAck;
});

test("rejects an unknown region/profile name", () => {
    const bogus: ClockifyRoutingOptions = {
        // @ts-expect-error: "mars" is not a documented Clockify profile
        profile: "mars",
        acknowledgeUnconfirmedRegion: true,
    };
    void bogus;
});

test("subdomain profile requires a confirmed regional prefix, not global or developer", () => {
    const valid: ClockifyRoutingOptions = {
        profile: "subdomain",
        region: "eu",
        subdomain: "acme",
        acknowledgeUnconfirmedRegion: true,
    };
    expectTypeOf(valid).toExtend<ClockifyRoutingOptions>();

    const globalSubdomain: ClockifyRoutingOptions = {
        profile: "subdomain",
        // @ts-expect-error: "global" has no regional prefix for a subdomain to attach to
        region: "global",
        subdomain: "acme",
        acknowledgeUnconfirmedRegion: true,
    };
    void globalSubdomain;

    const developerSubdomain: ClockifyRoutingOptions = {
        profile: "subdomain",
        // @ts-expect-error: "developer" is not an approved subdomain-backing profile
        region: "developer",
        subdomain: "acme",
        acknowledgeUnconfirmedRegion: true,
    };
    void developerSubdomain;
});

test("custom profile requires allowCustomHttpsHosts: true and rejects an unknown service key", () => {
    const valid: ClockifyRoutingOptions = {
        profile: "custom",
        services: { regular: "https://proxy.example.com/api/v1" },
        allowCustomHttpsHosts: true,
    };
    expectTypeOf(valid).toExtend<ClockifyRoutingOptions>();

    const unknownService: ClockifyRoutingOptions = {
        profile: "custom",
        services: {
            regular: "https://proxy.example.com/api/v1",
            // @ts-expect-error: "pto" is not a nameable Clockify service (no live operation routes there)
            pto: "https://proxy.example.com/pto/v1",
        },
        allowCustomHttpsHosts: true,
    };
    void unknownService;

    // @ts-expect-error: allowCustomHttpsHosts is required, not optional, for the custom profile
    const missingOptIn: ClockifyRoutingOptions = {
        profile: "custom",
        services: { regular: "https://proxy.example.com/api/v1" },
    };
    void missingOptIn;
});

test("createClockifyClient rejects routing combined with environment/baseUrl", () => {
    createClockifyClient({
        apiKey: "x",
        environment: "https://api.clockify.me/api/v1",
        // @ts-expect-error: routing and environment are mutually exclusive
        routing: { profile: "global" },
    });

    createClockifyClient({
        apiKey: "x",
        baseUrl: "https://api.clockify.me/api/v1",
        // @ts-expect-error: routing and baseUrl are mutually exclusive
        routing: { profile: "global" },
    });
});

test("createClockifyClient accepts routing alone", () => {
    createClockifyClient({ apiKey: "x", routing: { profile: "global" } });
    createClockifyClient({
        apiKey: "x",
        routing: { profile: "eu", acknowledgeUnconfirmedRegion: true },
    });
});
