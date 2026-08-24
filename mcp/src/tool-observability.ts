import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";

import type { ClockifyErrorCode } from "./error-codes.js";
import type { ToolRisk } from "./tool-risk.js";

const MAX_TOOL_DURATION_MS = 86_400_000;

export interface ToolOutcome {
    tool: string;
    risk: ToolRisk;
    outcome: "success" | "error";
    code: "ok" | ClockifyErrorCode;
    retryable: boolean;
    durationMs: number;
}

export type ToolObserver = (outcome: ToolOutcome) => void | Promise<void>;

interface ErrorOutcome {
    code: ClockifyErrorCode;
    retryable: boolean;
}

const toolObservers = new WeakMap<McpServer, ToolObserver>();
const errorOutcomes = new WeakMap<CallToolResult, ErrorOutcome>();

/** Attach one request-owned observer to one request-owned MCP server. */
export function configureToolObserver(
    server: McpServer,
    observer: ToolObserver | undefined,
): void {
    if (observer === undefined) {
        toolObservers.delete(server);
    } else {
        toolObservers.set(server, observer);
    }
}

/** Retain only the allowlisted classification for a canonical error result. */
export function recordToolErrorOutcome(
    result: CallToolResult,
    code: ClockifyErrorCode,
    retryable: boolean,
): void {
    errorOutcomes.set(result, { code, retryable });
}

/** Emit one bounded event without exposing the invocation arguments or result. */
export function observeToolInvocation(
    server: McpServer,
    tool: string,
    risk: ToolRisk,
    startedAt: number,
    result: CallToolResult | undefined,
): void {
    const observer = toolObservers.get(server);
    if (observer === undefined) return;

    const classification = classifyResult(result);
    try {
        const pending = observer({
            tool,
            risk,
            ...classification,
            durationMs: boundedDuration(performance.now() - startedAt),
        });
        if (pending !== undefined) void pending.catch(() => {});
    } catch {
        // Observability is best effort and never owns the tool outcome.
    }
}

function classifyResult(
    result: CallToolResult | undefined,
): Pick<ToolOutcome, "outcome" | "code" | "retryable"> {
    if (result === undefined) {
        return { outcome: "error", code: "error", retryable: false };
    }
    if (result.isError !== true) {
        return { outcome: "success", code: "ok", retryable: false };
    }
    const recorded = errorOutcomes.get(result);
    return {
        outcome: "error",
        code: recorded?.code ?? "error",
        retryable: recorded?.retryable ?? false,
    };
}

function boundedDuration(value: number): number {
    if (!Number.isFinite(value)) return MAX_TOOL_DURATION_MS;
    return Math.min(MAX_TOOL_DURATION_MS, Math.max(0, Math.round(value)));
}
