/**
 * Shared dry_run -> confirm_token guard for mutating MCP tools.
 *
 * This is the single implementation of the confirmation handshake used by
 * both the high-risk business workflows (`maybeConfirm` in
 * `tools/workflows.ts` delegates here) and the destructive domain delete
 * tools (`tools/*.ts`). Keeping one implementation means the guarantee —
 * no mutation without a previewed-and-confirmed token — cannot drift
 * between the two surfaces.
 *
 * Semantics (identical for every caller):
 *   - `dry_run: true`  -> issue a preview receipt carrying a fresh
 *     `confirm_token` (and `expires_at` / `preview_hash`). No mutation.
 *   - `confirm_token` present -> validate it against the stable
 *     {toolName, workspaceId, riskClass, argsHash, previewHash} payload;
 *     on success return `null` so the caller proceeds with the mutation.
 *     `store.validate` throws on a tampered/expired/mismatched token; every
 *     caller runs inside a try/catch (workflow `runWorkflow` wrapper or the
 *     domain tool's own try/catch) so a bad token surfaces as a clean
 *     error receipt.
 *   - neither -> return an error receipt instructing the caller to run
 *     `dry_run` first.
 */
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { Context } from "../client.js";
import { errorResult, successResult } from "../result.js";

import { ConfirmationTokenStore, confirmationPayload } from "./confirmation.js";

type AnyRecord = Record<string, unknown>;

/**
 * requireConfirmation runs the dry_run/confirm_token handshake for one
 * tool call. Returns a `CallToolResult` (a preview receipt or an error
 * receipt) when the caller must NOT proceed, or `null` when a valid
 * `confirm_token` was supplied and the caller should execute the mutation.
 */
export function requireConfirmation(
    ctx: Context,
    toolName: string,
    riskClass: string,
    args: AnyRecord,
    preview: AnyRecord,
): CallToolResult | null {
    const stableArgs = stripConfirmationArgs(args);
    const payload = confirmationPayload(toolName, ctx.workspaceId, riskClass, stableArgs, preview);
    const store = confirmationStore(ctx);
    if (args.dry_run === true) {
        const issued = store.issue(payload);
        return successResult(
            toolName,
            {
                preview,
                confirm_token: issued.confirmToken,
                expires_at: issued.expiresAt,
                preview_hash: issued.previewHash,
                risk_class: riskClass,
            },
            { workspaceId: ctx.workspaceId },
            {
                entity: "confirmation",
                ids: { workspaceId: ctx.workspaceId },
                next: [
                    {
                        tool: toolName,
                        args: { ...stableArgs, confirm_token: issued.confirmToken },
                        reason: "Execute this preview.",
                    },
                ],
            },
        );
    }
    if (str(args.confirm_token)) {
        store.validate(str(args.confirm_token), payload);
        return null;
    }
    return errorResult(toolName, new Error("dry_run confirmation required before executing this workflow"), {
        hint: "Run this workflow with dry_run:true, review the preview, then retry with the returned confirm_token.",
        tool: toolName,
        args: { ...stableArgs, dry_run: true },
        retryable: true,
    });
}

/** Lazily initialise and return the per-context confirmation token store. */
export function confirmationStore(ctx: Context): ConfirmationTokenStore {
    ctx.confirmationTokens ??= new ConfirmationTokenStore();
    return ctx.confirmationTokens;
}

/**
 * stripConfirmationArgs drops the control args (dry_run/confirm_token) and
 * undefined values so the hashed payload reflects only the business
 * arguments. The hash must be identical between the dry_run preview and the
 * confirmed execution.
 */
export function stripConfirmationArgs(args: AnyRecord): AnyRecord {
    const out: AnyRecord = {};
    for (const [key, value] of Object.entries(args)) {
        if (key !== "dry_run" && key !== "confirm_token" && value !== undefined) out[key] = value;
    }
    return out;
}

function str(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}
