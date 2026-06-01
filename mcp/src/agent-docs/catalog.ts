/**
 * Static, no-network knowledge index for agent discovery tools. Each
 * chunk maps a Clockify task area to the recommended MCP tools, SDK
 * imports, CLI examples, and next steps so an agent can orient without
 * reading the full tool catalog.
 */
export interface AgentDocChunk {
    id: string;
    title: string;
    surface: "sdk" | "cli" | "mcp" | "workflow" | "safety";
    text: string;
    tools: string[];
    sdkImports: string[];
    cliExamples: string[];
    next: string[];
}

export const AGENT_DOC_CHUNKS: AgentDocChunk[] = [
    {
        id: "status-first",
        title: "Start with status and diagnostics",
        surface: "workflow",
        text:
            "Use clockify_status first to confirm workspace, auth mode, and connectivity. " +
            "Use the SDK diagnostics helper or CLI doctor when debugging local setup.",
        tools: ["clockify_status"],
        sdkImports: ["createClockifyClient", "clockifyDiagnostics", "clockifyHealth"],
        cliExamples: ["clockify115 status --output json", "clockify115 doctor --output json"],
        next: ["List tags or projects only after status succeeds."],
    },
    {
        id: "safe-writes",
        title: "Preview high-risk writes before confirmation",
        surface: "safety",
        text:
            "High-risk MCP workflow writes and destructive domain deletes use dry_run first, " +
            "then confirm_token. CLI raw writes should use sandbox workspaces and include response headers.",
        tools: [
            "clockify_fix_entry",
            "clockify_setup_webhook",
            "clockify_projects_delete",
            "clockify_entries_delete",
        ],
        sdkImports: ["toOperationReceipt", "toOperationErrorReceipt", "withIdempotencyKey"],
        cliExamples: [
            "clockify115 api POST /workspaces/{workspaceId}/tags --body '{\"name\":\"sandbox\"}' --include-headers --output json",
        ],
        next: ["Keep created ids for cleanup in the same run."],
    },
    {
        id: "pagination",
        title: "Paginate lists consistently",
        surface: "sdk",
        text:
            "The SDK exposes iterAll and iterPages for known paginated methods. " +
            "The CLI raw API command supports --all for page/page-size array endpoints.",
        tools: ["clockify_entries_list", "clockify_projects_list", "clockify_tags_list"],
        sdkImports: ["iterAll", "iterPages", "PaginatedList"],
        cliExamples: [
            "clockify115 api GET /workspaces/{workspaceId}/projects --all --page-size 50 --output ndjson",
        ],
        next: ["Use max page limits in automation to avoid unbounded walks."],
    },
    {
        id: "webhooks",
        title: "Webhook setup is URL guarded",
        surface: "mcp",
        text:
            "clockify_setup_webhook validates callback URLs before preview or creation. " +
            "The guard rejects local, private, and unsafe callback targets without live DNS checks.",
        tools: ["clockify_setup_webhook", "clockify_webhooks_list", "clockify_webhooks_delete"],
        sdkImports: ["verifyClockifyWebhook", "constructEvent"],
        cliExamples: ["clockify115 webhooks list --output json"],
        next: ["Use dry_run first and inspect warnings before creation."],
    },
    {
        id: "raw-api",
        title: "Use raw API for long-tail endpoints",
        surface: "cli",
        text:
            "Curated CLI commands cover common workflows. The api command covers long-tail endpoints " +
            "through the generated client's fetch method without adding a command for every operation.",
        tools: ["clockify_status"],
        sdkImports: ["createClockifyClient", "requestOptions", "toOperationReceipt"],
        cliExamples: [
            "clockify115 api GET /workspaces/{workspaceId}/tags --query page=1 --query page-size=20 --output json",
        ],
        next: ["Promote repeated raw API usage into a curated command only when it becomes common."],
    },
];
