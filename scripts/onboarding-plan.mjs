// Planner module: operator onboarding plan.
// Invoked via `node scripts/plan.mjs onboarding [--goal <sdk|cli|mcp|mock|live|full|support|all>]`.
// Does not run Git, npm, Docker, Fern, tests, builds, or Clockify API calls.
const goals = {
    sdk: {
        title: "SDK user",
        useWhen: "You want to call Clockify from TypeScript or JavaScript code.",
        firstReads: ["AGENTS.md", "wrapper/README.md", "docs/install-personas.md"],
        safeStart: [
            "node scripts/repo-doctor.mjs",
            "cd wrapper",
            "npm ci",
            "npm run sync",
            "npm run build",
        ],
        proofWhenAllowed: ["make sdk-public-api", "make sdk-runtime-contract", "make package-contract", "make wrapper-gates"],
        stopIf: [
            "A fix would hand-edit wrapper/src/**.",
            "A public SDK export is renamed or removed without breaking-change review.",
            "Live credentials are pointed at anything other than a sacrificial sandbox.",
        ],
    },
    cli: {
        title: "CLI user",
        useWhen: "You want terminal commands through clk115 or clockify115.",
        firstReads: ["AGENTS.md", "cli/README.md", "docs/cli-write-safety-policy.md"],
        safeStart: [
            "node scripts/repo-doctor.mjs",
            "cd wrapper && npm ci && npm run sync && npm run build",
            "cd ../cli",
            "npm ci",
            "npm run build",
        ],
        proofWhenAllowed: ["make cli-contract", "make cli-write-safety", "make package-contract", "make cli-gates"],
        stopIf: [
            "A command would become interactive-only or lose JSON receipt behavior.",
            "A write/delete command lacks an explicit target or receipt.",
            "A command needs real token values in an issue, support bundle, or log.",
        ],
    },
    mcp: {
        title: "MCP user",
        useWhen: "You want agent workflows through the TypeScript MCP server.",
        firstReads: ["AGENTS.md", "mcp/README.md", "docs/mcp-agent-ux-policy.md", "docs/mcp-write-safety-policy.md"],
        safeStart: [
            "node scripts/repo-doctor.mjs",
            "cd wrapper && npm ci && npm run sync && npm run build",
            "cd ../mcp",
            "npm ci",
            "npm run build",
        ],
        proofWhenAllowed: ["make mcp-contract", "make mcp-agent-ux", "make mcp-write-safety", "make mcp-gates"],
        stopIf: [
            "A destructive tool can run without dry_run or confirmation where required.",
            "A tool returns unstructured text instead of the standard receipt envelope.",
            "Agent instructions encourage magical recovery instead of explicit next steps.",
        ],
    },
    mock: {
        title: "Mock/replay proof",
        useWhen: "You need deterministic behavior without Clockify credentials.",
        firstReads: ["docs/quickstart-receipt.md", "docs/mock-clockify-contract.json", "docs/acceptance-scenarios.md"],
        safeStart: ["node scripts/repo-doctor.mjs", "make mock-clockify"],
        proofWhenAllowed: ["make mock-contract", "make acceptance-scenarios", "make examples-matrix"],
        stopIf: [
            "A mock result is being described as live Clockify proof.",
            "A test needs customer data instead of synthetic objects.",
            "A fixture would include raw API keys, workspace IDs, invoice lines, or webhook secrets.",
        ],
    },
    live: {
        title: "Live sandbox proof",
        useWhen: "You need to prove real Clockify behavior in a sacrificial sandbox.",
        firstReads: ["docs/live-tests.md", "docs/test-data-lifecycle-policy.md"],
        safeStart: [
            "Confirm CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID point to a sacrificial sandbox.",
            "Run mock proof first when possible.",
            "Run the narrowest live package command before broad live proof.",
        ],
        proofWhenAllowed: ["make live-safety", "make test-data-lifecycle", "make perfect-live"],
        stopIf: [
            "The workspace might be a customer or production workspace.",
            "Create/delete pairing or cleanup prefixes are unclear.",
            "Leftover counts are missing from the final live receipt.",
        ],
    },
    full: {
        title: "Full product readiness",
        useWhen: "You need full SDK/CLI/MCP/OpenAPI readiness evidence.",
        firstReads: [
            "docs/quality-gates.md",
            "docs/risk-register.md",
        ],
        safeStart: [
            "node scripts/repo-doctor.mjs",
            "make enterprise-audit",
            "make perfect-fast",
            "make perfect-full",
            "node scripts/create-support-bundle.mjs --output /tmp/clockify-support-bundle.json",
        ],
        proofWhenAllowed: [
            "make performance-receipt",
            "make perfect-live",
        ],
        stopIf: [
            "The support bundle readinessContext drops riskRoutingSummary.",
            "Performance budgets are still provisional.",
            "Live proof is deferred; deferral is draft-only and must be replaced before acceptance.",
            "Any final receipt success section lacks Exit status: 0 and Result: passed evidence.",
            "Live proof is neither completed nor explicitly deferred with a concrete reason.",
            "docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md still exists during final audit.",
        ],
    },
    support: {
        title: "Support escalation",
        useWhen: "You need a safe support packet without leaking secrets.",
        firstReads: [
            "docs/support-runbook.md",
            "docs/quickstart-receipt.md",
            "docs/workflow-cookbook.md",
            "docs/issue-intake-policy.md",
            "docs/data-handling-policy.md",
        ],
        safeStart: [
            "node scripts/repo-doctor.mjs",
            "node scripts/plan.mjs workflow --workflow first-run-support",
            "node scripts/create-support-bundle.mjs --output /tmp/clockify-support-bundle.json",
            "Review /tmp/clockify-support-bundle.json before attaching or pasting anything.",
        ],
        proofWhenAllowed: [
            "make quickstart-receipt",
            "make diagnostics",
            "make support-bundle",
            "make workflow-cookbook",
            "make acceptance-scenarios",
            "make issue-intake",
            "make receipt-examples",
        ],
        stopIf: [
            "The first-run-support workflow loses safeCommandHints or no-network posture.",
            "readinessContext is missing finalBlockingSignalIds, blockingSignalIds, riskRoutingSummary, or orderedProofChainCoverage.",
            "The support packet contains env values, tokens, workspace IDs, raw logs, probe captures, cookies, shell history, or .env files.",
            "The issue is security-sensitive and belongs in a private advisory.",
            "The report needs customer payloads instead of sanitized receipts.",
        ],
    },
};

