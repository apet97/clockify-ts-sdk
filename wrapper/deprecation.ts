/**
 * Lightweight deprecation helper.
 *
 * Convention for deprecating a public symbol — see CONTRIBUTING.md
 * for the full pattern. Briefly:
 *
 * - Tag the declaration with a JSDoc deprecation note so IDEs show
 *   strikethrough and tsdoc surfaces it in the API reference.
 * - Call `warnOnce(key, message)` at the runtime entry. Fires
 *   `console.warn` at most once per process per `key`. Silent under
 *   `NODE_ENV === "test"` so test runs don't get noisy.
 * - Remove the symbol entirely in the next major version.
 *
 * `key` is an opaque dedup token — typically the deprecated symbol's
 * name. Two `warnOnce` calls with the same key warn only once even if
 * the messages differ; differing keys warn independently.
 */

const seen = new Set<string>();

/**
 * Emit a deprecation warning at most once per `key` per process.
 *
 * @param key - Dedup token; reuse the same string at every call site of
 *   the deprecated symbol so users don't get a flood of warnings.
 * @param message - The user-visible warning text. Recommended shape:
 *   "`oldThing` is deprecated; use `newThing` instead (since vX.Y.Z)".
 */
export function warnOnce(key: string, message: string): void {
    if (seen.has(key)) return;
    seen.add(key);
    if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") return;
    console.warn(`[clockify-sdk-ts-115] DEPRECATION: ${message}`);
}

/** Reset the dedup state. Test-only helper; not part of the public
 *  contract. Exported because the alternative (poking the module's
 *  private `seen` Set from a test) is worse. */
export function _resetWarnOnceForTests(): void {
    seen.clear();
}
