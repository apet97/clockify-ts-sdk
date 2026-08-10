/**
 * The three-step quickstart from docs/quickstart-receipt.md, as one runnable
 * script: (1) local diagnostics, no network; (2) construct a client, pointed
 * at a mock/live endpoint via CLOCKIFY_BASE_URL when set; (3) a health probe
 * (`GET /user`) that proves auth + connectivity together.
 *
 * Env: CLOCKIFY_API_KEY (optional — falls back to a placeholder so the
 *      diagnostics/construction steps always run); CLOCKIFY_BASE_URL
 *      (optional — mock or sandbox endpoint; omit for the real Clockify API).
 * Mode: mock-safe — with CLOCKIFY_BASE_URL pointing at a mock or replay
 *      server, every step including the health probe completes without a
 *      real Clockify account. See docs/quickstart-receipt.md for the
 *      non-coder walkthrough this mirrors.
 * Cleanup: none (read-only).
 * Expected output:
 *   Quickstart: local diagnostics computed (readiness=<value>).
 *   Quickstart: health check passed.
 *
 * Run: `npx tsx examples/quickstart.ts`
 */
import { clockifyDiagnostics, createClockifyClient } from "clockify-sdk-ts-115";

// Step 1: local diagnostics, no network. Never throws; never prints raw
// tokens (see docs/quickstart-receipt.md Step 1).
const diagnostics = clockifyDiagnostics();
console.log(`Quickstart: local diagnostics computed (readiness=${diagnostics.readiness}).`);
if (diagnostics.warnings.length > 0) {
    console.log(`Quickstart: diagnostics warnings: ${diagnostics.warnings.join("; ")}`);
}

// Step 2: construct a client. CLOCKIFY_BASE_URL routes to a mock/replay
// server or a sandboxed private endpoint only -- never set it for normal
// Clockify use (docs/quickstart-receipt.md's copy-paste-safety rule).
// `??` alone would not catch CLOCKIFY_API_KEY="" (an empty string is
// neither null nor undefined), and this repo's own local-proof convention
// runs with exactly that — treat a blank string the same as unset.
const envApiKey = process.env.CLOCKIFY_API_KEY;
const client = createClockifyClient({
    apiKey: envApiKey && envApiKey.length > 0 ? envApiKey : "demo-key",
    ...(process.env.CLOCKIFY_BASE_URL ? { environment: process.env.CLOCKIFY_BASE_URL } : {}),
    maxRetries: 0,
});

// Step 3: first probe -- `client.health()` calls `GET /user` and never
// throws, returning `{ ok, user, latencyMs, error }` for uniform handling.
const health = await client.health();
if (health.ok) {
    console.log("Quickstart: health check passed.");
    console.log(`Quickstart: signed in as ${health.user?.email ?? "unknown"} (${health.latencyMs}ms).`);
} else {
    console.log("Quickstart: health check did not pass (no reachable Clockify endpoint or invalid credentials).");
}
