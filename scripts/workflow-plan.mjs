#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

const workflows = {
    "first-run-support": {
        title: "First-run diagnostics and support handoff",
        useWhen: "Diagnose setup, auth, runtime, or support-readiness issues before mock or live proof.",
        sdk: [
            "clockifyDiagnostics()",
            "docs/quickstart-receipt.md",
            "scripts/create-support-bundle.mjs",
        ],
        cli: [
            "clk115 doctor --json",
            "clk115 status --json",
            "make quickstart-receipt",
            "make support-bundle",
        ],
        mcp: ["clockify://mcp/doctor"],
        safety: [
            "Keep first-run diagnostics no-network until an operator deliberately runs mock or sandbox proof.",
            "Support bundles must keep envValuesCaptured false and preserve readinessContext.",
            "Use safeCommandHints before asking a non-coder to paste logs or retry live calls.",
        ],
    },
    "time-tracking": {
        title: "Daily time tracking",
        useWhen: "Start, stop, switch, log, review, fix, or delete work entries.",
        sdk: [
            "createClockifyClient()",
            "client.timeEntries",
            "iterAll",
            "iterPages",
        ],
        cli: [
            "clk115 start",
            "clk115 stop",
            "clk115 log",
            "clk115 entries list",
            "clk115 entries delete <id>",
        ],
        mcp: [
            "clockify_start_work",
            "clockify_stop_work",
            "clockify_switch_work",
            "clockify_log_work",
            "clockify_review_day",
            "clockify_review_week",
            "clockify_fix_entry",
        ],
        safety: [
            "Prefer returned IDs over name lookups when updating or deleting.",
            "CLI delete commands require explicit IDs.",
            "MCP workflow tools should return changed and next receipts when useful.",
        ],
    },
    "work-package": {
        title: "Work package setup",
        useWhen: "Create or reuse a client, project, task, and tags before tracking work.",
        sdk: ["client.clients", "client.projects", "client.tasks", "client.tags"],
        cli: [
            "clk115 clients list",
            "clk115 clients create",
            "clk115 projects list",
            "clk115 projects create",
            "clk115 tasks list",
            "clk115 tags list",
            "clk115 tags create",
        ],
        mcp: [
            "clockify_create_work_package",
            "clockify_clients_*",
            "clockify_projects_*",
            "clockify_tasks_*",
            "clockify_tags_*",
        ],
        safety: [
            "Reuse existing objects when the workflow returns a reused receipt.",
            "Keep product examples on the public SDK package, not generated internals.",
        ],
    },
    "business-workflows": {
        title: "Business and admin workflows",
        useWhen: "Handle invoices, expenses, time off, scheduling, webhooks, or audit logs.",
        sdk: [
            "client.invoices",
            "client.expenses",
            "client.timeOff",
            "client.scheduling",
            "client.webhooks",
            "client.auditLogReport",
        ],
        cli: [
            "clk115 invoices list",
            "clk115 invoices create",
            "clk115 expenses list",
            "clk115 timeoff list",
            "clk115 timeoff submit",
            "clk115 scheduling list",
            "clk115 scheduling create",
            "clk115 webhooks list",
            "clk115 webhooks create",
            "clk115 audit-log search",
        ],
        mcp: [
            "clockify_invoice_client_work",
            "clockify_record_expense",
            "clockify_request_time_off",
            "clockify_schedule_work",
            "clockify_setup_webhook",
        ],
        safety: [
            "MCP business/admin writes require dry_run:true and the returned confirm_token before execution.",
            "CLI writes stay non-interactive and scriptable.",
            "SDK callers should use withResponse() or composed-fetch hooks when request IDs and headers matter.",
        ],
    },
    "demo-and-cleanup": {
        title: "Demo and cleanup",
        useWhen: "Run deterministic examples, smoke tests, and live sandbox demos.",
        sdk: [
            "client.clients",
            "client.projects",
            "client.tasks",
            "client.tags",
            "client.timeEntries",
        ],
        cli: ["Use normal create/list/delete commands in a sacrificial workspace."],
        mcp: ["clockify_demo_seed", "clockify_demo_cleanup"],
        safety: [
            "Live demo objects must use identifiable prefixes.",
            "Cleanup receipts are part of proof.",
            "Do not run demo or live proof against a customer workspace.",
        ],
    },
    recovery: {
        title: "Recovery pattern",
        useWhen: "Handle failures without guessing or widening behavior.",
        sdk: [
            "classifyClockifyError()",
            "getStableErrorCode()",
            "typed error classes",
            "getRateLimitFromError()",
        ],
        cli: ["--json errors include code, recovery, and retryable"],
        mcp: ["error envelopes include stable error.code, recovery, and retry hints"],
        safety: [
            "Keep request IDs or tool envelopes.",
            "Report the stable error code.",
            "Use the recovery hint before changing behavior.",
        ],
    },
};

