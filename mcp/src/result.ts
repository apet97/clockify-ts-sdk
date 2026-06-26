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
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
    ShapeOutput,
    ZodRawShapeCompat,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { classifyClockifyError } from "clockify-sdk-ts-115/errors";

import { MissingCredentialsError } from "./client.js";
import {
    errorCodeForMessage,
    errorCodeForStatus,
    recoveryForCode,
    retryableForCode,
    type ClockifyErrorCode,
} from "./error-codes.js";

type JsonRecord = Record<string, unknown>;

export interface SuccessEnvelope {
    ok: true;
    action: string;
    entity?: string;
    ids?: Record<string, string>;
    data: unknown;
    meta?: JsonRecord;
    changed?: ChangeSet;
    warnings?: Warning[];
    clarification?: Clarification;
    next?: NextAction[];
}

/**
 * A first-class "did you mean?" receipt for an ambiguous reference. When a name
 * matches more than one entity (or none), a tool returns a success envelope whose
 * `clarification` holds a grounded question plus the real candidate ids — never a
 * silently-wrong id. The caller re-invokes with the chosen id.
 */
export interface Clarification {
    /** The grounded question to put to the caller. */
    question: string;
    /** The input field that was ambiguous (e.g. "project", "client"). */
    field?: string;
    /** Grounded "did you mean?" candidates (real id + name) to choose from. */
    candidates?: EntityRef[];
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
    args?: JsonRecord;
    reason?: string;
}

export interface RecoveryHint {
    hint: string;
    tool?: string;
    args?: JsonRecord;
    retryable?: boolean;
    retryAfterSeconds?: number;
}

/**
 * A failure-class-aware recovery resolver: given the thrown error and its
 * already-derived stable code, returns a tailored recovery hint. Lets a tool
 * emit a class-specific remediation (401 vs wrong-workspace vs network) without
 * owning its own try/catch — pass it as the `recovery` argument to defineTool.
 */
export type RecoveryResolver = (err: unknown, code: ClockifyErrorCode) => string | RecoveryHint;

export interface SuccessOptions {
    entity?: string;
    ids?: Record<string, string | undefined>;
    changed?: ChangeSet;
    warnings?: Warning[];
    clarification?: Clarification;
    next?: NextAction[];
}

export function successResult(
    action: string,
    data: unknown,
    meta?: JsonRecord,
    options: SuccessOptions = {},
): CallToolResult {
    const envelope: SuccessEnvelope = { ok: true, action, data };
    if (options.entity) envelope.entity = options.entity;
    const ids = cleanIds(options.ids);
    if (ids) envelope.ids = ids;
    if (meta && Object.keys(meta).length > 0) envelope.meta = meta;
    if (hasChangeSet(options.changed)) envelope.changed = options.changed;
    if (options.warnings && options.warnings.length > 0) envelope.warnings = options.warnings;
    if (options.clarification) envelope.clarification = options.clarification;
    if (options.next && options.next.length > 0) envelope.next = options.next;
    return {
        content: [{ type: "text", text: JSON.stringify(envelope) }],
        structuredContent: envelope as unknown as JsonRecord,
    };
}

/**
 * Build the `SuccessOptions` for a write that created / updated / deleted one
 * entity, so domain tools emit the same populated `entity` + `changed` receipt
 * the workflow tools do — an agent can chain on `changed.{created,updated,deleted}`
 * regardless of which tier answered. Pass `ids` / `next` / `warnings` via `extra`.
 */
export function writeReceipt(
    kind: "created" | "updated" | "deleted",
    entity: string,
    ref: string | { id?: string | undefined; name?: string | undefined },
    extra: Omit<SuccessOptions, "entity" | "changed"> = {},
): SuccessOptions {
    const id = typeof ref === "string" ? ref : (ref.id ?? "");
    const name = typeof ref === "string" ? undefined : ref.name;
    const entityRef: EntityRef = name ? { type: entity, id, name } : { type: entity, id };
    return { entity, changed: { [kind]: [entityRef] }, ...extra };
}

