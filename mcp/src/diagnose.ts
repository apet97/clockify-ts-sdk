/**
 * Failure-class-aware recovery hints. Pure mapping from a stable error code to a
 * first-timer-actionable remediation string for the MCP surface. Shared by
 * clockify_status (and any future doctor tool) via the RecoveryResolver seam in
 * result.ts. No network, no I/O — unit-testable in isolation.
 */
import { recoveryForCode, retryableForCode, type ClockifyErrorCode } from "./error-codes.js";
import { errorCodeForError, type RecoveryHint } from "./result.js";

/**
 * Per-class remediation text, richer / more onboarding-oriented than the generic
 * docs/error-codes.json `recovery` field. Codes not listed here fall back to the
 * registry recovery string in failureHint(). Add codes here, never new codes to
 * the registry.
 */
export const FAILURE_HINTS: Partial<Record<ClockifyErrorCode, string>> = {
    auth_or_permission:
        "Authentication failed (HTTP 401/403). Regenerate your API key in Clockify > Profile Settings > API, set it as CLOCKIFY_API_KEY, and restart the MCP server. If the key is valid, your Clockify role or plan may lack permission for this workspace.",
    not_found:
        "Workspace or resource not found (HTTP 404). Confirm CLOCKIFY_WORKSPACE_ID is the 24-character workspace id (Clockify > Workspace Settings, or the id in the workspace URL) — a wrong or foreign id reads as not-found.",
    connection_error:
        "Could not reach Clockify before any HTTP response. Check network, DNS, TLS, and any HTTPS proxy; if CLOCKIFY_BASE_URL is set, confirm it points at a real Clockify host. Retry with backoff.",
    rate_limited:
        "Clockify rate-limited the request (HTTP 429). Wait for the Retry-After / X-RateLimit-Reset window, then retry once.",
    rate_limited_retry_after:
        "Clockify rate-limited the request (HTTP 429) and named a retry window. Read Retry-After (seconds) or X-RateLimit-Reset (epoch) from the response headers, wait that long, then retry once.",
    clockify_upstream_error:
        "Clockify returned a server-side error (HTTP 5xx). This is usually transient — retry with backoff; preserve the request id for support if it persists.",
    aborted:
        "The request was cancelled before completing. Re-run the tool when ready; do not auto-retry a caller cancellation.",
    feature_unavailable:
        "The endpoint exists but this workspace's plan or feature configuration does not expose it (HTTP 402). Use a supported plan, or skip the gated workflow.",
};

/** Re-derive the stable code with the same precedence errorResult uses. */
export function failureCode(err: unknown): ClockifyErrorCode {
    return errorCodeForError(err);
}

/**
 * Map a thrown error (or its already-derived code) to a failure-class-aware
 * recovery hint. Pass as the `recovery` resolver to defineTool, or call directly
 * with just `err` (e.g. from a future doctor tool).
 */
export function failureHint(
    err: unknown,
    code: ClockifyErrorCode = failureCode(err),
): RecoveryHint {
    return {
        hint: FAILURE_HINTS[code] ?? recoveryForCode(code),
        retryable: retryableForCode(code),
    };
}
