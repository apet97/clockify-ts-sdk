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
import { z } from "zod";

import { MissingCredentialsError, type Context } from "./client.js";
import {
    errorCodeForMessage,
    errorCodeForStatus,
    recoveryForCode,
    retryableForCode,
    type ClockifyErrorCode,
} from "./error-codes.js";
import { ConfirmationTokenStore, type ConfirmationScope } from "./orchestration/confirmation.js";
import { MCP_RESULT_OUTPUT_SCHEMA } from "./output-schema.js";
import {
    CONFIRMATION_META_KEY,
    type GuardedToolName,
    RISK_META_KEY,
    riskForGuardedTool,
    riskForUnguardedTool,
    type ToolRisk,
    type UnguardedToolName,
} from "./tool-risk.js";

export { CONFIRMATION_META_KEY, RISK_META_KEY } from "./tool-risk.js";

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
    // The SDK classifier's catch-all "error" is a non-answer here: it means the
    // classifier recognized a ClockifyApiError but had no specific code for it.
    // The clearest case is a real 402, whose feature_unavailable code is
    // cli/mcp-only and therefore invisible to the SDK-surface status map the
    // classifier consults — so the classifier falls through to "error". Treat
    // that "error" as undefined so the unfiltered HTTP-status map can supply the
    // cross-surface code (402 -> feature_unavailable) before the message matcher.
    // Cause-aware codes (connection_error/aborted) are non-"error", so they still
    // win first. Blast radius is exactly 402: it is the only status-bearing
    // error-code entry lacking the "sdk" surface, so for every other "error"-
    // classified ClockifyApiError errorCodeForStatus(status) stays undefined and
    // the message matcher reproduces the prior "error" result unchanged.
    const classified = classifyClockifyError(err)?.code;
    return (
        (classified !== undefined && classified !== "error" ? classified : undefined) ??
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

/** Registration config intentionally excludes raw annotations and _meta. */
export interface ToolConfig<InputArgs extends ZodRawShapeCompat = ZodRawShapeCompat> {
    title: string;
    description: string;
    inputSchema?: InputArgs;
    /** Controlled source for idempotentHint; risk-derived hints cannot be overridden. */
    idempotent?: boolean;
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
 * The single `as never` cast sits on the
 * `registerTool` callback boundary, NOT on the handler's `args` — the same kind of
 * sanctioned reflective bridge `output-schema.ts` uses; the JSON Schema the model sees
 * (and `server.test.ts` asserts) is unchanged.
 */
export function defineTool<InputArgs extends ZodRawShapeCompat = ZodRawShapeCompat>(
    server: McpServer,
    name: UnguardedToolName,
    config: ToolConfig<InputArgs>,
    handler: ToolHandler<InputArgs>,
    recovery?: string | RecoveryHint | RecoveryResolver,
): void {
    const risk = riskForUnguardedTool(name);
    server.registerTool(name, registrationConfig(config, risk, "none"), (async (
        args: unknown,
        extra: unknown,
    ) => {
        try {
            return await handler(args as ShapeOutput<InputArgs>, extra);
        } catch (err) {
            return errorResult(name, err, recovery);
        }
    }) as never);
}

type GuardControlShape = {
    dry_run: ReturnType<ReturnType<typeof z.boolean>["optional"]>;
    confirm_token: ReturnType<ReturnType<typeof z.string>["optional"]>;
};

type GuardedArgs<InputArgs extends ZodRawShapeCompat> = ShapeOutput<InputArgs> & {
    dry_run?: boolean;
    confirm_token?: string;
};

export interface GuardedToolHandlers<InputArgs extends ZodRawShapeCompat, Preview> {
    preview: (
        args: ShapeOutput<InputArgs>,
        extra: unknown,
    ) => Preview | CallToolResult | Promise<Preview | CallToolResult>;
    execute: (storedPreview: Preview, extra: unknown) => CallToolResult | Promise<CallToolResult>;
}

/**
 * Register a guarded write around one preview and one execution callback.
 * The dry-run result is canonically cloned into the confirmation store. Token
 * calls never recompute the preview; execution receives only the stored clone.
 */
export function defineGuardedTool<
    InputArgs extends ZodRawShapeCompat = ZodRawShapeCompat,
    Preview = unknown,
>(
    server: McpServer,
    ctx: Context,
    name: GuardedToolName,
    config: ToolConfig<InputArgs>,
    handlers: GuardedToolHandlers<InputArgs, Preview>,
    recovery?: string | RecoveryHint | RecoveryResolver,
): void {
    const risk = riskForGuardedTool(name);
    const inputSchema = config.inputSchema ?? ({} as InputArgs);
    if (
        Object.prototype.hasOwnProperty.call(inputSchema, "dry_run") ||
        Object.prototype.hasOwnProperty.call(inputSchema, "confirm_token")
    ) {
        throw new Error(`${name} guard controls are owned by defineGuardedTool`);
    }
    const guardedSchema = {
        ...inputSchema,
        dry_run: z.boolean().optional(),
        confirm_token: z.string().min(1).optional(),
    } as InputArgs & GuardControlShape;

    server.registerTool(
        name,
        registrationConfig({ ...config, inputSchema: guardedSchema }, risk, "preview_token"),
        (async (rawArgs: unknown, extra: unknown) => {
            try {
                const args = rawArgs as GuardedArgs<InputArgs>;
                const hasDryRun = Object.prototype.hasOwnProperty.call(args, "dry_run");
                const hasConfirmToken = Object.prototype.hasOwnProperty.call(args, "confirm_token");
                const businessArgs = stripGuardControls(args) as ShapeOutput<InputArgs>;

                if (hasDryRun && hasConfirmToken) {
                    return errorResult(
                        name,
                        new Error(
                            "invalid input: dry_run and confirm_token must not be supplied together",
                        ),
                    );
                }

                if (args.dry_run === true) {
                    const workspaceId = ctx.workspaceId;
                    const scope: ConfirmationScope = {
                        toolName: name,
                        workspaceId,
                        risk,
                        businessArgs,
                    };
                    const preview = await handlers.preview(businessArgs, extra);
                    if (isCallToolResult(preview)) return preview;
                    const store = confirmationStore(ctx);
                    const issued = store.issue(scope, preview);
                    return successResult(
                        name,
                        {
                            preview,
                            confirm_token: issued.confirmToken,
                            expires_at: issued.expiresAt,
                            preview_hash: issued.previewHash,
                            risk_class: risk,
                        },
                        { workspaceId },
                        {
                            entity: "confirmation",
                            ids: { workspaceId },
                            next: [
                                {
                                    tool: name,
                                    args: {
                                        ...(businessArgs as JsonRecord),
                                        confirm_token: issued.confirmToken,
                                    },
                                    reason: "Execute this preview.",
                                },
                            ],
                        },
                    );
                }

                if (typeof args.confirm_token === "string" && args.confirm_token.trim()) {
                    const scope: ConfirmationScope = {
                        toolName: name,
                        workspaceId: ctx.workspaceId,
                        risk,
                        businessArgs,
                    };
                    const storedPreview = confirmationStore(ctx).consume(
                        args.confirm_token.trim(),
                        scope,
                    ) as Preview;
                    return await handlers.execute(storedPreview, extra);
                }

                return errorResult(
                    name,
                    new Error("dry_run confirmation required before executing this tool"),
                    {
                        hint: "Run this tool with dry_run:true, review the preview, then retry with the returned confirm_token.",
                        tool: name,
                        args: { ...(businessArgs as JsonRecord), dry_run: true },
                        retryable: true,
                    },
                );
            } catch (err) {
                return errorResult(name, err, recovery);
            }
        }) as never,
    );
}

function registrationConfig<InputArgs extends ZodRawShapeCompat>(
    config: ToolConfig<InputArgs>,
    risk: ToolRisk,
    confirmation: "none" | "preview_token",
): JsonRecord {
    const { idempotent, ...publicConfig } = config;
    return {
        ...publicConfig,
        outputSchema: MCP_RESULT_OUTPUT_SCHEMA,
        annotations: {
            readOnlyHint: risk === "read",
            destructiveHint: risk === "destructive",
            idempotentHint: idempotent ?? risk === "read",
            openWorldHint: risk === "external_side_effect",
        },
        _meta: {
            [RISK_META_KEY]: risk,
            [CONFIRMATION_META_KEY]: confirmation,
        },
    };
}

function stripGuardControls(args: Record<string, unknown>): JsonRecord {
    const out: JsonRecord = {};
    for (const [key, value] of Object.entries(args)) {
        if (key !== "dry_run" && key !== "confirm_token" && value !== undefined) {
            out[key] = value;
        }
    }
    return out;
}

function confirmationStore(ctx: Context) {
    ctx.confirmationTokens ??= new ConfirmationTokenStore();
    return ctx.confirmationTokens;
}

function isCallToolResult(value: unknown): value is CallToolResult {
    return Boolean(
        value &&
        typeof value === "object" &&
        Array.isArray((value as { content?: unknown }).content),
    );
}

export { entityId } from "clockify-sdk-ts-115/operation-receipt";
