/**
 * Configured Clockify SDK client + the workspace pin every tool
 * operates against. Both come from environment variables so the
 * stdio MCP entrypoint can be launched without arguments by an MCP
 * client (Claude Desktop, etc.).
 */
import { createClockifyClient } from "clockify-sdk-ts-115";
import type { ComposedFetchHooks } from "clockify-sdk-ts-115/composed-fetch";
import type { ClockifyRegion, ClockifyRoutingOptions } from "clockify-sdk-ts-115/create-client";

import { ConfirmationTokenStore } from "./orchestration/confirmation.js";
import { currentRequestSignal, requestSignalFetch } from "./request-cancellation.js";

export const REGIONAL_PREFIXES = ["eu", "us", "uk", "au"] as const;
export const KNOWN_REGIONS = ["global", ...REGIONAL_PREFIXES, "developer"] as const;

/**
 * Build a `ClockifyRoutingOptions` from `CLOCKIFY_REGION`/`CLOCKIFY_SUBDOMAIN`.
 * Explicitly setting a non-global region in the server's env block is itself
 * the deliberate act ROUTE-002's `acknowledgeUnconfirmedRegion` flag exists to
 * require -- this loads it automatically rather than needing a third env var.
 */
export function buildRoutingOptions(
    region: string | undefined,
    subdomain: string | undefined,
): ClockifyRoutingOptions | undefined {
    if (region === undefined && subdomain === undefined) return undefined;

    if (subdomain !== undefined) {
        if (region === undefined || !(REGIONAL_PREFIXES as readonly string[]).includes(region)) {
            throw new Error(
                `CLOCKIFY_SUBDOMAIN requires CLOCKIFY_REGION to be one of ${REGIONAL_PREFIXES.join(", ")} (got ${JSON.stringify(region)}).`,
            );
        }
        return {
            profile: "subdomain",
            region: region as (typeof REGIONAL_PREFIXES)[number],
            subdomain,
            acknowledgeUnconfirmedRegion: true,
        };
    }

    if (region === "global") return { profile: "global" };

    if (region === undefined || !(KNOWN_REGIONS as readonly string[]).includes(region)) {
        throw new Error(
            `Unrecognized CLOCKIFY_REGION ${JSON.stringify(region)}. Expected one of ${KNOWN_REGIONS.join(", ")}.`,
        );
    }
    return {
        profile: region as Exclude<ClockifyRegion, "global">,
        acknowledgeUnconfirmedRegion: true,
    };
}

export type ClockifyClient = ReturnType<typeof createClockifyClient>;

/** Sanitized routing configuration retained for diagnostics. */
export interface RoutingPosture {
    mode: "default" | "base-url" | "region" | "subdomain";
    host?: string;
    region?: ClockifyRegion;
    subdomainConfigured: boolean;
}

function resolvedRoutingPosture(
    environment: string | undefined,
    routing: ClockifyRoutingOptions | undefined,
    configuredRegion: string | undefined,
): RoutingPosture {
    if (environment !== undefined) {
        return {
            mode: "base-url",
            host: new URL(environment).hostname,
            subdomainConfigured: false,
        };
    }
    if (routing === undefined) return { mode: "default", subdomainConfigured: false };
    if (routing.profile === "subdomain") {
        return {
            mode: "subdomain",
            region: routing.region,
            subdomainConfigured: true,
        };
    }
    const region = KNOWN_REGIONS.find((candidate) => candidate === configuredRegion);
    if (region === undefined) {
        throw new Error("clockify-mcp: resolved routing profile has no known region");
    }
    return { mode: "region", region, subdomainConfigured: false };
}

/**
 * Thrown lazily (at first `ctx.client` / `ctx.workspaceId` access) when the MCP
 * server was started without its required credentials. `errorResult` maps this
 * to a `setup_required` receipt, so the server stays up and every tool explains
 * the fix instead of the process crashing at startup.
 */
export class MissingCredentialsError extends Error {
    readonly missing: readonly string[];
    constructor(missing: readonly string[]) {
        super(buildSetupMessage(missing));
        this.name = "MissingCredentialsError";
        this.missing = missing;
    }
}

