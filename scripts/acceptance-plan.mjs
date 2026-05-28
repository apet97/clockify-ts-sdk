// Planner module: acceptance scenario proof plan.
// Invoked via `node scripts/plan.mjs acceptance [--scenario <id|list|all>]`.
// Does not run Git, npm, Docker, Fern, tests, builds, or Clockify API calls.
const scenarios = {
    "auth-status": {
        title: "Auth and status",
        sdk: ["createClockifyClient()", "client.health()", "withResponse()"],
        cli: ["clk115 status --json"],
        mcp: ["clockify_status"],
        evidence: [
            "make diagnostics",
            "make env-contract",
            "make observability",
            "mock-backed SDK/CLI/MCP status tests",
        ],
        escalation: "mock-first",
        cleanup: "none",
    },
    "first-run-diagnostics-support": {
        title: "First-run diagnostics and support handoff",
        sdk: ["clockifyDiagnostics()", "quickstart receipt template"],
        cli: ["clk115 doctor --json", "clk115 status --json"],
        mcp: ["clockify://mcp/doctor"],
        evidence: [
            "make quickstart-receipt",
            "make diagnostics",
            "make support-bundle",
            "make issue-intake",
            "support bundle readinessContext + safeCommandHints",
        ],
        escalation: "no-network-first",
        cleanup: "none; no Clockify calls before sandbox proof",
    },
    "paginated-list-traversal": {
        title: "Paginated list traversal",
        sdk: ["paginate", "iterAll", "iterPages", "PaginatedList"],
        cli: ["clk115 projects list --json", "other list commands with --json"],
        mcp: ["clockify_projects_list", "other domain list tools"],
        evidence: [
            "make mock-contract",
            "wrapper mock pagination tests",
            "live sandbox pagination coverage before readiness claims",
        ],
        escalation: "mock-plus-live",
        cleanup: "none unless a live fixture creates listable objects",
    },
    "time-entry-mutation-cleanup": {
        title: "Time-entry mutation and cleanup",
        sdk: ["time-entry create/list/update/delete resource clients"],
        cli: ["clk115 log", "clk115 entries list", "clk115 entries delete <id>"],
        mcp: ["clockify_log_work", "clockify_review_day", "clockify_fix_entry"],
        evidence: [
            "make live-safety",
            "make test-data-lifecycle",
            "make perfect-live",
            "final leftover count in final proof receipt",
        ],
        escalation: "live-sandbox-required",
        cleanup: "returned IDs, cleanup prefix, changed receipt, leftover count",
    },
    "work-package-setup": {
        title: "Work-package setup",
        sdk: ["client.clients", "client.projects", "client.tasks", "client.tags"],
        cli: ["clients create", "projects create", "tasks list", "tags create"],
        mcp: ["clockify_create_work_package"],
        evidence: [
            "make workflow-cookbook",
            "make acceptance-scenarios",
            "reuse/created receipts with explicit IDs",
        ],
        escalation: "mock-first-live-when-mutating",
        cleanup: "reuse existing objects or clean created objects by returned IDs",
    },
    "business-admin-guarded-write": {
        title: "Business/admin guarded write",
        sdk: ["client.invoices", "client.expenses", "client.timeOff", "client.scheduling", "client.webhooks"],
        cli: ["explicit non-interactive create/delete commands"],
        mcp: [
            "clockify_invoice_client_work",
            "clockify_record_expense",
            "clockify_request_time_off",
            "clockify_schedule_work",
            "clockify_setup_webhook",
        ],
        evidence: [
            "make mcp-write-safety",
            "make cli-write-safety",
            "make mutation-safety",
            "MCP dry_run:true plus confirm_token receipts",
        ],
        escalation: "guarded-write",
        cleanup: "preview first, confirm explicitly, capture changed and next receipts",
    },
    "recovery-observability": {
        title: "Recovery and observability",
        sdk: ["typed errors", "stable codes", "rate-limit helpers", "OTel hooks", "withResponse()"],
        cli: ["--json error receipts with code, retryable, recovery"],
        mcp: ["structuredContent error envelope with recovery and next"],
        evidence: [
            "make receipt-examples",
            "make observability",
            "make support-bundle",
            "make data-handling",
        ],
        escalation: "contract-proof",
        cleanup: "redact support evidence and preserve request/tool correlation",
    },
    "openapi-generated-core": {
        title: "OpenAPI truth and generated core",
        sdk: ["generated SDK methods behind durable wrapper seams"],
        cli: ["wrapper semantics instead of invented API truth"],
        mcp: ["wrapper semantics and parity metadata"],
        evidence: [
            "make goclmcp-drift",
            "make fern-check",
            "make fern-generate",
            "make operation-coverage",
            "make generator-comparison",
            "make generated-edit-check",
        ],
        escalation: "perfect-full",
        cleanup: "do not hand-edit spec/corrected/**, output/ts-sdk/**, or wrapper/src/**",
    },
    "package-consumer-install-smoke": {
        title: "Package-consumer install smoke",
        sdk: ["packed SDK tarball imports ESM/CJS and subpaths"],
        cli: ["packed CLI exposes clockify115 and clk115"],
        mcp: ["packed MCP exposes clockify115-mcp"],
        evidence: [
            "make pack-smoke",
            "make package-contract",
            "make runtime-support",
            "make dependency-boundary",
            "make supply-chain",
        ],
        escalation: "pack-proof",
        cleanup: "temp consumers only; do not publish to npm",
    },
};

function selectedScenarios(id) {
    if (id === "list") return [];
    const ids = id === "all" ? Object.keys(scenarios) : [id];
    return ids.map((scenarioId) => ({ id: scenarioId, ...scenarios[scenarioId] }));
}

export function buildPlan(options = { scenario: "all" }) {
    const scenario = options.scenario ?? "all";
    if (![...Object.keys(scenarios), "all", "list"].includes(scenario)) {
        throw new Error(`Unknown scenario: ${scenario}`);
    }
    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        network: "none",
        commandsExecuted: [],
        envValuesCaptured: false,
        scenario,
        availableScenarios: scenario === "list" ? Object.keys(scenarios) : undefined,
        scenarios: selectedScenarios(scenario),
        warning:
            "This plan is not proof. Run make acceptance-scenarios and scenario-specific gates before claiming readiness.",
    };
}

export function renderMarkdown(plan) {
    if (plan.availableScenarios) {
        return `# Acceptance Scenario IDs\n\n${plan.availableScenarios.map((id) => `- \`${id}\``).join("\n")}\n`;
    }

    const lines = ["# Acceptance Scenario Proof Plan", ""];
    lines.push("This plan is not proof. It does not run commands.");
    lines.push("");
    for (const scenario of plan.scenarios) {
        lines.push(`## ${scenario.title}`);
        lines.push("");
        lines.push(`Scenario ID: \`${scenario.id}\``);
        lines.push(`Escalation: ${scenario.escalation}`);
        lines.push(`Cleanup: ${scenario.cleanup}`);
        lines.push("");
        lines.push("SDK:");
        for (const item of scenario.sdk) lines.push(`- \`${item}\``);
        lines.push("");
        lines.push("CLI:");
        for (const item of scenario.cli) lines.push(`- \`${item}\``);
        lines.push("");
        lines.push("MCP:");
        for (const item of scenario.mcp) lines.push(`- \`${item}\``);
        lines.push("");
        lines.push("Required evidence:");
        for (const item of scenario.evidence) lines.push(`- \`${item}\``);
        lines.push("");
    }
    return `${lines.join("\n")}\n`;
}

