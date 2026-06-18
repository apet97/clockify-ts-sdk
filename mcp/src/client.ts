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
    return {
        client: createClockifyClient({
            apiKey,
            ...(environment !== undefined ? { environment } : {}),
            ...options,
        }),
        workspaceId,
        confirmationTokens: new ConfirmationTokenStore(),
    };
}
