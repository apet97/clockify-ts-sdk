/**
 * Helpers for shaping MCP `CallToolResult` payloads. Every tool
 * surfaces the same JSON envelope so an LLM can pattern-match on it
 * regardless of which tool answered.
 *
 * Wire shape:
 *   { content: [{ type: "text", text: "<JSON-stringified envelope>" }] }
 *
 * Envelope shape (success):
 *   { ok: true, action: "<tool name>", data: ..., meta?: {...}, changed?: {...}, next?: [...] }
 *
 * Envelope shape (error):
 *   { ok: false, action: "<tool name>", error: { code, message }, recovery?: { hint, tool, args } }
 *
 * Errors set `isError: true` on the CallToolResult so the MCP
 * transport flags the failure at the protocol level too.
 */
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface SuccessEnvelope {
    ok: true;
    action: string;
    entity?: string;
    ids?: Record<string, string>;
    data: unknown;
    meta?: Record<string, unknown>;
    changed?: ChangeSet;
    warnings?: Warning[];
    next?: NextAction[];
}

export interface ErrorEnvelope {
    ok: false;
    action: string;
    error: { code: string; message: string };
    recovery?: RecoveryHint;
}

export interface EntityRef {
    type: string;
    id: string;
    name?: string;
}

export interface ChangeSet {
    created?: EntityRef[];
    updated?: EntityRef[];
    deleted?: EntityRef[];
    reused?: EntityRef[];
}

export interface Warning {
    code?: string;
    message: string;
}

export interface NextAction {
    tool: string;
    args?: Record<string, unknown>;
    reason?: string;
}

export interface RecoveryHint {
    hint: string;
    tool?: string;
    args?: Record<string, unknown>;
    retryable?: boolean;
    retryAfterSeconds?: number;
}

export interface SuccessOptions {
    entity?: string;
    ids?: Record<string, string | undefined>;
    changed?: ChangeSet;
    warnings?: Warning[];
    next?: NextAction[];
}

export function successResult(
    action: string,
    data: unknown,
    meta?: Record<string, unknown>,
    options: SuccessOptions = {},
): CallToolResult {
    const envelope: SuccessEnvelope = { ok: true, action, data };
    if (options.entity) envelope.entity = options.entity;
    const ids = cleanIds(options.ids);
    if (ids) envelope.ids = ids;
    if (meta && Object.keys(meta).length > 0) envelope.meta = meta;
    if (hasChangeSet(options.changed)) envelope.changed = options.changed;
    if (options.warnings && options.warnings.length > 0) envelope.warnings = options.warnings;
    if (options.next && options.next.length > 0) envelope.next = options.next;
    return {
        content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }],
        structuredContent: envelope as unknown as Record<string, unknown>,
    };
}

export function errorResult(action: string, err: unknown, recovery?: string | RecoveryHint): CallToolResult {
    const message = err instanceof Error ? err.message : String(err);
    const status = (err as { statusCode?: number }).statusCode;
    const code = statusToCode(status, message);
    const envelope: ErrorEnvelope = { ok: false, action, error: { code, message } };
    if (recovery) envelope.recovery = typeof recovery === "string" ? { hint: recovery } : recovery;
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
    if (/(required|provide|missing|invalid|could not parse|not valid|must use|must not|confirmation token)/i.test(message)) return "invalid_request";
    if (/not found/i.test(message)) return "not_found";
    return "error";
}

function cleanIds(ids: Record<string, string | undefined> | undefined): Record<string, string> | undefined {
    if (!ids) return undefined;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(ids)) {
        if (value && value.trim()) out[key] = value;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function hasChangeSet(changed: ChangeSet | undefined): changed is ChangeSet {
    if (!changed) return false;
    return ["created", "updated", "deleted", "reused"].some((key) => {
        const values = changed[key as keyof ChangeSet];
        return Array.isArray(values) && values.length > 0;
    });
}
