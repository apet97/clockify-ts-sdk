/**
 * Client health-check primitive.
 *
 * One-call preflight that verifies connectivity, auth, and server
 * clock — by calling the "current user" endpoint, measuring
 * wall-clock latency, and parsing the response `Date` header for
 * clock-drift detection.
 *
 * Does NOT throw on error. Returns `{ ok: false, error }` for
 * uniform handling at call sites:
 *
 * @example
 * ```ts
 * import { createClockifyClient } from "clockify-sdk-ts";
 *
 * const client = createClockifyClient();
 * const health = await client.health();
 *
 * if (!health.ok) {
 *   console.error("clockify unhealthy", health.error);
 *   process.exit(1);
 * }
 * console.log(`signed in as ${health.user?.email} (${health.latencyMs}ms latency)`);
 * ```
 */
import type { UserDtoV1 } from "./src/api/types/UserDtoV1.js";
import type { ClockifyApiClient } from "./src/index.js";

/** Result of {@link clockifyHealth}. */
export interface HealthCheckResult {
    /** True if the underlying API call succeeded with a 2xx. */
    ok: boolean;
    /** The authenticated user. Present iff `ok: true`. */
    user?: UserDtoV1;
    /** Single-request wall-clock latency in ms. */
    latencyMs: number;
    /** Server-reported time parsed from the response `Date` header.
     *  Useful for client-clock-drift detection. Absent when the
     *  header was missing or unparseable. */
    serverTime?: Date;
    /** The error, when `ok: false`. The shape is whatever the
     *  underlying SDK throws — most commonly a `ClockifyApiError`
     *  subclass. Inspect via `instanceof`. */
    error?: unknown;
}

/**
 * Compute a {@link HealthCheckResult} by calling the current-user
 * endpoint (`GET /user`). Exported so callers can use it without
 * going through the `client.health()` shortcut.
 *
 * @example
 * ```ts
 * import { createClockifyClient, clockifyHealth } from "clockify-sdk-ts";
 *
 * const client = createClockifyClient();
 * const result = await clockifyHealth(client);
 * if (!result.ok) throw result.error;
 * ```
 */
export async function clockifyHealth(client: ClockifyApiClient): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
        const { data, rawResponse } = await client.users.getCurrentUser().withRawResponse();
        const latencyMs = Date.now() - start;
        const dateHeader = rawResponse.headers.get("date");
        const result: HealthCheckResult = {
            ok: true,
            user: data,
            latencyMs,
        };
        if (dateHeader != null) {
            const parsed = Date.parse(dateHeader);
            if (Number.isFinite(parsed)) {
                result.serverTime = new Date(parsed);
            }
        }
        return result;
    } catch (error) {
        return {
            ok: false,
            latencyMs: Date.now() - start,
            error,
        };
    }
}