function buildSetupMessage(missing: readonly string[]): string {
    const parts: string[] = [];
    if (missing.includes("CLOCKIFY_API_KEY")) {
        parts.push("CLOCKIFY_API_KEY is not set.");
    }
    if (missing.includes("CLOCKIFY_WORKSPACE_ID")) {
        parts.push(
            "CLOCKIFY_WORKSPACE_ID is not set. The one-user server is pinned to a single workspace.",
        );
    }
    return (
        `Clockify MCP is not configured: ${parts.join(" ")}\n` +
        "Set them in your MCP client's env block, e.g.\n" +
        `  "@apet97/clockify-mcp-115": { "command": "clockify115-mcp", "env": { "CLOCKIFY_API_KEY": "...", "CLOCKIFY_WORKSPACE_ID": "..." } }\n` +
        "Get the API key from Clockify Profile Settings -> API; the workspace ID is in the workspace URL. Leave CLOCKIFY_BASE_URL unset for live Clockify."
    );
}

export interface Context {
    client: ClockifyClient;
    workspaceId: string;
    confirmationTokens?: ConfirmationTokenStore;
    /**
     * Memo for the current user's id. Successful results are cached for the
     * server lifetime; in-flight lookups are shared only within one request (or
     * among unscoped callers), so cancellation cannot poison another request.
     * OPTIONAL so hand-built test contexts still fall back to a direct lookup.
     * Resolves to "" when the user id cannot be determined.
     */
    currentUserId?: () => Promise<string>;
    /**
     * Present only when the server started without required credentials. The
     * server still runs; every tool returns a `setup_required` receipt because
     * `client` / `workspaceId` throw `MissingCredentialsError` on access.
     */
    setupError?: MissingCredentialsError;
    /**
     * Non-fatal startup diagnostics. stdout carries JSON-RPC, so these are
     * written to stderr by {@link warnStartupDiagnostics} and never returned
     * to the model.
     */
    startupNotices?: readonly string[];
    /** Actual route selected when this Context was constructed; contains no credentials. */
    routingPosture?: RoutingPosture;
}

/**
 * Build a `currentUserId` memo over a Clockify client. The resolved id is cached
 * for the process lifetime. In-flight work is shared within one MCP request
 * (and among callers outside a request), but not across request signals: one
 * caller cancelling its lookup must not reject another caller's lookup.
 * A failed fetch is not cached (the next call retries).
 */
export function createCurrentUserIdMemo(client: ClockifyClient): () => Promise<string> {
    let cached: string | undefined;
    let unscopedInFlight: Promise<string> | undefined;
    const requestInFlight = new WeakMap<AbortSignal, Promise<string>>();
    return async () => {
        if (cached !== undefined) return cached;
        const signal = currentRequestSignal();
        const existing =
            signal === undefined ? unscopedInFlight : requestInFlight.get(signal);
        if (existing) return existing;

        const lookup = (async () => {
            const user = (await client.users.getCurrentUser()) as
                | { id?: string; _id?: string }
                | undefined;
            return (user?.id ?? user?._id ?? "");
        })();
        if (signal === undefined) unscopedInFlight = lookup;
        else requestInFlight.set(signal, lookup);
        try {
            cached = await lookup;
            return cached;
        } finally {
            if (signal === undefined) {
                if (unscopedInFlight === lookup) unscopedInFlight = undefined;
            } else if (requestInFlight.get(signal) === lookup) {
                requestInFlight.delete(signal);
            }
        }
    };
}

export interface LoadContextOptions {
    hooks?: ComposedFetchHooks;
    fetch?: typeof fetch;
    /**
     * Allow a non-Clockify `CLOCKIFY_BASE_URL` override. Off by default:
     * the host allowlist (official Clockify API hosts + loopback) rejects
     * a tampered env var that would otherwise redirect authenticated MCP
     * traffic — and its `X-Api-Key` header — to an arbitrary host. Set
     * `true` only for a trusted Clockify-compatible proxy.
     */
    allowNonClockifyHttpsHost?: boolean;
}

