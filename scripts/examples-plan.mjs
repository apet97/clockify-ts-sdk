// Planner module: SDK/CLI/MCP examples plan.
// Invoked via `node scripts/plan.mjs examples [--example <id|list|all>]`.
// Does not run Git, npm, Docker, Fern, tests, builds, or Clockify API calls.
const examples = {
    "auth-status": {
        job: "Authenticate and construct a client",
        sdk: ["wrapper/examples/auth.ts"],
        cli: ["clk115 status"],
        mcp: ["clockify_status"],
        safety: "Use environment variables; never commit tokens.",
        proof: ["make examples-contract", "make examples-matrix", "make diagnostics"],
    },
    pagination: {
        job: "Paginate lists",
        sdk: ["wrapper/examples/paginate-all.ts", "wrapper/examples/paginated-list-basic.ts"],
        cli: ["clk115 projects list --json"],
        mcp: ["clockify_projects_list and other list domain tools"],
        safety: "Read-only; safe for mock or sandbox.",
        proof: ["make examples-matrix", "make mock-contract", "make acceptance-scenarios"],
    },
    "time-entry": {
        job: "Log and clean up time",
        sdk: ["wrapper/examples/log-time-entry.ts"],
        cli: ["clk115 log", "clk115 entries delete <id>"],
        mcp: ["clockify_log_work", "clockify_review_day", "clockify_fix_entry"],
        safety: "Live write requires sandbox and returned IDs.",
        proof: ["make live-safety", "make test-data-lifecycle", "make acceptance-scenarios"],
    },
    "work-package": {
        job: "Create or reuse work package objects",
        sdk: ["wrapper/examples/create-project.ts"],
        cli: ["clk115 clients create", "clk115 projects create", "clk115 tags create"],
        mcp: ["clockify_create_work_package"],
        safety: "Prefer reuse receipts and explicit IDs.",
        proof: ["make workflow-cookbook", "make examples-matrix", "make acceptance-scenarios"],
    },
    "business-admin": {
        job: "Business/admin write preview",
        sdk: ["SDK resource clients plus withResponse()"],
        cli: ["clk115 invoices create", "clk115 scheduling create", "clk115 webhooks create"],
        mcp: ["clockify_invoice_client_work", "clockify_schedule_work", "clockify_setup_webhook"],
        safety: "MCP uses dry_run:true plus confirm_token; CLI remains explicit and non-interactive.",
        proof: ["make mcp-write-safety", "make cli-write-safety", "make mutation-safety"],
    },
    "retry-idempotency": {
        job: "Retry and idempotency",
        sdk: [
            "wrapper/examples/retry-custom.ts",
            "wrapper/examples/idempotency.ts",
            "wrapper/examples/pass-idempotency-key.ts",
        ],
        cli: ["retry at caller shell level only after checking receipts"],
        mcp: ["MCP recovery hints instead of blind retries"],
        safety: "Non-idempotent creates are not auto-retried by default.",
        proof: ["make mutation-safety", "make receipts-contract", "make receipt-examples"],
    },
    observability: {
        job: "Observability and support",
        sdk: ["wrapper/examples/structured-logging.ts", "wrapper/examples/middleware-datadog.ts"],
        cli: ["--json receipts and exit codes"],
        mcp: ["structuredContent", "changed", "warnings", "next", "recovery"],
        safety: "Preserve request IDs and stable error codes.",
        proof: ["make observability", "make support-bundle", "make receipt-examples"],
    },
    webhooks: {
        job: "Webhook handling",
        sdk: ["wrapper/examples/verify-webhook.ts"],
        cli: ["clk115 webhooks list/create/delete"],
        mcp: ["clockify_setup_webhook"],
        safety: "Never expose webhook secrets; use sanitized payloads.",
        proof: ["make snippet-safety", "make data-handling", "make security-threat-model"],
    },
    "demo-cleanup": {
        job: "Demo and cleanup",
        sdk: ["SDK clients with timestamped slugs"],
        cli: ["normal create/list/delete commands in sandbox"],
        mcp: ["clockify_demo_seed", "clockify_demo_cleanup"],
        safety: "Cleanup receipt and leftover count are proof.",
        proof: ["make live-safety", "make test-data-lifecycle", "make acceptance-scenarios"],
    },
};

function selectedExamples(id) {
    if (id === "list") return [];
    const ids = id === "all" ? Object.keys(examples) : [id];
    return ids.map((exampleId) => ({ id: exampleId, ...examples[exampleId] }));
}

export function buildPlan(options = { example: "all" }) {
    const example = options.example ?? "all";
    if (![...Object.keys(examples), "all", "list"].includes(example)) {
        throw new Error(`Unknown example: ${example}`);
    }
    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        network: "none",
        commandsExecuted: [],
        envValuesCaptured: false,
        example,
        availableExamples: example === "list" ? Object.keys(examples) : undefined,
        examples: selectedExamples(example),
        warning: "This plan is not proof. Run make examples-matrix and surface-specific gates before claiming readiness.",
    };
}

export function renderMarkdown(plan) {
    if (plan.availableExamples) {
        return `# Example IDs\n\n${plan.availableExamples.map((id) => `- \`${id}\``).join("\n")}\n`;
    }

    const lines = ["# SDK CLI MCP Examples Plan", ""];
    lines.push("This plan is not proof. It does not run commands.");
    lines.push("");
    for (const example of plan.examples) {
        lines.push(`## ${example.job}`);
        lines.push("");
        lines.push(`Example ID: \`${example.id}\``);
        lines.push(`Safety boundary: ${example.safety}`);
        lines.push("");
        lines.push("SDK:");
        for (const item of example.sdk) lines.push(`- \`${item}\``);
        lines.push("");
        lines.push("CLI:");
        for (const item of example.cli) lines.push(`- \`${item}\``);
        lines.push("");
        lines.push("MCP:");
        for (const item of example.mcp) lines.push(`- \`${item}\``);
        lines.push("");
        lines.push("Proof hints:");
        for (const item of example.proof) lines.push(`- \`${item}\``);
        lines.push("");
    }
    return `${lines.join("\n")}\n`;
}

