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
import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import { classifyClockifyError, clockifyErrorDetail } from "clockify-sdk-ts-115/errors";
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
import { throwIfRequestAborted, withRequestSignal } from "./request-cancellation.js";
import { authorizeToolRequest, ToolAuthorizationError } from "./tool-authorization.js";
import {
    observeToolInvocation,
    recordToolErrorOutcome,
} from "./tool-observability.js";
import { recordRegisteredTool } from "./tool-registry.js";
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
type ZodRawShape = z.ZodRawShape;
type ShapeOutput<InputArgs extends ZodRawShape> = z.output<z.ZodObject<InputArgs>>;

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

type SuccessCallToolResult = CallToolResult & {
    structuredContent: SuccessEnvelope;
};

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
): SuccessCallToolResult {
    const envelope: SuccessEnvelope = { ok: true, action, data };
    if (options.entity) envelope.entity = options.entity;
    const ids = cleanIds(options.ids);
    if (ids) envelope.ids = ids;
    if (meta && Object.keys(meta).length > 0) envelope.meta = meta;
    const changed = cleanChangeSet(options.changed);
    if (changed) envelope.changed = changed;
    if (options.warnings && options.warnings.length > 0) envelope.warnings = options.warnings;
    if (options.clarification) envelope.clarification = options.clarification;
    if (options.next && options.next.length > 0) envelope.next = options.next;
    return {
        content: [{ type: "text", text: JSON.stringify(envelope) }],
        structuredContent: envelope,
    };
}

/**
 * Build the `SuccessOptions` for a write that created / updated / deleted one
 * entity, so domain tools emit the same populated `entity` + `changed` receipt
 * the workflow tools do — an agent can chain on `changed.{created,updated,deleted}`
 * regardless of which tier answered. When the API supplies no id, keep the
 * entity label but omit `changed`; an empty id is not a chainable reference.
 * Pass `ids` / `next` / `warnings` via `extra`.
 */
export function writeReceipt(
    kind: "created" | "updated" | "deleted",
    entity: string,
    ref: string | { id?: string | undefined; name?: string | undefined },
    extra: Omit<SuccessOptions, "entity" | "changed"> = {},
): SuccessOptions {
    const id = typeof ref === "string" ? ref : (ref.id ?? "");
    const name = typeof ref === "string" ? undefined : ref.name;
    if (id.trim().length === 0) return { entity, ...extra };
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
    const message = clockifyErrorDetail(err);
    const status = (err as { statusCode?: number }).statusCode;
    if (typeof err === "object" && err !== null && "name" in err && err.name === "AbortError") {
        return "aborted";
    }
    if (err instanceof ToolAuthorizationError) return "auth_or_permission";
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
    // The agent reading this envelope is the caller that submitted the values
    // Clockify echoes back, so it gets the full upstream explanation. The
    // body stays off `err.message`, which is what a consumer would log.
    const message = clockifyErrorDetail(err);
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
        const supplied = typeof resolved === "string" ? { hint: resolved } : resolved;
        // Spread AFTER the default so an explicitly supplied retryable (true or false) wins.
        envelope.recovery = { retryable: retryableForCode(code), ...supplied };
    } else {
        envelope.recovery = { hint: recoveryForCode(code), retryable: retryableForCode(code) };
    }
    const result: CallToolResult = {
        content: [{ type: "text", text: JSON.stringify(envelope) }],
        structuredContent: envelope,
        isError: true,
    };
    recordToolErrorOutcome(result, code, envelope.recovery.retryable ?? false);
    return result;
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

function cleanChangeSet(changed: ChangeSet | undefined): ChangeSet | undefined {
    if (!changed) return undefined;
    const out: ChangeSet = {};
    for (const kind of ["created", "updated", "deleted", "reused"] as const) {
        const refs = changed[kind]?.filter((ref) => ref.id.trim().length > 0);
        if (refs && refs.length > 0) out[kind] = refs;
    }
    return hasChangeSet(out) ? out : undefined;
}