export function loadContext(
    env: NodeJS.ProcessEnv = process.env,
    options: LoadContextOptions = {},
): Context {
    // Trim like every other env var below: a whitespace-only value is an
    // absent credential, not a real one. Without the trim, `"   "` is truthy,
    // skips the deferred setup_required path, and reaches
    // `createClockifyClient`, which rejects it with a bare TypeError that
    // kills the process before it ever speaks MCP.
    const apiKey = env.CLOCKIFY_API_KEY?.trim() || undefined;
    const workspaceId = env.CLOCKIFY_WORKSPACE_ID?.trim() || undefined;
    const environment = env.CLOCKIFY_BASE_URL?.trim() || undefined;
    const region = env.CLOCKIFY_REGION?.trim() || undefined;
    const subdomain = env.CLOCKIFY_SUBDOMAIN?.trim() || undefined;

    if (!apiKey || !workspaceId) {
        // Deferred: the server still starts; each tool throws on first
        // client/workspace access, which errorResult maps to setup_required.
        const missing: string[] = [];
        if (!apiKey) missing.push("CLOCKIFY_API_KEY");
        if (!workspaceId) missing.push("CLOCKIFY_WORKSPACE_ID");
        return makeSetupRequiredContext(new MissingCredentialsError(missing));
    }

    const routing = buildRoutingOptions(region, subdomain);
    if (routing !== undefined && environment !== undefined) {
        throw new Error(
            "clockify-mcp: pass either CLOCKIFY_REGION/CLOCKIFY_SUBDOMAIN or CLOCKIFY_BASE_URL, not both -- they configure the same thing two different ways.",
        );
    }

    const clientOptions = {
        ...options,
        fetch: requestSignalFetch(options.fetch ?? globalThis.fetch),
    };

    // createClockifyClient enforces the Clockify host allowlist on the
    // resolved base URL, so a malicious CLOCKIFY_BASE_URL is rejected
    // here before any request leaves the process. `routing` and
    // `environment` are mutually exclusive at the type level, so build
    // whichever arm applies rather than spreading both into one literal.
    const client =
        routing !== undefined
            ? createClockifyClient({ apiKey, routing, ...clientOptions })
            : createClockifyClient({
                  apiKey,
                  ...(environment !== undefined ? { environment } : {}),
                  ...clientOptions,
              });
    const notice = unconfirmedRegionNotice(routing);
    return {
        client,
        workspaceId,
        confirmationTokens: new ConfirmationTokenStore(),
        currentUserId: createCurrentUserIdMemo(client),
        routingPosture: resolvedRoutingPosture(environment, routing, region),
        ...(notice !== undefined ? { startupNotices: [notice] } : {}),
    };
}

/**
 * Describe the routing the server resolved when it is not the live-confirmed
 * `global` profile. `buildRoutingOptions` supplies
 * `acknowledgeUnconfirmedRegion` on the operator's behalf, so without this
 * line a `CLOCKIFY_REGION` inherited from an env file or a shared launcher
 * config would send authenticated traffic to an unproven host with nothing on
 * the record. Returns `undefined` for `global` and for unrouted defaults.
 */
export function unconfirmedRegionNotice(
    routing: ClockifyRoutingOptions | undefined,
): string | undefined {
    if (routing === undefined || routing.profile === "global") return undefined;
    const host =
        routing.profile === "subdomain" ? `${routing.subdomain} (${routing.region})` : routing.profile;
    return `routing: using the unconfirmed "${host}" Clockify profile from CLOCKIFY_REGION/CLOCKIFY_SUBDOMAIN. Only the global profile is live-confirmed; unset them to route to api.clockify.me.`;
}

/**
 * A `Context` whose `client` / `workspaceId` getters throw the captured
 * `MissingCredentialsError` on first access. The server still builds and
 * connects; the throw is deferred to tool-invocation time, where
 * `defineTool`'s catch routes it through `errorResult` to a `setup_required`
 * receipt. `currentUserId` is intentionally omitted — tools that need it fall
 * back to `ctx.client.users.getCurrentUser()`, which hits the throwing getter,
 * so they too produce `setup_required`.
 */
function makeSetupRequiredContext(error: MissingCredentialsError): Context {
    const fail = (): never => {
        throw error;
    };
    return {
        get client(): ClockifyClient {
            return fail();
        },
        get workspaceId(): string {
            return fail();
        },
        confirmationTokens: new ConfirmationTokenStore(),
        setupError: error,
    };
}

/**
 * Emit the server's startup diagnostics to stderr: a setup hint when it
 * started without required credentials, plus any `startupNotices`. stdout is
 * reserved for JSON-RPC, so these go to stderr only; the model still gets the
 * full credential remediation via each tool's `setup_required` receipt. No-op
 * when there is nothing to report.
 */
export function warnStartupDiagnostics(ctx: Context): void {
    if (ctx.setupError) {
        process.stderr.write(`setup: ${ctx.setupError.message}\n`);
    }
    for (const notice of ctx.startupNotices ?? []) {
        process.stderr.write(`${notice}\n`);
    }
}
