/// <reference lib="dom" />

import { App } from "@modelcontextprotocol/ext-apps/app-with-deps";

import {
    boundedReportArguments,
    isReportsAppDirectTool,
    reportsMessagePrompt,
    type ReportsAppSourceTool,
} from "./app-policy.js";
import {
    REPORTS_APP_MODEL_META_KEY,
} from "./constants.js";
import type { ReportsAppModelV1 } from "./model-types.js";
import { isReportsAppModel } from "./model-validation.js";
import {
    ReportsLedgerView,
    type ReportsMessageIntent,
} from "./renderer.js";

const app = new App(
    { name: "ClockifyReportsLedger", version: "1.0.0" },
    { availableDisplayModes: ["inline", "fullscreen"] },
    { autoResize: true, strict: true },
);

let currentModel: ReportsAppModelV1 | undefined;
let toolInput: Record<string, unknown> = {};
let busy = false;

const view = new ReportsLedgerView(document, {
    changePage: (delta) => void changePage(delta),
    changeWeeklyGroup: (group) => void changeWeeklyGroup(group),
    refresh: () => void refresh(),
    requestFullscreen: () => void requestFullscreen(),
    sendMessage: (intent) => void sendMessage(intent),
});

void start();

async function start(): Promise<void> {
    app.addEventListener("toolinput", ({ arguments: args }) => {
        toolInput = args === undefined ? {} : structuredClone(args);
    });
    app.addEventListener("toolresult", (result) => {
        receiveResult(result);
    });
    app.addEventListener("toolcancelled", (cancelled) => {
        currentModel = undefined;
        busy = false;
        view.setBusy(false);
        view.showFallback(
            true,
            typeof cancelled.reason === "string" && cancelled.reason.length > 0
                ? `Report request was cancelled: ${cancelled.reason}`
                : "Report request was cancelled.",
        );
    });
    app.addEventListener("hostcontextchanged", (context) => {
        view.applyHostContext(context);
    });
    try {
        await app.connect();
        view.applyHostContext(app.getHostContext());
    } catch (error) {
        view.showFallback(true, errorMessage(error, "Could not connect this App to its host."));
    }
}

function receiveResult(result: unknown): void {
    const record = asRecord(result);
    if (record?.isError === true) {
        currentModel = undefined;
        view.showFallback(true, firstText(record));
        return;
    }
    const meta = asRecord(record?._meta);
    const candidate = meta?.[REPORTS_APP_MODEL_META_KEY];
    if (!isReportsAppModel(candidate)) {
        currentModel = undefined;
        view.showFallback(false, firstText(record));
        return;
    }
    try {
        view.render(candidate);
        currentModel = candidate;
    } catch (error) {
        currentModel = undefined;
        view.showFallback(true, errorMessage(error, "The report App could not render this result."));
    }
}

async function refresh(): Promise<void> {
    if (!currentModel || busy) return;
    await callReportTool(currentModel.sourceTool, toolInput);
}

async function changePage(delta: -1 | 1): Promise<void> {
    if (busy || !currentModel || !("paging" in currentModel.view)) return;
    const page = Math.max(1, currentModel.view.paging.page + delta);
    const args = structuredClone(toolInput);
    switch (currentModel.kind) {
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
    await callReportTool(currentModel.sourceTool, args);
}

async function changeWeeklyGroup(group: "USER" | "PROJECT"): Promise<void> {
    if (busy || currentModel?.kind !== "weekly" || group === currentModel.view.group) return;
    const args = structuredClone(toolInput);
    args.weeklyFilter = { group, subgroup: "TIME" };
    await callReportTool("clockify_reports_weekly", args);
}

async function callReportTool(
    name: ReportsAppSourceTool,
    unboundedArguments: Record<string, unknown>,
): Promise<void> {
    if (!isReportsAppDirectTool(name)) throw new Error("Blocked non-report App tool call.");
    const arguments_ = boundedReportArguments(name, unboundedArguments);
    busy = true;
    view.setBusy(true);
    view.showTransient("Refreshing report…");
    try {
        const result = await app.callServerTool({ name, arguments: arguments_ });
        toolInput = arguments_;
        receiveResult(result);
    } catch (error) {
        currentModel = undefined;
        view.showFallback(true, errorMessage(error, "Report refresh failed."));
    } finally {
        busy = false;
        view.setBusy(false);
    }
}

async function sendMessage(intent: ReportsMessageIntent): Promise<void> {
    const model = currentModel;
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

function firstText(result: Record<string, unknown> | undefined): string | undefined {
    const content = result?.content;
    if (!Array.isArray(content)) return undefined;
    for (const item of content) {
        const block = asRecord(item);
        if (block?.type === "text" && typeof block.text === "string") return block.text;
    }
    return undefined;
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
