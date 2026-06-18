#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const jsonPath = path.join(root, "docs", "product-surface.json");
const mdPath = path.join(root, "docs", "product-surface.md");

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function maybeReadJson(relativePath) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) return undefined;
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function listExports(pkg) {
    return Object.keys(pkg.exports ?? {}).sort((a, b) => a.localeCompare(b));
}

function packageFiles(pkg) {
    return [...(pkg.files ?? [])].sort((a, b) => a.localeCompare(b));
}

function prepublishGate(pkg) {
    return pkg.scripts?.prepublishOnly ?? null;
}

const wrapperPkg = readJson("wrapper/package.json");
const cliPkg = readJson("cli/package.json");
const mcpPkg = readJson("mcp/package.json");
const mcpTools = readJson("docs/mcp-tools.json");
function goMcpMetadata() {
    const goCatalog = maybeReadJson("../GOCLMCP/docs/tool-catalog.json");
    const goTools = Array.isArray(goCatalog?.tools) ? goCatalog.tools : [];
    if (goTools.length > 0) {
        const detectedCategoryCounts = goTools.reduce((acc, tool) => {
            const category = tool.category ?? "unknown";
            acc[category] = (acc[category] ?? 0) + 1;
            return acc;
        }, {});
        return {
            detectedToolCount: goTools.length,
            detectedCategoryCounts,
        };
    }

    const current = maybeReadJson("docs/product-surface.json");
    const currentGoMcp = current?.packages?.goMcp ?? {};
    return {
        detectedToolCount: currentGoMcp.detectedToolCount ?? null,
        detectedCategoryCounts: currentGoMcp.detectedCategoryCounts ?? {},
    };
}