/**
 * Derive the stable cross-surface error code from any thrown value, using the
 * SAME precedence errorResult applies: the SDK's cause-aware classifier first
 * (so a connection/abort error with statusCode null is never mislabeled by the
 * message-regex fallback — e.g. a network failure whose message contains
 * "workspace" stays connection_error, not auth_or_permission), then HTTP-status
 * mapping, then the message matcher. Exported so failure-class hint mappers
 * (mcp/src/diagnose.ts) classify identically to the error envelope.
 */
export function errorCodeForError(err: unknown): ClockifyErrorCode {
    const message = err instanceof Error ? err.message : String(err);
    const status = (err as { statusCode?: number }).statusCode;
    return (
        classifyClockifyError(err)?.code ??
        errorCodeForStatus(status) ??
        errorCodeForMessage(message)
    );
}

export function errorResult(
    action: string,
    err: unknown,
    recovery?: string | RecoveryHint | RecoveryResolver,
): CallToolResult {
    const message = err instanceof Error ? err.message : String(err);
    // MissingCredentialsError is the lazy "server started without creds" signal:
    // map it to the friendly setup_required code so every tool explains the fix
    // instead of crashing at startup. The recovery still flows through the shared
    // dispatch below (a tool's RecoveryResolver such as failureHint, else the
    // registry recoveryForCode) — no bespoke envelope/recovery duplication here.
    let code: ClockifyErrorCode;
    if (err instanceof MissingCredentialsError) {
        code = "setup_required";
    } else {
        code = errorCodeForError(err);
    }
    const envelope: ErrorEnvelope = { ok: false, action, error: { code, message } };
    if (recovery) {
        const resolved = typeof recovery === "function" ? recovery(err, code) : recovery;
        envelope.recovery = typeof resolved === "string" ? { hint: resolved } : resolved;
    } else {
        envelope.recovery = { hint: recoveryForCode(code), retryable: retryableForCode(code) };
    }
    return {
        content: [{ type: "text", text: JSON.stringify(envelope) }],
        structuredContent: envelope as unknown as JsonRecord,
        isError: true,
    };
}

function cleanIds(
    ids: Record<string, string | undefined> | undefined,
): Record<string, string> | undefined {
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

/** The registerTool config shape, minus the auto-injected `outputSchema`. */
export interface ToolConfig<InputArgs extends ZodRawShapeCompat = ZodRawShapeCompat> {
    title: string;
    description: string;
    inputSchema?: InputArgs;
    annotations?: JsonRecord;
}

/** A tool handler: receives the (schema-validated, per-tool-inferred) args and returns an envelope. */
export type ToolHandler<InputArgs extends ZodRawShapeCompat = ZodRawShapeCompat> = (
    args: ShapeOutput<InputArgs>,
    extra: unknown,
) => CallToolResult | Promise<CallToolResult>;

/**
 * Register a tool whose uniform `try { … } catch (err) { return errorResult(name, err) }`
 * envelope is owned here, so individual tools carry only their happy path. The optional
 * `recovery` is forwarded to `errorResult` for tools that want a tailored recovery hint.
 *
 * The `InputArgs` generic is forwarded so the handler receives `ShapeOutput<InputArgs>` —
 * per-tool Zod inference is preserved for the implementer (a zero-arg / no-`inputSchema`
 * tool falls back to the `ZodRawShapeCompat` default and stays working).
 *
 * MUST go through `server.registerTool` so the `installDefaultOutputSchema` monkeypatch
 * still injects the canonical `outputSchema`. The two `as never` casts sit on the
 * `registerTool` forwarding boundary, NOT on the handler's `args` — the same kind of
 * sanctioned reflective bridge `output-schema.ts` uses; the JSON Schema the model sees
 * (and `server.test.ts` asserts) is unchanged.
 */
export function defineTool<InputArgs extends ZodRawShapeCompat = ZodRawShapeCompat>(
    server: McpServer,
    name: string,
    config: ToolConfig<InputArgs>,
    handler: ToolHandler<InputArgs>,
    recovery?: string | RecoveryHint | RecoveryResolver,
): void {
    server.registerTool(
        name,
        config as never,
        (async (args: unknown, extra: unknown) => {
            try {
                return await handler(args as ShapeOutput<InputArgs>, extra);
            } catch (err) {
                return errorResult(name, err, recovery);
            }
        }) as never,
    );
}

export { entityId } from "clockify-sdk-ts-115/operation-receipt";
