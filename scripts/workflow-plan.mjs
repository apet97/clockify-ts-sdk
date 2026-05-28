// Planner module: SDK/CLI/MCP workflow plan.
// Invoked via `node scripts/plan.mjs workflow [--workflow <id|list|all>]`.
// Does not run Git, npm, Docker, Fern, tests, builds, or Clockify API calls.
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

function selectedWorkflows(id) {
    if (id === "list") return [];
    const ids = id === "all" ? Object.keys(workflows) : [id];
    return ids.map((workflowId) => ({ id: workflowId, ...workflows[workflowId] }));
}

export function buildPlan(options = { workflow: "all" }) {
    const workflow = options.workflow ?? "all";
    if (![...Object.keys(workflows), "all", "list"].includes(workflow)) {
        throw new Error(`Unknown workflow: ${workflow}`);
    }
    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        network: "none",
        commandsExecuted: [],
        envValuesCaptured: false,
        workflow,
        availableWorkflows: workflow === "list" ? Object.keys(workflows) : undefined,
        workflows: selectedWorkflows(workflow),
        warning: "This plan is not proof. Run make workflow-cookbook and surface-specific gates before claiming readiness.",
    };
}

export function renderMarkdown(plan) {
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