function requirePositiveInteger(label, value) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${label} must be a positive integer`);
    }
    return value;
}

const tsMcpSummary = mcpTools.summary ?? {};
const tsMcpToolCounts = {
    total: requirePositiveInteger("docs/mcp-tools.json summary.totalTools", tsMcpSummary.totalTools),
    workflow: requirePositiveInteger(
        "docs/mcp-tools.json summary.workflowTools",
        tsMcpSummary.workflowTools,
    ),
    domain: requirePositiveInteger("docs/mcp-tools.json summary.domainTools", tsMcpSummary.domainTools),
};

const workflows = [
    {
        id: "status",
        userGoal: "Confirm authentication, workspace, user, and running timer state.",
        sdk: ["createClockifyClient", "clockifyDiagnostics", "client.health", "client.workspaces", "client.timeEntries"],
        cli: ["clockify115 status", "clk115 status", "clk115 doctor"],
        tsMcp: ["clockify_status", "clockify://mcp/doctor"],
        goMcp: ["clockify_status"],
        proof: ["wrapper/tests/diagnostics.test.ts", "wrapper/tests/health.test.ts", "cli/tests", "mcp/tests"],
        surfaceAvailability: {
            sdk: "supported through diagnostics, health, workspace, and time-entry APIs",
            cli: "supported through status and doctor commands",
            tsMcp: "supported through status tool and doctor resource",
            goMcp: "supported through status tool",
        },
        proofMode: "mock/unit plus live sandbox status probes when credentials are present",
        recovery: ["Use diagnostics request IDs and stable error codes before changing auth or workspace configuration."],
        intentionalGaps: [],
    },
    {
        id: "first-run-support",
        userGoal: "Diagnose first-run setup issues and prepare a safe support handoff before mock or live proof.",
        sdk: ["clockifyDiagnostics", "docs/quickstart-receipt.md", "scripts/create-support-bundle.mjs"],
        cli: ["clk115 doctor", "clk115 status", "make diagnostics", "make support-bundle"],
        tsMcp: ["clockify://mcp/doctor"],
        goMcp: ["clockify://mcp/doctor"],
        proof: [
            "docs/quickstart-receipt.md",
            "docs/support-bundle-contract.json",
            "docs/issue-intake-contract.json",
            "docs/acceptance-scenarios.md",
        ],
        surfaceAvailability: {
            sdk: "supported through no-network diagnostics and generated support bundle metadata",
            cli: "supported through doctor/status plus quickstart and support-bundle gates",
            tsMcp: "supported through the doctor resource, not a mutating tool",
            goMcp: "supported through the matching doctor resource",
        },
        proofMode: "no-network diagnostics and support-bundle contracts before mock or live sandbox proof",
        recovery: [
            "Use readinessContext, safeCommandHints, and diagnostic receipt output before asking for logs or retrying live calls.",
        ],
        intentionalGaps: ["This workflow is diagnostics/support-only; it must not mutate Clockify, publish packages, or use customer workspaces."],
    },
    {
        id: "time-tracking",
        userGoal: "Start, stop, switch, log, list, update, and delete time entries.",
        sdk: ["client.timeEntries", "iterAll", "iterPages"],
        cli: ["clk115 start", "clk115 stop", "clk115 log", "clk115 entries list", "clk115 entries delete"],
        tsMcp: ["clockify_start_work", "clockify_stop_work", "clockify_switch_work", "clockify_log_work", "clockify_review_day", "clockify_review_week", "clockify_fix_entry"],
        goMcp: ["clockify_start_work", "clockify_stop_work", "clockify_switch_work", "clockify_log_work", "clockify_review_day", "clockify_review_week", "clockify_fix_entry"],
        proof: ["wrapper/tests/iter.test.ts", "cli/tests/sandbox.test.ts", "mcp/tests/sandbox.test.ts"],
        surfaceAvailability: {
            sdk: "supported through time-entry resources and pagination helpers",
            cli: "supported through first-class start, stop, log, list, and delete commands",
            tsMcp: "supported through workflow tools for start, stop, switch, log, review, and fix",
            goMcp: "supported through matching workflow tools",
        },
        proofMode: "unit plus live sandbox create/update/delete flows when credentials are present",
        recovery: ["Prefer returned entry IDs; after ambiguous writes, re-list by ID or bounded date range before retrying."],
        intentionalGaps: [],
    },
    {
        id: "work-package",
        userGoal: "Create or reuse clients, projects, tasks, and tags before logging work.",
        sdk: ["client.clients", "client.projects", "client.tasks", "client.tags"],
        cli: ["clk115 clients list", "clk115 clients create", "clk115 projects list", "clk115 projects create", "clk115 tasks list", "clk115 tags list", "clk115 tags create"],
        tsMcp: ["clockify_create_work_package", "clockify_clients_*", "clockify_projects_*", "clockify_tasks_*", "clockify_tags_*"],
        goMcp: ["clockify_create_work_package", "clockify_clients_*", "clockify_projects_*", "clockify_tasks_*", "clockify_tags_*"],
        proof: ["wrapper/docs/resources", "cli/tests", "mcp/tests/workflows.test.ts"],
        surfaceAvailability: {
            sdk: "supported through client, project, task, and tag resources",
            cli: "supported through list/create commands for clients, projects, tasks, and tags",
            tsMcp: "supported through create-work-package workflow plus domain tools",
            goMcp: "supported through matching workflow and domain tools",
        },
        proofMode: "resource docs, CLI tests, and MCP workflow tests",
        recovery: ["Reuse existing objects when receipts report reuse; clean up by explicit IDs or timestamped prefixes."],
        intentionalGaps: [],
    },
    {
        id: "business-workflows",
        userGoal: "Handle invoices, expenses, time off, scheduling, webhooks, and audit logs safely.",
        sdk: ["client.invoices", "client.expenses", "client.timeOff", "client.scheduling", "client.webhooks", "client.auditLogReport"],
        cli: ["clk115 invoices list", "clk115 invoices create", "clk115 expenses list", "clk115 timeoff list", "clk115 timeoff submit", "clk115 scheduling list", "clk115 scheduling create", "clk115 webhooks list", "clk115 webhooks create", "clk115 audit-log search"],
        tsMcp: ["clockify_invoice_client_work", "clockify_record_expense", "clockify_request_time_off", "clockify_schedule_work", "clockify_setup_webhook"],
        goMcp: ["clockify_invoice_client_work", "clockify_record_expense", "clockify_request_time_off", "clockify_schedule_work", "clockify_setup_webhook"],
        proof: ["spec/evidence/discrepancies.md", "mcp/tests/sandbox.test.ts", "../GOCLMCP/docs/api-parity-matrix.md"],
        surfaceAvailability: {
            sdk: "supported through generated resources plus wrapper recovery helpers",
            cli: "supported through list/create/search commands where the CLI exposes the workflow",
            tsMcp: "supported through dry-run and confirmation-token workflow tools",
            goMcp: "supported through matching workflow tools and raw fallback where documented",
        },
        proofMode: "contract evidence, sandbox MCP flows, and GOCLMCP parity docs",
        recovery: ["Use dry_run and confirm_token before high-risk writes; preserve request IDs and discrepancy anchors."],
        intentionalGaps: [],
    },
    {
        id: "demo-and-cleanup",
        userGoal: "Seed deterministic demo objects and remove them by prefix after tests or demos.",
        sdk: ["client.clients", "client.projects", "client.tasks", "client.tags", "client.timeEntries"],
        cli: [],
        tsMcp: ["clockify_demo_seed", "clockify_demo_cleanup"],
        goMcp: ["clockify_demo_seed", "clockify_demo_cleanup"],
        proof: ["mcp/scripts/assert-clean-prefixes.mjs", "../GOCLMCP/docs/live-tests.md"],
        surfaceAvailability: {
            sdk: "supported through underlying resources used by the demo workflow",
            cli: "no dedicated demo workflow command; use normal create/list/delete commands in a sacrificial workspace",
            tsMcp: "supported through dedicated demo seed and cleanup tools",
            goMcp: "supported through matching demo seed and cleanup tools",
        },
        proofMode: "cleanup script plus live-test documentation for sandbox-only proof",
        recovery: ["Use identifiable prefixes and cleanup receipts; never run demo cleanup against a customer workspace."],
        intentionalGaps: ["CLI has no dedicated demo seed/cleanup command; this is intentionally an MCP-first workflow."],
    },
];

const goMcp = goMcpMetadata();

const surface = {
    schemaVersion: 1,
    purpose: "Single metadata surface for SDK, CLI, TypeScript MCP, Go MCP, docs, and gates.",
    sourcePolicy: {
        canonicalOpenApi: "../GOCLMCP/docs/openapi/clockify-openapi.yaml",
        localSnapshot: "spec/corrected/clockify.corrected.openapi.yaml",
        generatedCore: "output/ts-sdk",
        handwrittenSdkLayer: "wrapper/*.ts",
        generatedEditRule: "Do not hand-edit spec/corrected, output/ts-sdk, or wrapper/src.",
    },
    packages: {
        sdk: {
            folder: "wrapper",
            package: wrapperPkg.name,
            version: wrapperPkg.version,
            node: wrapperPkg.engines?.node,
            files: packageFiles(wrapperPkg),
            publicExports: listExports(wrapperPkg),
            prepublishOnly: prepublishGate(wrapperPkg),
            gates: ["npm run type-check", "npm test", "npm run build", "npm run build:smoke", "npm pack --dry-run"],
        },
        cli: {
            folder: "cli",
            package: cliPkg.name,
            version: cliPkg.version,
            node: cliPkg.engines?.node,
            bins: Object.keys(cliPkg.bin ?? {}).sort((a, b) => a.localeCompare(b)),
            files: packageFiles(cliPkg),
            prepublishOnly: prepublishGate(cliPkg),
            gates: ["npm run type-check", "npm test", "npm run build", "npm pack --dry-run"],
        },
        tsMcp: {
            folder: "mcp",
            package: mcpPkg.name,
            version: mcpPkg.version,
            node: mcpPkg.engines?.node,
            bins: Object.keys(mcpPkg.bin ?? {}).sort((a, b) => a.localeCompare(b)),
            files: packageFiles(mcpPkg),
            declaredToolCount: tsMcpToolCounts.total,
            declaredWorkflowToolCount: tsMcpToolCounts.workflow,
            declaredDomainToolCount: tsMcpToolCounts.domain,
            prepublishOnly: prepublishGate(mcpPkg),
            gates: ["npm run type-check", "npm test", "npm run build", "npm pack --dry-run"],
        },
        goMcp: {
            folder: "../GOCLMCP",
            catalog: "../GOCLMCP/docs/tool-catalog.json",
            detectedToolCount: goMcp.detectedToolCount,
            detectedCategoryCounts: goMcp.detectedCategoryCounts,
            gates: ["make openapi-drift", "make catalog-drift", "make selfinspect-drift", "make raw-allowlist-drift", "go test ./internal/tools/..."],
        },
    },
    workflows,
    rootGates: {
        fast: "make perfect-fast",
        full: "make perfect-full",
        live: "make perfect-live",
        productSurfaceDrift: "make product-surface-drift",
        generatorIndependence: "make generator-independence",
        generatorComparison: "make generator-comparison",
        errorDocsDrift: "make error-docs-drift",
        troubleshootingDrift: "make troubleshooting-drift",
        openapiOperationsDrift: "make openapi-operations-drift",
        operationParityDrift: "make operation-parity-drift",
        openapiLint: "make openapi-lint",
        readmeTablesDrift: "make readme-tables-drift",
        changelogDrift: "make changelog-drift",
        docsIndexDrift: "make docs-index-drift",
        performanceBudgets: "make performance-budgets",
        packedConsumerSmoke: "make pack-smoke",
    },
};

function jsonFor(surfaceValue) {
    return `${JSON.stringify(surfaceValue, null, 2)}\n`;
}

function tableCell(values) {
    if (!values || values.length === 0) return "-";
    return values.map((value) => String(value).replaceAll("|", "\\|")).join("<br>");
}

function objectCell(value) {
    if (!value || Object.keys(value).length === 0) return "-";
    return Object.entries(value)
        .map(([key, item]) => `${key}: ${String(item).replaceAll("|", "\\|")}`)
        .join("<br>");
}

function markdownFor(surfaceValue) {
    const lines = [];
    lines.push("<!-- Generated by scripts/generate-product-surface.mjs. Run `make product-surface` after changing package or workflow metadata. -->");
    lines.push("");
    lines.push("# Product Surface Matrix");
    lines.push("");
    lines.push(surfaceValue.purpose);
    lines.push("");
    lines.push("## Source policy");
    lines.push("");
    lines.push("| Surface | Path |");
    lines.push("|---|---|");
    for (const [key, value] of Object.entries(surfaceValue.sourcePolicy)) {
        lines.push(`| ${key} | \`${value}\` |`);
    }
    lines.push("");
    lines.push("## Packages");
    lines.push("");
    lines.push("| Surface | Folder | Package | Version | Runtime | Ship files | Last-resort publish gate | Main gates |");
    lines.push("|---|---|---|---|---|---|---|---|");
    const packages = surfaceValue.packages;
    for (const [key, pkg] of Object.entries(packages)) {
        lines.push(`| ${key} | \`${pkg.folder}\` | ${pkg.package ?? "-"} | ${pkg.version ?? "-"} | ${pkg.node ?? "-"} | ${tableCell(pkg.files)} | ${pkg.prepublishOnly ? `\`${pkg.prepublishOnly}\`` : "-"} | ${tableCell(pkg.gates)} |`);
    }
    lines.push("");
    lines.push("## Workflow parity");
    lines.push("");
    lines.push("| Workflow | User goal | SDK | CLI | TS MCP | Go MCP | Availability | Proof mode | Recovery | Intentional gaps | Proof |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
    for (const workflow of surfaceValue.workflows) {
        lines.push(`| ${workflow.id} | ${workflow.userGoal.replaceAll("|", "\\|")} | ${tableCell(workflow.sdk)} | ${tableCell(workflow.cli)} | ${tableCell(workflow.tsMcp)} | ${tableCell(workflow.goMcp)} | ${objectCell(workflow.surfaceAvailability)} | ${String(workflow.proofMode ?? "-").replaceAll("|", "\\|")} | ${tableCell(workflow.recovery)} | ${tableCell(workflow.intentionalGaps)} | ${tableCell(workflow.proof)} |`);
    }
    lines.push("");
    lines.push("## Root gates");
    lines.push("");
    lines.push("| Gate | Command |");
    lines.push("|---|---|");
    for (const [key, command] of Object.entries(surfaceValue.rootGates)) {
        lines.push(`| ${key} | \`${command}\` |`);
    }
    lines.push("");
    return `${lines.join("\n")}\n`;
}

const expectedJson = jsonFor(surface);
const expectedMd = markdownFor(surface);

if (args.has("--write")) {
    fs.writeFileSync(jsonPath, expectedJson);
    fs.writeFileSync(mdPath, expectedMd);
    console.log("wrote docs/product-surface.json and docs/product-surface.md");
    process.exit(0);
}

if (args.has("--check")) {
    const currentJson = fs.existsSync(jsonPath) ? fs.readFileSync(jsonPath, "utf8") : "";
    const currentMd = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, "utf8") : "";
    const stale = [];
    if (currentJson !== expectedJson) stale.push("docs/product-surface.json");
    if (currentMd !== expectedMd) stale.push("docs/product-surface.md");
    if (stale.length > 0) {
        console.error(`Product surface drift: ${stale.join(", ")}. Run make product-surface.`);
        process.exit(1);
    }
    console.log("product surface is current");
    process.exit(0);
}

process.stdout.write(expectedJson);
