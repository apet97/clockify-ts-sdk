/**
 * Official Clockify API hosts accepted for authenticated dispatch.
 *
 * Authenticated-host equality: this set is the single hand-written copy of
 * the allowlist. The generated core request runtime (`CLOCKIFY_API_HOSTS`,
 * emitted by `scripts/sdk-codegen/emitter.mjs`) and the emitted
 * per-operation `baseUrl` hosts must stay equal to it —
 * `wrapper/tests/authenticated-host-equality.test.ts` fails closed on drift.
 */
export const CLOCKIFY_PROD_HOSTS: ReadonlySet<string> = new Set([
    "api.clockify.me",
    "reports.api.clockify.me",
    "auditlog-api.api.clockify.me",
    "pto.api.clockify.me",
    "developer.clockify.me",
]);

/** Loopback hostnames accepted on any port for testing and local mocks. */
export const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Outcome of {@link classifyClockifyBaseUrl}. */
export interface ClockifyBaseUrlClassification {
    /** Whether the URL is allowed without an explicit alternate-host opt-in. */
    allowed: boolean;
    /** Stable category used by diagnostics and validation. */
    category: "prod" | "loopback" | "non-https" | "non-clockify" | "unparseable";
    /** Parsed hostname when the URL parsed, else `undefined`. */
    host?: string;
    /** Human-readable reason when `allowed` is false. */
    reason?: string;
}

/**
 * Classify a base URL against the Clockify host allowlist without
 * throwing. Loopback may use plain HTTP; every other host must use
 * HTTPS.
 */
export function classifyClockifyBaseUrl(baseUrl: string): ClockifyBaseUrlClassification {
    let parsed: URL;
    try {
        parsed = new URL(baseUrl);
    } catch {
        return {
            allowed: false,
            category: "unparseable",
            reason: `base URL ${JSON.stringify(baseUrl)} is not a valid absolute URL.`,
        };
    }

    const host = parsed.hostname;
    const isLoopback = LOOPBACK_HOSTS.has(host) || LOOPBACK_HOSTS.has(host.toLowerCase());

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return {
            allowed: false,
            category: "unparseable",
            host,
            reason: `base URL must use the http:// or https:// protocol; got ${parsed.protocol}`,
        };
    }

    if (isLoopback) {
        return { allowed: true, category: "loopback", host };
    }

    if (parsed.protocol !== "https:") {
        return {
            allowed: false,
            category: "non-https",
            host,
            reason: `base URL must use https:// for non-loopback hosts; got ${parsed.protocol}//${host}.`,
        };
    }

    if (CLOCKIFY_PROD_HOSTS.has(host.toLowerCase())) {
        return { allowed: true, category: "prod", host };
    }

    return {
        allowed: false,
        category: "non-clockify",
        host,
        reason: `base URL host ${JSON.stringify(host)} is not an allowlisted Clockify host (expected an *.clockify.me API host or a loopback host).`,
    };
}

/** Validate a base URL override before authenticated dispatch. */
export function validateClockifyBaseUrl<T>(value: T, allowAlternateHost = false): T {
    if (typeof value !== "string") return value;

    const result = classifyClockifyBaseUrl(value);
    if (result.allowed) return value;

    if (result.category === "non-https" || result.category === "unparseable") {
        throw new TypeError(`createClockifyClient: ${result.reason}`);
    }

    if (allowAlternateHost) {
        console.warn(
            `[clockify] WARNING: ${result.reason} Proceeding because allowNonClockifyHttpsHost was set — ` +
                `confirm this endpoint is trusted; auth headers (X-Api-Key / X-Addon-Token) will be sent to it.`,
        );
        return value;
    }

    throw new TypeError(
        `createClockifyClient: ${result.reason} ` +
            `Set allowNonClockifyHttpsHost: true to opt in to a non-Clockify HTTPS endpoint, ` +
            `or use an *.clockify.me API host / a loopback host for testing.`,
    );
}

/**
 * Final authenticated-dispatch boundary. This remains package-private:
 * callers use the public factory, while focused tests import this module
 * relatively to prove the defense independently of generated validation.
 */
export function authenticatedBoundaryFetch(
    underlying: typeof fetch | undefined,
    allowNonClockifyHttpsHost: boolean,
): typeof fetch {
    const dispatch = underlying ?? globalThis.fetch;
    return async (input, init) => {
        const destination =
            typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        validateClockifyBaseUrl(destination, allowNonClockifyHttpsHost);
        const redirect = init?.redirect ?? (input instanceof Request ? input.redirect : undefined);
        if (redirect === "follow") {
            throw new TypeError(
                "createClockifyClient: redirect follow is not allowed for authenticated requests.",
            );
        }
        return await dispatch(input, init);
    };
}
