import { REPORTS_APP_MODEL_META_KEY } from "./constants.js";
import type { ReportsAppModelV1 } from "./model-types.js";
import { isReportsAppModel } from "./model-validation.js";
import { canonicalReportsAppPaging } from "./paging.js";
import type { ReportsMessageIntent } from "./renderer.js";

export const REPORTS_APP_DIRECT_TOOLS = [
    "clockify_reports_summary",
    "clockify_reports_detailed",
    "clockify_reports_weekly",
    "clockify_reports_attendance",
    "clockify_reports_expense",
] as const;

export type ReportsAppSourceTool = (typeof REPORTS_APP_DIRECT_TOOLS)[number];

export type ReportsWidgetState =
    | {
          readonly kind: "idle";
          readonly generation: number;
          readonly toolInput: Record<string, unknown>;
      }
    | {
          readonly kind: "awaiting_host";
          readonly generation: number;
          readonly toolInput: Record<string, unknown>;
      }
    | {
          readonly kind: "fallback";
          readonly generation: number;
          readonly isError: boolean;
          readonly message: string | undefined;
          readonly toolInput: Record<string, unknown>;
      }
    | {
          readonly kind: "ready";
          readonly generation: number;
          readonly model: ReportsAppModelV1;
          readonly toolInput: Record<string, unknown>;
      }
    | {
          readonly kind: "refreshing";
          readonly generation: number;
          readonly callToken: symbol;
          readonly model: ReportsAppModelV1;
          readonly toolInput: Record<string, unknown>;
      };

export type ReportsWidgetEffect =
    | { readonly kind: "none" }
    | { readonly kind: "clear_busy" }
    | { readonly kind: "start_busy"; readonly message: string }
    | { readonly kind: "render_model"; readonly model: ReportsAppModelV1 }
    | {
          readonly kind: "show_fallback";
          readonly isError: boolean;
          readonly message: string | undefined;
      };

export type ReportsWidgetEvent =
    | { readonly type: "teardown" }
    | { readonly type: "connect_failed"; readonly message: string }
    | { readonly type: "host_tool_input"; readonly arguments: Record<string, unknown> | undefined }
    | { readonly type: "host_tool_input_partial" }
    | { readonly type: "host_tool_result"; readonly result: unknown }
    | { readonly type: "host_tool_cancelled"; readonly reason: unknown }
    | { readonly type: "direct_call_started"; readonly callToken: symbol }
    | {
          readonly type: "direct_call_resolved";
          readonly callToken: symbol;
          readonly generation: number;
          readonly arguments: Record<string, unknown>;
          readonly result: unknown;
      }
    | {
          readonly type: "direct_call_rejected";
          readonly callToken: symbol;
          readonly generation: number;
          readonly message: string;
      }
    | { readonly type: "render_failed"; readonly message: string };

export interface ReportsWidgetTransition {
    readonly state: ReportsWidgetState;
    readonly effect: ReportsWidgetEffect;
}

export function initialReportsWidgetState(): ReportsWidgetState {
    return { kind: "idle", generation: 0, toolInput: {} };
}

export function activeReportsWidgetModel(state: ReportsWidgetState): ReportsAppModelV1 | undefined {
    return state.kind === "ready" || state.kind === "refreshing" ? state.model : undefined;
}

export function transitionReportsWidgetState(
    state: ReportsWidgetState,
    event: ReportsWidgetEvent,
): ReportsWidgetTransition {
    switch (event.type) {
        case "teardown":
            return {
                state: { kind: "idle", generation: state.generation + 1, toolInput: {} },
                effect: { kind: "clear_busy" },
            };
        case "connect_failed":
            return {
                state: {
                    kind: "fallback",
                    generation: state.generation,
                    isError: true,
                    message: event.message,
                    toolInput: state.toolInput,
                },
                effect: { kind: "show_fallback", isError: true, message: event.message },
            };
        case "host_tool_input": {
            const nextInput =
                event.arguments === undefined ? {} : structuredClone(event.arguments);
            if (state.kind === "refreshing") {
                return {
                    state: { ...state, toolInput: nextInput },
                    effect: { kind: "none" },
                };
            }
            return {
                state: {
                    kind: "awaiting_host",
                    generation: state.generation + 1,
                    toolInput: nextInput,
                },
                effect: { kind: "show_fallback", isError: false, message: undefined },
            };
        }
        case "host_tool_input_partial":
            if (state.kind === "refreshing") {
                return { state, effect: { kind: "none" } };
            }
            return {
                state: {
                    kind: "awaiting_host",
                    generation: state.generation + 1,
                    toolInput: {},
                },
                effect: { kind: "show_fallback", isError: false, message: undefined },
            };
        case "host_tool_result":
            if (state.kind === "refreshing") {
                return { state, effect: { kind: "none" } };
            }
            return applyToolResult(state.generation + 1, state.toolInput, event.result);
        case "host_tool_cancelled": {
            const message =
                typeof event.reason === "string" && event.reason.length > 0
                    ? `Report request was cancelled: ${event.reason}`
                    : "Report request was cancelled.";
            return {
                state: {
                    kind: "fallback",
                    generation: state.generation + 1,
                    isError: true,
                    message,
                    toolInput: state.toolInput,
                },
                effect: { kind: "show_fallback", isError: true, message },
            };
        }
        case "direct_call_started": {
            if (state.kind !== "ready") {
                return { state, effect: { kind: "none" } };
            }
            return {
                state: {
                    kind: "refreshing",
                    generation: state.generation + 1,
                    callToken: event.callToken,
                    model: state.model,
                    toolInput: state.toolInput,
                },
                effect: { kind: "start_busy", message: "Refreshing report…" },
            };
        }
        case "direct_call_resolved": {
            if (
                state.kind !== "refreshing" ||
                state.callToken !== event.callToken ||
                state.generation !== event.generation
            ) {
                return { state, effect: { kind: "none" } };
            }
            return applyToolResult(state.generation, event.arguments, event.result);
        }
        case "direct_call_rejected": {
            if (
                state.kind !== "refreshing" ||
                state.callToken !== event.callToken ||
                state.generation !== event.generation
            ) {
                return { state, effect: { kind: "none" } };
            }
            return {
                state: {
                    kind: "fallback",
                    generation: state.generation,
                    isError: true,
                    message: event.message,
                    toolInput: state.toolInput,
                },
                effect: { kind: "show_fallback", isError: true, message: event.message },
            };
        }
        case "render_failed":
            return {
                state: {
                    kind: "fallback",
                    generation: state.generation,
                    isError: true,
                    message: event.message,
                    toolInput: state.toolInput,
                },
                effect: { kind: "show_fallback", isError: true, message: event.message },
            };
    }
}

