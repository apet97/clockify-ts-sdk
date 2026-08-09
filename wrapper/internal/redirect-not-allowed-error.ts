/**
 * Error surfaced when the redirect policy blocks a request — either a 3xx
 * response the wrapper refused to follow (the default `redirect: "manual"`
 * policy in `composed-fetch.ts`) or a `redirect: "follow"` configuration the
 * authenticated boundary rejects before dispatch. Internal-only — it is
 * thrown and propagates to the caller with a descriptive message, but is not
 * a public export, so the SDK's public-name surface is unchanged. Callers can
 * still branch on `err.name === "RedirectNotAllowedError"`.
 *
 * One class for both sites is load-bearing: the retry loop in
 * `composed-fetch.ts` stops on `instanceof RedirectNotAllowedError`, and
 * SDK-1 was exactly the boundary throwing a plain `TypeError` that matched
 * no guard, so a deterministic config error slept through the full backoff
 * schedule before surfacing.
 *
 * Every legitimate Clockify endpoint answers with a direct 2xx/4xx, so a
 * redirect off the trusted host is treated as an error rather than silently
 * followed — following it would re-send the auth headers (`X-Api-Key` /
 * `X-Addon-Token`) to the redirect target. With `redirect: "manual"` the
 * platform fetch returns the 3xx WITHOUT re-issuing the request, so those
 * headers were never re-sent before this error is raised.
 */
export class RedirectNotAllowedError extends Error {
    /** The 3xx status code that was blocked; undefined for a config rejection. */
    readonly status: number | undefined;
    /** The `Location` header value, when present. */
    readonly location: string | undefined;

    private constructor(message: string, status?: number, location?: string) {
        super(message);
        this.name = "RedirectNotAllowedError";
        this.status = status;
        this.location = location;
    }

    /** A 3xx response arrived under `redirect: "manual"` and was not followed. */
    static blockedResponse(status: number, location?: string): RedirectNotAllowedError {
        return new RedirectNotAllowedError(
            `composedFetch: refusing to follow HTTP ${status} redirect` +
                (location != null ? ` to ${JSON.stringify(location)}` : "") +
                " — auth headers are not re-sent across redirects; every Clockify endpoint answers with a direct 2xx/4xx.",
            status,
            location,
        );
    }

    /** The caller configured `redirect: "follow"` on an authenticated request. */
    static followNotAllowed(): RedirectNotAllowedError {
        return new RedirectNotAllowedError(
            "createClockifyClient: redirect follow is not allowed for authenticated requests.",
        );
    }
}