function selectedGoals(goal) {
    const ids = goal === "all" ? Object.keys(goals) : [goal];
    return ids.map((id) => ({ id, ...goals[id] }));
}

export function renderMarkdown(plan) {
    const lines = ["# Operator Onboarding Plan", ""];
    lines.push(`Generated mode: ${plan.goal}`);
    lines.push("");
    lines.push("Safety: no commands were executed; this is a static plan.");
    lines.push("");

    for (const goal of plan.goals) {
        lines.push(`## ${goal.title}`);
        lines.push("");
        lines.push(`Use when: ${goal.useWhen}`);
        lines.push("");
        lines.push("First reads:");
        for (const item of goal.firstReads) lines.push(`- \`${item}\``);
        lines.push("");
        lines.push("Safe start:");
        for (const item of goal.safeStart) lines.push(`- \`${item}\``);
        lines.push("");
        lines.push("Proof when validation is allowed:");
        for (const item of goal.proofWhenAllowed) lines.push(`- \`${item}\``);
        lines.push("");
        lines.push("Stop if:");
        for (const item of goal.stopIf) lines.push(`- ${item}`);
        lines.push("");
    }
    return `${lines.join("\n")}\n`;
}

export function buildPlan(goal = "all") {
    const value = goal ?? "all";
    if (![...Object.keys(goals), "all"].includes(value)) {
        throw new Error(`Unknown goal: ${value}`);
    }
    return {
        schemaVersion: 1,
        goal: value,
        network: "none",
        commandsExecuted: [],
        envValuesCaptured: false,
        secretsCaptured: false,
        workspaceIdsCaptured: false,
        goals: selectedGoals(value),
    };
}