function applyToolResult(
    generation: number,
    toolInput: Record<string, unknown>,
    result: unknown,
): ReportsWidgetTransition {
    const parsed = isRecord(result) ? result : undefined;
    if (parsed?.isError === true) {
        const message = firstTextBlock(parsed);
        return {
            state: {
                kind: "fallback",
                generation,
                isError: true,
                message,
                toolInput,
            },
            effect: { kind: "show_fallback", isError: true, message },
        };
    }
    const meta = isRecord(parsed?._meta) ? parsed._meta : undefined;
    const candidate = meta?.[REPORTS_APP_MODEL_META_KEY];
    if (!isReportsAppModel(candidate)) {
        const message = firstTextBlock(parsed);
        return {
            state: {
                kind: "fallback",
                generation,
                isError: false,
                message,
                toolInput,
            },
            effect: { kind: "show_fallback", isError: false, message },
        };
    }
    return {
        state: {
            kind: "ready",
            generation,
            model: candidate,
            toolInput,
        },
        effect: { kind: "render_model", model: candidate },
    };
}

function firstTextBlock(result: Record<string, unknown> | undefined): string | undefined {
    const content = result?.content;
    if (!Array.isArray(content)) return undefined;
    for (const item of content) {
        if (isRecord(item) && item.type === "text" && typeof item.text === "string") {
            return item.text;
        }
    }
    return undefined;
}

export function isReportsAppDirectTool(value: string): value is ReportsAppSourceTool {
    return REPORTS_APP_DIRECT_TOOLS.some((tool) => tool === value);
}

export function boundedReportArguments(
    name: ReportsAppSourceTool,
    input: Record<string, unknown>,
): Record<string, unknown> {
    const args = structuredClone(input);
    switch (name) {
        case "clockify_reports_detailed": {
            const filter = record(args.detailedFilter);
            args.detailedFilter = {
                ...filter,
                ...canonicalReportsAppPaging(filter.page, filter.pageSize),
            };
            break;
        }
        case "clockify_reports_attendance": {
            const filter = record(args.attendanceFilter);
            args.attendanceFilter = {
                ...filter,
                ...canonicalReportsAppPaging(filter.page, filter.pageSize),
            };
            break;
        }
        case "clockify_reports_expense":
            Object.assign(args, canonicalReportsAppPaging(args.page, args.pageSize));
            break;
        case "clockify_reports_summary":
        case "clockify_reports_weekly":
            break;
    }
    return args;
}

export function reportsMessagePrompt(
    intent: ReportsMessageIntent,
    model: ReportsAppModelV1,
): string {
    const range = `${model.query.dateRangeStart} to ${model.query.dateRangeEnd}`;
    const prompts: Record<ReportsMessageIntent, string> = {
        dates: `Help me rerun this ${model.kind} Clockify report for a different date range. The current exact range is ${range}. Ask me for the replacement range and preserve the current compatible filters.`,
        filters: `Help me change the complex filters for this ${model.kind} Clockify report over ${range}. Keep the report read-only.`,
        share: `Help me save or share this ${model.kind} Clockify report for ${range}. Use the governed shared-report workflow and preview every write before confirmation.`,
        switch: `Help me switch from this ${model.kind} Clockify report over ${range} to another report type. Ask for any inputs that are not compatible rather than guessing.`,
    };
    return prompts[intent];
}

function record(value: unknown): Record<string, unknown> {
    return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