function hasChangeSet(changed: ChangeSet | undefined): changed is ChangeSet {
    if (!changed) return false;
    return ["created", "updated", "deleted", "reused"].some((key) => {
        const values = changed[key as keyof ChangeSet];
        return Array.isArray(values) && values.length > 0;
    });
}

/** Registration config keeps annotations governed here and accepts canonical extension metadata. */
export interface ToolConfig<InputArgs extends ZodRawShape = ZodRawShape> {
    title: string;
    description: string;
    inputSchema?: InputArgs;
    /** Controlled source for idempotentHint; risk-derived hints cannot be overridden. */
    idempotent?: boolean;
    /** Extension metadata. `ui` must use the canonical nested MCP Apps shape. */
    _meta?: JsonRecord;
}

/** A tool handler: receives the (schema-validated, per-tool-inferred) args and returns an envelope. */
export type ToolHandler<InputArgs extends ZodRawShape = ZodRawShape> = (
    args: ShapeOutput<InputArgs>,
    extra: ServerContext,
) => CallToolResult | Promise<CallToolResult>;

/**
 * Register a tool whose uniform `try { … } catch (err) { return errorResult(name, err) }`
 * envelope is owned here, so individual tools carry only their happy path. The optional
 * `recovery` is forwarded to `errorResult` for tools that want a tailored recovery hint.
 *
 * The `InputArgs` generic is forwarded so the handler receives the parsed output of the
 * strict Zod object advertised to clients. A zero-argument tool receives an empty object.
 */
export function defineTool<InputArgs extends ZodRawShape = ZodRawShape>(
    server: McpServer,
    name: UnguardedToolName,
    config: ToolConfig<InputArgs>,
    handler: ToolHandler<InputArgs>,
    recovery?: string | RecoveryHint | RecoveryResolver,
): void {
    const risk = riskForUnguardedTool(name);
    const registered = server.registerTool(
        name,
        registrationConfig(config, risk, "none"),
        async (args, extra) =>
            invokeTool(server, extra, name, risk, recovery, () => handler(args, extra)),
    );
    recordRegisteredTool(server, name, registered);
}

// Named directly rather than derived via `ReturnType<ReturnType<typeof
// z.boolean>["optional"]>`: under zod 4 `ReturnType<typeof z.boolean>` resolves
// to the internal `$ZodType`, which carries no `.optional`, so the derived form
// no longer type-checks. These two are the guard control args every guarded
// tool gains, and naming them is also what they meant.
type GuardControlShape = {
    dry_run: z.ZodOptional<z.ZodBoolean>;
    confirm_token: z.ZodOptional<z.ZodString>;
};

type GuardedArgs<InputArgs extends ZodRawShape> = ShapeOutput<InputArgs & GuardControlShape>;

interface GuardedToolHandlers<InputArgs extends ZodRawShape, Preview> {
    preview: (
        args: ShapeOutput<InputArgs>,
        extra: ServerContext,
    ) => Preview | CallToolResult | Promise<Preview | CallToolResult>;
    execute: (
        storedPreview: Preview,
        extra: ServerContext,
    ) => CallToolResult | Promise<CallToolResult>;
}

/**
 * Register a guarded write around one preview and one execution callback.
 * The dry-run result is canonically cloned into the confirmation store. Token
 * calls never recompute the preview; execution receives only the stored clone.
 */
