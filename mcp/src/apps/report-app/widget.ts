/// <reference lib="dom" />

import { App } from "@modelcontextprotocol/ext-apps/app-with-deps";

import {
    activeReportsWidgetModel,
    boundedReportArguments,
    initialReportsWidgetState,
    isReportsAppDirectTool,
    reportsMessagePrompt,
    transitionReportsWidgetState,
    type ReportsAppSourceTool,
    type ReportsWidgetEvent,
    type ReportsWidgetState,
} from "./app-policy.js";
import {
    ReportsLedgerView,
    type ReportsMessageIntent,
} from "./renderer.js";

const app = new App(
    { name: "ClockifyReportsLedger", version: "1.0.0" },
    { availableDisplayModes: ["inline", "fullscreen"] },
    { autoResize: true, strict: true },
);

let widgetState: ReportsWidgetState = initialReportsWidgetState();

const view = new ReportsLedgerView(document, {
    changePage: (delta) => void changePage(delta),
    changeWeeklyGroup: (group) => void changeWeeklyGroup(group),
    refresh: () => void refresh(),
    requestFullscreen: () => void requestFullscreen(),
    sendMessage: (intent) => void sendMessage(intent),
});

void start();

function dispatch(event: ReportsWidgetEvent): void {
    const { state, effect } = transitionReportsWidgetState(widgetState, event);
    widgetState = state;
    switch (effect.kind) {
        case "none":
            return;
        case "clear_busy":
            view.setBusy(false);
            return;
        case "start_busy":
            view.setBusy(true);
            view.showTransient(effect.message);
            return;
        case "show_fallback":
            view.showFallback(effect.isError, effect.message);
            return;
        case "render_model":
            try {
                view.render(effect.model);
            } catch (error) {
                dispatch({
                    type: "render_failed",
                    message: errorMessage(error, "The report App could not render this result."),
                });
            }
            return;
    }
}

async function start(): Promise<void> {
    app.onteardown = async () => {
        dispatch({ type: "teardown" });
        return {};
    };
    app.addEventListener("toolinput", ({ arguments: args }) => {
        // A host can echo the lifecycle of an app-initiated call. Keep that call's
        // generation and busy state intact; its callServerTool promise is authoritative.
        dispatch({ type: "host_tool_input", arguments: args });
    });
    app.addEventListener("toolinputpartial", () => {
        // Partial arguments are healed/incomplete JSON and must never become the
        // input for a report action. Ignore same-call notifications while a direct
        // app request is pending; otherwise clear stale model state until the
        // complete toolinput notification arrives.
        dispatch({ type: "host_tool_input_partial" });
    });
    app.addEventListener("toolresult", (result) => {
        // The host may also publish the result of the app-initiated request. Do
        // not invalidate the direct request or render an uncorrelated duplicate;
        // callServerTool below owns the authoritative result and error handling.
        dispatch({ type: "host_tool_result", result });
    });
    app.addEventListener("toolcancelled", (cancelled) => {
        dispatch({ type: "host_tool_cancelled", reason: cancelled.reason });
    });
    app.addEventListener("hostcontextchanged", (context) => {
        view.applyHostContext(context);
    });
    try {
        await app.connect();
        view.applyHostContext(app.getHostContext());
    } catch (error) {
        dispatch({
            type: "connect_failed",
            message: errorMessage(error, "Could not connect this App to its host."),
        });
    }
}

async function refresh(): Promise<void> {
    if (widgetState.kind !== "ready") return;
    await callReportTool(widgetState.model.sourceTool, widgetState.toolInput);
}

async function changePage(delta: -1 | 1): Promise<void> {
    if (widgetState.kind !== "ready" || !("paging" in widgetState.model.view)) return;
    const page = Math.max(1, widgetState.model.view.paging.page + delta);
    const args = structuredClone(widgetState.toolInput);
    switch (widgetState.model.kind) {
        case "detailed":
            args.detailedFilter = { ...asRecord(args.detailedFilter), page, pageSize: 50 };
            break;
        case "attendance":
            args.attendanceFilter = { ...asRecord(args.attendanceFilter), page, pageSize: 50 };
            break;
        case "expense":
            args.page = page;
            args.pageSize = 50;
            break;
        default:
            return;
    }
    await callReportTool(widgetState.model.sourceTool, args);
}

async function changeWeeklyGroup(group: "USER" | "PROJECT"): Promise<void> {
    if (
        widgetState.kind !== "ready" ||
        widgetState.model.kind !== "weekly" ||
        group === widgetState.model.view.group
    ) {
        return;
    }
    const args = structuredClone(widgetState.toolInput);
    args.weeklyFilter = { group, subgroup: "TIME" };
    await callReportTool("clockify_reports_weekly", args);
}

async function callReportTool(
    name: ReportsAppSourceTool,
    unboundedArguments: Record<string, unknown>,
): Promise<void> {
    if (!isReportsAppDirectTool(name)) throw new Error("Blocked non-report App tool call.");
    if (widgetState.kind !== "ready") return;
    const arguments_ = boundedReportArguments(name, unboundedArguments);
    const callToken = Symbol(name);
    dispatch({ type: "direct_call_started", callToken });
    const generation = widgetState.generation;
    try {
        const result = await app.callServerTool({ name, arguments: arguments_ });
        dispatch({
            type: "direct_call_resolved",
            callToken,
            generation,
            arguments: arguments_,
            result,
        });
    } catch (error) {
        dispatch({
            type: "direct_call_rejected",
            callToken,
            generation,
            message: errorMessage(error, "Report refresh failed."),
        });
    }
}

async function sendMessage(intent: ReportsMessageIntent): Promise<void> {
    const model = activeReportsWidgetModel(widgetState);
    if (!model) return;
    try {
        await app.sendMessage({
            role: "user",
            content: [{ type: "text", text: reportsMessagePrompt(intent, model) }],
        });
    } catch (error) {
        view.showTransient(errorMessage(error, "Could not send this request to the conversation."));
    }
}

async function requestFullscreen(): Promise<void> {
    try {
        await app.requestDisplayMode({ mode: "fullscreen" });
    } catch (error) {
        view.showTransient(errorMessage(error, "Full-screen mode is not available in this host."));
    }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}
