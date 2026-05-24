/**
 * Vitest version of `scripts/verify-dual-build.sh`. Catches the
 * same drift (a public export added at the package root that
 * lands in ESM but not CJS, or vice versa), but runs as part of
 * `npm test` so dev-loop iterations surface the issue without a
 * separate `npm run build:smoke` invocation.
 *
 * Both checks compare against the same 17-name baseline used by
 * the shell smoke script + `wrapper/scripts/verify-dual-build.sh`.
 * Update both when adding a new root export.
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WRAPPER_ROOT = resolve(import.meta.dirname, "..");
const ESM_INDEX = resolve(WRAPPER_ROOT, "dist/esm/index.js");
const CJS_INDEX = resolve(WRAPPER_ROOT, "dist/cjs/index.js");

const EXPECTED_EXPORTS = [
    // classes
    "ClockifyApiClient",
    "WebhookSignatureMismatchError",
    "ClockifyApiError",
    "ClockifyApiTimeoutError",
    "BadRequestError",
    "UnauthorizedError",
    "ForbiddenError",
    "NotFoundError",
    "MethodNotAllowedError",
    // factories + functions
    "createClockifyClient",
    "composedFetch",
    "iterAll",
    "iterPages",
    "paginate",
    "verifyClockifyWebhook",
    "constructEvent",
    "getRequestIdFromError",
    "withResponse",
] as const;

// Run only when both built artifacts exist. dev-loop without
// build → skip; CI runs `npm run build` before `npm test` so
// both files are present.
const dualBuildAvailable = existsSync(ESM_INDEX) && existsSync(CJS_INDEX);
const describeBuilt = dualBuildAvailable ? describe : describe.skip;

if (!dualBuildAvailable) {
    console.warn(
        "[dual-build.test] dist/esm or dist/cjs missing — skipping. Run `npm run build` first.",
    );
}

describeBuilt("dual ESM + CJS public surface", () => {
    it("ESM exposes every expected name", async () => {
        const m = (await import(ESM_INDEX)) as Record<string, unknown>;
        const missing = EXPECTED_EXPORTS.filter(
            (name) => typeof m[name] !== "function" && typeof m[name] !== "object",
        );
        expect(missing).toEqual([]);
    });

    it("CJS exposes every expected name", () => {
        // Use createRequire to load the CJS bundle directly — bypasses
        // Vite's CJS-to-ESM interop, which spreads exports across
        // both top-level and `default` keys depending on emit shape.
        const require_ = createRequire(import.meta.url);
        const m = require_(CJS_INDEX) as Record<string, unknown>;
        const missing = EXPECTED_EXPORTS.filter(
            (name) => typeof m[name] !== "function" && typeof m[name] !== "object",
        );
        expect(missing).toEqual([]);
    });

    it("ESM and CJS expose the same set of names (no drift)", async () => {
        const esm = (await import(ESM_INDEX)) as Record<string, unknown>;
        const require_ = createRequire(import.meta.url);
        const cjs = require_(CJS_INDEX) as Record<string, unknown>;

        const ignored = new Set(["default", "__esModule"]);
        const esmNames = new Set(Object.keys(esm).filter((k) => !ignored.has(k)));
        const cjsNames = new Set(Object.keys(cjs).filter((k) => !ignored.has(k)));

        const onlyEsm = [...esmNames].filter((n) => !cjsNames.has(n));
        const onlyCjs = [...cjsNames].filter((n) => !esmNames.has(n));

        expect(onlyEsm).toEqual([]);
        expect(onlyCjs).toEqual([]);
    });
});
