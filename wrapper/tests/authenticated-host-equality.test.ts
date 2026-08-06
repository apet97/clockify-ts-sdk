import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
    CLOCKIFY_PROD_HOSTS,
    LOOPBACK_HOSTS,
    authenticatedBoundaryFetch,
    classifyClockifyBaseUrl,
    validateClockifyBaseUrl,
} from "../internal/authenticated-boundary-fetch.js";
import { isValidSubdomainLabel } from "../internal/subdomain-label.js";
import { ClockifyApiClient } from "../src/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const generatorTemplatePath = path.join(repoRoot, "scripts", "sdk-codegen", "emitter.mjs");
const generatedRequestPath = path.join(repoRoot, "wrapper", "src", "core", "request.ts");
const generatedApiRoot = path.join(repoRoot, "wrapper", "src", "api");
const policyPath = path.join(repoRoot, "docs", "config-precedence-policy.md");

/**
 * Extract the string entries of a `const <name> = new Set([...])` literal
 * from source text. Fails the test (rather than passing vacuously) when the
 * literal is missing or empty, so a renamed or deleted allowlist cannot
 * silently disable the equality proof.
 */
function extractSetLiteral(source: string, name: string, label: string): string[] {
    const match = source.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`));
    expect(match, `${label}: const ${name} = new Set([...]) literal not found`).not.toBeNull();
    const entries = [...(match?.[1] ?? "").matchAll(/"([^"]+)"/g)].flatMap((m) =>
        m[1] === undefined ? [] : [m[1]],
    );
    expect(entries.length, `${label}: ${name} literal has no entries`).toBeGreaterThan(0);
    return entries.sort();
}

/** Recursively collect every emitted per-operation `baseUrl` literal. */
function collectPerOperationBaseUrls(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collectPerOperationBaseUrls(full, found);
        else if (entry.name.endsWith(".ts")) {
            for (const match of readFileSync(full, "utf8").matchAll(/baseUrl: "([^"]+)"/g)) {
                if (match[1] !== undefined) found.push(match[1]);
            }
        }
    }
    return found;
}

const handWrittenHosts = [...CLOCKIFY_PROD_HOSTS].sort();
const handWrittenLoopback = [...LOOPBACK_HOSTS].sort();
const perOperationBaseUrls = [...new Set(collectPerOperationBaseUrls(generatedApiRoot))].sort();
const perOperationHosts = [...new Set(perOperationBaseUrls.map((url) => new URL(url).hostname))].sort();

describe("authenticated-host equality", () => {
    it("keeps the hand-written, generated, and emitter-template host allowlists equal", () => {
        const generatedRequest = readFileSync(generatedRequestPath, "utf8");
        const generatorTemplate = readFileSync(generatorTemplatePath, "utf8");

        for (const [label, source] of [
            ["generated core request runtime", generatedRequest],
            ["emitter template scripts/sdk-codegen/emitter.mjs", generatorTemplate],
        ] as const) {
            expect(extractSetLiteral(source, "CLOCKIFY_API_HOSTS", label)).toEqual(handWrittenHosts);
            expect(extractSetLiteral(source, "LOOPBACK_HOSTS", label)).toEqual(handWrittenLoopback);
        }
    });

    it("emits per-operation hosts only from the shared allowlist", () => {
        // Fail closed: the scan must find the known non-default hosts, so a
        // changed literal shape cannot make this test pass on an empty set.
        expect(perOperationBaseUrls.length).toBeGreaterThan(0);
        expect(perOperationHosts.length).toBeGreaterThanOrEqual(2);

        for (const host of perOperationHosts) {
            expect(CLOCKIFY_PROD_HOSTS.has(host), `per-operation host ${host} missing from allowlist`).toBe(
                true,
            );
        }
        for (const baseUrl of perOperationBaseUrls) {
            const classification = classifyClockifyBaseUrl(baseUrl);
            expect(classification.allowed, `per-operation baseUrl ${baseUrl} rejected`).toBe(true);
            expect(classification.category).toBe("prod");
        }
    });

    it("accepts every per-operation host at the constructor and fetch boundaries alike", async () => {
        for (const baseUrl of perOperationBaseUrls) {
            expect(validateClockifyBaseUrl(baseUrl, false)).toBe(baseUrl);

            const dispatch = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
            const guarded = authenticatedBoundaryFetch(dispatch, false);
            await expect(guarded(`${baseUrl}/probe`, { redirect: "manual" })).resolves.toBeDefined();
            expect(dispatch).toHaveBeenCalledOnce();
        }
    });

    it("rejects near-miss hosts at the constructor and fetch boundaries alike", async () => {
        const nearMisses = [
            "https://auditlog.api.clockify.me/v1",
            "https://api.clockify.me.attacker.example/v1",
            "https://evil.example/v1",
        ];
        for (const baseUrl of nearMisses) {
            expect(classifyClockifyBaseUrl(baseUrl).allowed).toBe(false);
            expect(() => validateClockifyBaseUrl(baseUrl, false)).toThrow(TypeError);

            const dispatch = vi.fn<typeof fetch>();
            const guarded = authenticatedBoundaryFetch(dispatch, false);
            await expect(guarded(`${baseUrl}/probe`, { redirect: "manual" })).rejects.toBeDefined();
            expect(dispatch).not.toHaveBeenCalled();
        }
    });

    it.each([
        ["docs/config-precedence-policy.md", policyPath],
        ["wrapper/create-client.ts factory TSDoc", path.join(repoRoot, "wrapper", "create-client.ts")],
    ])("keeps the prose host list equal to the allowlist: %s", (label, filePath) => {
        const prose = readFileSync(filePath, "utf8");
        for (const host of handWrittenHosts) {
            expect(prose.includes(host), `${label} missing allowlisted host ${host}`).toBe(true);
        }
        // Every *.clockify.me host the prose names must be in the allowlist —
        // documentation cannot promise a host the runtime would reject.
        const namedHosts = [
            ...new Set(
                [...prose.matchAll(/`([a-z0-9-]+(?:\.[a-z0-9-]+)*\.clockify\.me)`/g)].flatMap((m) =>
                    m[1] === undefined ? [] : [m[1]],
                ),
            ),
        ];
        expect(namedHosts.length).toBeGreaterThan(0);
        for (const host of namedHosts) {
            expect(CLOCKIFY_PROD_HOSTS.has(host), `${label} names non-allowlisted host ${host}`).toBe(true);
        }
    });
});

/**
 * The set-literal equality above pins the *constants* the three copies share.
 * It says nothing about the two independent implementations that interpret
 * them: `subdomain-label.ts: isValidSubdomainLabel` (hand-written, used by
 * routing and the boundary fetch) and `request.ts: isApprovedWorkspaceSubdomainHost`
 * (generated, used at dispatch). A rule added to one and not the other keeps
 * every assertion above green while splitting validation from dispatch. This
 * drives both through one label corpus.
 *
 * The generated copy is not exported, so it is reached the way the runtime
 * reaches it: through the generated `ClockifyApiClient` (NOT the hand-written
 * `createClockifyClient`, whose own guard would answer first and hide it).
 * The corpus holds only labels that form a parseable URL — the one textual
 * difference between the two copies (`label.trim().length === 0` vs
 * `label.length === 0`) is unreachable, because a whitespace label makes the
 * base URL unparseable long before either validator sees it.
 */
describe("workspace-subdomain label validators agree", () => {
    const LABELS = [
        "acme",
        "acme-corp",
        "a",
        "a1",
        "1a",
        "x".repeat(63),
        "x".repeat(64),
        "ACME",
        "acme.corp",
        "-acme",
        "acme-",
        "xn--acme",
        "ac_me",
    ] as const;

    /** Reach the generated validator the only way a caller can: dispatch. */
    async function generatedAccepts(label: string): Promise<boolean> {
        try {
            const client = new ClockifyApiClient({
                apiKey: "k",
                environment: `https://${label}.clockify.me/api/v1`,
                fetch: vi.fn<typeof fetch>().mockResolvedValue(
                    new Response("{}", { headers: { "content-type": "application/json" } }),
                ),
            });
            await client.users.getCurrentUser();
            return true;
        } catch {
            return false;
        }
    }

    it.each(LABELS)("classifies %j identically at both boundaries", async (label) => {
        // Both boundaries read the label off a parsed URL, and URL parsing
        // lower-cases the host first, so that is the label they actually see
        // ("ACME" reaches them as "acme"). Compare against the same input.
        const expected = isValidSubdomainLabel(label.toLowerCase());
        expect(classifyClockifyBaseUrl(`https://${label}.clockify.me/api/v1`).allowed).toBe(expected);
        expect(await generatedAccepts(label)).toBe(expected);
    });

    it("keeps at least one label on each side of the corpus", () => {
        // Fail closed: an all-reject or all-accept corpus proves nothing.
        expect(LABELS.some((label) => isValidSubdomainLabel(label))).toBe(true);
        expect(LABELS.some((label) => !isValidSubdomainLabel(label))).toBe(true);
    });
});