export function defineGuardedTool<InputArgs extends ZodRawShape = ZodRawShape, Preview = unknown>(
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

    const registered = server.registerTool(
        name,
        registrationConfig({ ...config, inputSchema: guardedSchema }, risk, "preview_token"),
        async (args, extra) =>
            invokeTool(server, extra, name, risk, recovery, async () => {
                const guardedArgs: GuardedArgs<InputArgs> = args;
                const controls: Record<string, unknown> = guardedArgs;
                const hasDryRun = Object.prototype.hasOwnProperty.call(controls, "dry_run");
                const hasConfirmToken = Object.prototype.hasOwnProperty.call(
                    controls,
                    "confirm_token",
                );
                const businessArgs = stripGuardControls(controls) as ShapeOutput<InputArgs>;

                if (hasDryRun && hasConfirmToken) {
                    return errorResult(
                        name,
                        new Error(
                            "invalid input: dry_run and confirm_token must not be supplied together",
                        ),
                    );
                }

                if (controls.dry_run === true) {
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
                    const issued = await store.issue(scope, preview);
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

                if (typeof controls.confirm_token === "string" && controls.confirm_token.trim()) {
                    const scope: ConfirmationScope = {
                        toolName: name,
                        workspaceId: ctx.workspaceId,
                        risk,
                        businessArgs,
                    };
                    const storedPreview = (await confirmationStore(ctx).consume(
                        controls.confirm_token.trim(),
                        scope,
                    )) as Preview;
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
            }),
    );
    recordRegisteredTool(server, name, registered);
}

async function invokeTool(
    server: McpServer,
    extra: ServerContext,
    name: UnguardedToolName | GuardedToolName,
    risk: ToolRisk,
    recovery: string | RecoveryHint | RecoveryResolver | undefined,
    handler: () => CallToolResult | Promise<CallToolResult>,
): Promise<CallToolResult> {
    const startedAt = performance.now();
    let result: CallToolResult | undefined;
    return await withRequestSignal(extra, async () => {
        try {
            throwIfRequestAborted();
            await authorizeToolRequest(server, name);
            result = await handler();
        } catch (err) {
            result = errorResult(name, err, recovery);
        } finally {
            observeToolInvocation(server, name, risk, startedAt, result);
        }
        return result;
    });
}

function registrationConfig<InputArgs extends ZodRawShape>(
    config: ToolConfig<InputArgs>,
    risk: ToolRisk,
    confirmation: "none" | "preview_token",
) {
    const { idempotent, inputSchema, _meta, ...publicConfig } = config;
    const ui = canonicalUiMetadata(_meta);
    return {
        ...publicConfig,
        inputSchema: z.strictObject(inputSchema ?? ({} as InputArgs)),
        outputSchema: MCP_RESULT_OUTPUT_SCHEMA,
        annotations: {
            readOnlyHint: risk === "read",
            destructiveHint: risk === "destructive",
            idempotentHint: idempotent ?? risk === "read",
            openWorldHint: risk === "external_side_effect",
        },
        _meta: {
            ..._meta,
            ui,
            [RISK_META_KEY]: risk,
            [CONFIRMATION_META_KEY]: confirmation,
        },
    };
}

function canonicalUiMetadata(meta: JsonRecord | undefined): JsonRecord {
    if (meta !== undefined && Object.prototype.hasOwnProperty.call(meta, "ui/resourceUri")) {
        throw new TypeError("tool metadata must use nested _meta.ui.resourceUri");
    }
    if (meta?.ui !== undefined && !isJsonRecord(meta.ui)) {
        throw new TypeError("tool metadata _meta.ui must be an object");
    }
    const configured = isJsonRecord(meta?.ui) ? meta.ui : {};
    const visibility = configured.visibility ?? ["model"];
    if (
        !Array.isArray(visibility) ||
        visibility.length === 0 ||
        !visibility.every((value) => value === "model" || value === "app")
    ) {
        throw new TypeError("tool metadata _meta.ui.visibility must contain model and/or app");
    }
    return { ...configured, visibility };
}

function isJsonRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
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

export function isCallToolResult(value: unknown): value is CallToolResult {
    if (!value || typeof value !== "object") return false;
    // `structuredContent` arrives over the protocol and can be an explicit null.
    const v = value as { content?: unknown; structuredContent?: { ok?: unknown } | null };
    return (
        Array.isArray(v.content) &&
        typeof v.structuredContent === "object" &&
        v.structuredContent !== null &&
        typeof v.structuredContent.ok === "boolean"
    );
}

export { entityId } from "clockify-sdk-ts-115/operation-receipt";
