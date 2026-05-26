/**
 * Helpers for shaping MCP `CallToolResult` payloads. Every tool
 * surfaces the same JSON envelope so an LLM can pattern-match on it
 * regardless of which tool answered.
 *
 * Wire shape:
 *   { content: [{ type: "text", text: "<JSON-stringified envelope>" }] }
 *
 * Envelope shape (success):
 *   { ok: true, action: "<tool name>", data: ..., meta?: {...} }
 *
 * Envelope shape (error):
 *   { ok: false, action: "<tool name>", error: { code, message }, recovery?: { hint } }
 *
 * Errors set `isError: true` on the CallToolResult so the MCP
 * transport flags the failure at the protocol level too.
 */
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface SuccessEnvelope {
    ok: true;
    action: string;
    data: unknown;
    meta?: Record<string, unknown>;
}

export interface ErrorEnvelope {
    ok: false;
    action: string;
    error: { code: string; message: string };
    recovery?: { hint: string };
}

export function successResult(
    action: string,
    data: unknown,
    meta?: Record<string, unknown>,
): CallToolResult {
    const envelope: SuccessEnvelope = { ok: true, action, data };
    if (meta && Object.keys(meta).length > 0) envelope.meta = meta;
    return {
        content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }],
        structuredContent: envelope as unknown as Record<string, unknown>,
    };
}

export function errorResult(action: string, err: unknown, hint?: string): CallToolResult {
    const message = err instanceof Error ? err.message : String(err);
    const status = (err as { statusCode?: number }).statusCode;
    const code = statusToCode(status, message);
    const envelope: ErrorEnvelope = { ok: false, action, error: { code, message } };
    if (hint) envelope.recovery = { hint };
    return {
        content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }],
        structuredContent: envelope as unknown as Record<string, unknown>,
        isError: true,
    };
}

function statusToCode(status: number | undefined, message: string): string {
    if (status === 400) return "invalid_request";
    if (status === 401 || status === 403) return "auth_or_permission";
    if (status === 404) return "not_found";
    if (status === 409) return "conflict";
    if (status === 429) return "rate_limited";
    if (status === 402) return "feature_unavailable";
    if (status && status >= 500) return "clockify_upstream_error";
    if (/not found/i.test(message)) return "not_found";
    return "error";
}