function usage() {
    return [
        "Usage: node scripts/workflow-plan.mjs [--workflow <id|list|all>] [--format <markdown|json>]",
        "",
        "Prints a no-network SDK/CLI/MCP workflow plan.",
        "Does not run Git, npm, Docker, Fern, tests, builds, or Clockify API calls.",
        "This plan is not proof; run make workflow-cookbook and surface-specific gates for proof.",
    ].join("\n");
}

function parseArgs(argv) {
    const options = { workflow: "all", format: "markdown" };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--help" || arg === "-h") {
            console.log(usage());
            process.exit(0);
        }
        if (arg === "--workflow") {
            options.workflow = argv[i + 1] ?? "";
            i += 1;
            continue;
        }
        if (arg === "--format") {
            options.format = argv[i + 1] ?? "";
            i += 1;
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
    if (![...Object.keys(workflows), "all", "list"].includes(options.workflow)) {
        throw new Error(`Unknown workflow: ${options.workflow}`);
    }
    if (!["markdown", "json"].includes(options.format)) throw new Error(`Unknown format: ${options.format}`);
    return options;
}

function selectedWorkflows(id) {
    if (id === "list") return [];
    const ids = id === "all" ? Object.keys(workflows) : [id];
    return ids.map((workflowId) => ({ id: workflowId, ...workflows[workflowId] }));
}

export function buildPlan(options = { workflow: "all" }) {
    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        network: "none",
        commandsExecuted: [],
        envValuesCaptured: false,
        workflow: options.workflow,
        availableWorkflows: options.workflow === "list" ? Object.keys(workflows) : undefined,
        workflows: selectedWorkflows(options.workflow),
        warning: "This plan is not proof. Run make workflow-cookbook and surface-specific gates before claiming readiness.",
    };
}

function renderMarkdown(plan) {
    if (plan.availableWorkflows) {
        return `# Workflow IDs\n\n${plan.availableWorkflows.map((id) => `- \`${id}\``).join("\n")}\n`;
    }

    const lines = ["# SDK CLI MCP Workflow Plan", ""];
    lines.push("This plan is not proof. It does not run commands.");
    lines.push("");
    for (const workflow of plan.workflows) {
        lines.push(`## ${workflow.title}`);
        lines.push("");
        lines.push(`Use when: ${workflow.useWhen}`);
        lines.push("");
        lines.push("SDK:");
        for (const item of workflow.sdk) lines.push(`- \`${item}\``);
        lines.push("");
        lines.push("CLI:");
        for (const item of workflow.cli) lines.push(`- \`${item}\``);
        lines.push("");
        lines.push("MCP:");
        for (const item of workflow.mcp) lines.push(`- \`${item}\``);
        lines.push("");
        lines.push("Safety:");
        for (const item of workflow.safety) lines.push(`- ${item}`);
        lines.push("");
    }
    return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    const plan = buildPlan(options);
    if (options.format === "json") {
        console.log(JSON.stringify(plan, null, 2));
    } else {
        console.log(renderMarkdown(plan));
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        console.error(usage());
        process.exit(2);
    }
}
