import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, test } from "vitest";

import { resolveServiceBaseUrl, type ClockifyRegion, type ClockifyService } from "../internal/routing.js";

/**
 * `wrapper/internal/routing.ts` hand-writes its own copy of the
 * H02-ROUTING-approved `docs/service-routing-matrix.json` region/subdomain
 * URL rows (wrapper runtime code cannot import that file's generator
 * tooling deps -- see routing.ts's header comment). This test fails closed
 * if the two drift, mirroring `authenticated-host-equality.test.ts`'s
 * pattern for `CLOCKIFY_PROD_HOSTS`.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const matrix = JSON.parse(fs.readFileSync(path.join(repoRoot, "docs", "service-routing-matrix.json"), "utf8"));

const REGIONS: readonly Exclude<ClockifyRegion, "global">[] = ["eu", "us", "uk", "au", "developer"];
const SERVICES: readonly ClockifyService[] = ["regular", "reports"];

describe("routing.ts region/subdomain templates match the approved service-routing matrix", () => {
    for (const region of REGIONS) {
        for (const service of SERVICES) {
            test(`${region}.${service}`, () => {
                const row = matrix.profiles[region][service];
                const expectedUrl = row.url ?? row.urlTemplate.replace("{prefix}", regionalPrefix(region));
                const resolved = resolveServiceBaseUrl(
                    service,
                    { profile: region, acknowledgeUnconfirmedRegion: true } as never,
                    "https://unused-fallback.invalid",
                );
                assert.equal(resolved, expectedUrl);
            });
        }
    }

    test("subdomain reports template matches docs/service-routing-matrix.json#/subdomainReportsTemplate", () => {
        const resolved = resolveServiceBaseUrl(
            "reports",
            { profile: "subdomain", region: "eu", subdomain: "acme", acknowledgeUnconfirmedRegion: true },
            "https://unused-fallback.invalid",
        );
        const expected = matrix.subdomainReportsTemplate.urlTemplate.replace("{subdomain}", "acme");
        assert.equal(resolved, expected);
    });

    test("every non-global matrix profile is present in ClockifyRegion", () => {
        const matrixProfiles = Object.keys(matrix.profiles).filter((name) => name !== "global");
        assert.deepEqual([...matrixProfiles].sort(), [...REGIONS].sort());
    });
});

function regionalPrefix(region: Exclude<ClockifyRegion, "global">): string {
    const prefixByRegion: Record<string, string> = { eu: "euc1", us: "use2", uk: "euw2", au: "apse2" };
    return prefixByRegion[region] ?? "";
}
