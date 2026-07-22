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
            ["generated wrapper/src/core/request.ts", generatedRequest],
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
