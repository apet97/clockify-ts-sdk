/**
 * Operation receipt seam. Normalizes a generated SDK call into the same
 * success/error vocabulary the CLI and MCP surfaces use: status, headers,
 * request id, rate limit, stable error code, and recovery hints.
 */
import { classifyClockifyError, type ClockifyErrorCode } from "./errors.js";
import { getRateLimit, type RateLimitSnapshot } from "./rate-limit.js";
import {
    withResponse,
    type ResponseAwarePromise,
    type WithResponseResult,
} from "./with-response.js";

export interface ClockifyOperationReceipt<T> {
    ok: true;
    action: string;
    data: T;
    status: number;
    headers: Headers;
    requestId?: string | undefined;
    rateLimit?: RateLimitSnapshot | undefined;
    changed?: boolean | undefined;
    warnings: string[];
    next: string[];
}

export interface ClockifyOperationErrorReceipt {
    ok: false;
    action: string;
    code: ClockifyErrorCode | "unknown";
    message: string;
    status?: number | undefined;
    retryable: boolean;
    recovery: string[];
}

export type ClockifyOperationResult<T> =
    | ClockifyOperationReceipt<T>
    | ClockifyOperationErrorReceipt;

export interface OperationReceiptOptions<T> {
    action: string;
    changed?: boolean | ((result: WithResponseResult<T>) => boolean | undefined);
    warnings?: string[];
    next?: string[];
}

/** Wrap a generated SDK call into a success receipt with response metadata. */
export async function toOperationReceipt<T>(
    promise: ResponseAwarePromise<T>,
    options: OperationReceiptOptions<T>,
): Promise<ClockifyOperationReceipt<T>> {
    const response = await withResponse(promise);
    const changed =
        typeof options.changed === "function" ? options.changed(response) : options.changed;
    const rateLimit = getRateLimit(response.headers);
    const hasRateLimit =
        rateLimit.limit !== undefined ||
        rateLimit.remaining !== undefined ||
        rateLimit.resetAt !== undefined;

    return {
        ok: true,
        action: options.action,
        data: response.data,
        status: response.status,
        headers: response.headers,
        requestId: response.requestId,
        rateLimit: hasRateLimit ? rateLimit : undefined,
        changed,
        warnings: options.warnings ?? [],
        next: options.next ?? [],
    };
}

/** Turn a thrown error into a recovery-oriented receipt without rethrowing. */
export function toOperationErrorReceipt(
    action: string,
    error: unknown,
    recovery: string[] = [],
): ClockifyOperationErrorReceipt {
    const classification = classifyClockifyError(error);
    const fallback = error instanceof Error ? error.message : String(error);

    return {
        ok: false,
        action,
        code: classification?.code ?? "unknown",
        message: classification?.message ?? fallback,
        status: classification?.statusCode,
        retryable: classification?.retryable ?? false,
        recovery:
            recovery.length > 0
                ? recovery
                : classification
                  ? [classification.recovery]
                  : ["Inspect the error and retry only when the operation is idempotent."],
    };
}

/**
 * @public
 * Pull a string `id` from an SDK response without scattering
 * `as { id?: string }` across CLI or MCP code. A wrong-shaped value yields
 * `undefined`, never a silently typed absent field.
 */
export function entityId(value: unknown): string | undefined {
    if (value && typeof value === "object" && "id" in value) {
        const id = (value as { id?: unknown }).id;
        return typeof id === "string" ? id : undefined;
    }
    return undefined;
}
