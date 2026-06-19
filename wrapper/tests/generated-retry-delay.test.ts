import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const generatorPath = path.join(repoRoot, "scripts", "generate-sdk-from-openapi.mjs");
const generatedRequestPath = path.join(repoRoot, "wrapper", "src", "core", "request.ts");

const RETRY_MAX_DELAY_MS = 60_000;

// MIRROR of generated retryDelayMs template in scripts/generate-sdk-from-openapi.mjs.
function jitter(ms: number): number {
    const spread = ms * (1 + (Math.random() - 0.5) * 0.4);
    return Math.min(RETRY_MAX_DELAY_MS, Math.max(0, spread));
}

function retryDelayMs(response: Response | undefined, attempt: number): number {
    const retryAfter = response?.headers.get("Retry-After");
    if (retryAfter) {
        const seconds = Number.parseInt(retryAfter, 10);
        if (Number.isFinite(seconds)) return Math.min(RETRY_MAX_DELAY_MS, Math.max(0, seconds * 1000));
        const dateMs = Date.parse(retryAfter);
        if (Number.isFinite(dateMs)) {
            return Math.min(RETRY_MAX_DELAY_MS, Math.max(0, dateMs - Date.now()));
        }
    }
    const reset = response?.headers.get("X-RateLimit-Reset");
    if (reset) {
        const seconds = Number.parseInt(reset, 10);
        if (Number.isFinite(seconds)) {
            return Math.min(RETRY_MAX_DELAY_MS, Math.max(0, seconds * 1000 - Date.now()));
        }
    }
    return jitter(Math.min(RETRY_MAX_DELAY_MS, 1000 * 2 ** attempt));
}

describe("generated retry delay template", () => {
    it("keeps the generator and emitted request helper capped and jittered", () => {
        const generator = readFileSync(generatorPath, "utf8");
        const generatedRequest = readFileSync(generatedRequestPath, "utf8");

        for (const source of [generator, generatedRequest]) {
            expect(source).toContain("const RETRY_MAX_DELAY_MS = 60_000;");
            expect(source).toContain("function jitter(ms: number): number");
            expect(source).toContain("Math.random()");
            expect(source).not.toContain("return Math.min(60_000, 1000 * 2 ** attempt);");
        }
    });

    it("caps explicit retry headers at the generated max delay", () => {
        expect(retryDelayMs(new Response(null, { headers: { "Retry-After": "999999" } }), 0)).toBe(
            RETRY_MAX_DELAY_MS,
        );
        expect(retryDelayMs(new Response(null, { headers: { "Retry-After": "0" } }), 0)).toBe(0);

        vi.setSystemTime(new Date("2026-06-19T00:00:00.000Z"));
        const reset = Math.floor(Date.now() / 1000) + 999999;
        expect(
            retryDelayMs(new Response(null, { headers: { "X-RateLimit-Reset": String(reset) } }), 0),
        ).toBe(RETRY_MAX_DELAY_MS);
        vi.useRealTimers();
    });

    it("jitters fallback exponential delays within the generated spread", () => {
        vi.spyOn(Math, "random").mockReturnValue(0);
        expect(retryDelayMs(undefined, 2)).toBe(3200);

        vi.spyOn(Math, "random").mockReturnValue(1);
        expect(retryDelayMs(undefined, 2)).toBe(4800);

        vi.spyOn(Math, "random").mockReturnValue(1);
        expect(retryDelayMs(undefined, 16)).toBe(RETRY_MAX_DELAY_MS);
        vi.restoreAllMocks();
    });
});
