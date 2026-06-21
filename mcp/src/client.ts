/**
 * Configured Clockify SDK client + the workspace pin every tool
 * operates against. Both come from environment variables so the
 * stdio MCP entrypoint can be launched without arguments by an MCP
 * client (Claude Desktop, etc.).
 */
import { createClockifyClient } from "clockify-sdk-ts-115";
import type { ComposedFetchHooks } from "clockify-sdk-ts-115/composed-fetch";

import { ConfirmationTokenStore } from "./orchestration/confirmation.js";

export type ClockifyClient = ReturnType<typeof createClockifyClient>;

export interface Context {
    client: ClockifyClient;
    workspaceId: string;
    confirmationTokens?: ConfirmationTokenStore;
    /**
     * Single-flight memo for the current user's id, fetched at most once per
     * server lifetime. OPTIONAL so hand-built test contexts (and any consumer
     * that omits it) still work — call sites fall back to a direct
     * `getCurrentUser()` when it is absent. Resolves to "" when the user id
     * can't be determined, matching the previous inline `entityId(...) ?? ""`.
     */
    currentUserId?: () => Promise<string>;
}

/**
 * Build a single-flight `currentUserId` memo over a Clockify client: the first
 * call fetches `users.getCurrentUser()`, concurrent callers share the same
 * in-flight promise, and the resolved id is cached for the process lifetime.
 * A failed fetch is not cached (the next call retries).
 */
export function createCurrentUserIdMemo(client: ClockifyClient): () => Promise<string> {
    let cached: string | undefined;
    let inFlight: Promise<string> | undefined;
    return async () => {
        if (cached !== undefined) return cached;
        if (inFlight) return inFlight;
        inFlight = (async () => {
            const user = (await client.users.getCurrentUser()) as { id?: string; _id?: string };
            return String(user?.id ?? user?._id ?? "");
        })();
        try {
            cached = await inFlight;
            return cached;
        } finally {
            inFlight = undefined;
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
    allowInsecureBaseUrl?: boolean;
}

export function loadContext(
    env: NodeJS.ProcessEnv = process.env,
    options: LoadContextOptions = {},
): Context {
    const apiKey = env.CLOCKIFY_API_KEY;
    const workspaceId = env.CLOCKIFY_WORKSPACE_ID;
    const environment = env.CLOCKIFY_BASE_URL;
    if (!apiKey) {
        throw new Error(
            "CLOCKIFY_API_KEY is not set. Configure it in your MCP client's env block, e.g.\n" +
                `  "@clockify115/mcp-server": { "command": "clockify115-mcp", "env": { "CLOCKIFY_API_KEY": "...", "CLOCKIFY_WORKSPACE_ID": "..." } }`,
        );
    }
    if (!workspaceId) {
        throw new Error(
            "CLOCKIFY_WORKSPACE_ID is not set. The one-user server is pinned to a single workspace.",
        );
    }
    // createClockifyClient enforces the Clockify host allowlist on the
    // resolved base URL, so a malicious CLOCKIFY_BASE_URL is rejected
    // here before any request leaves the process.
    const client = createClockifyClient({
        apiKey,
        ...(environment !== undefined ? { environment } : {}),
        ...options,
    });
    return {
        client,
        workspaceId,
        confirmationTokens: new ConfirmationTokenStore(),
        currentUserId: createCurrentUserIdMemo(client),
    };
}
