#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

const cadences = [
    {
        id: "weekly",
        title: "Weekly active-maintenance sweep",
        when: "Use when code, docs, generated metadata, or operator guidance moved during the week.",
        safeStart: [
            "node scripts/repo-doctor.mjs",
            "node scripts/contract-inventory-report.mjs",
            "node scripts/risk-status-report.mjs --status all",
        ],
        proofTargets: [
            "make product-surface",
            "make readme-tables",
            "make troubleshooting",
            "make operation-parity",
            "make risk-register",
            "make perfect-fast",
        ],
        docs: [
            "docs/product-surface.md",
            "docs/operation-parity.md",
            "docs/troubleshooting.md",
            "docs/risk-register.md",
            "docs/quality-gates.md",
        ],
        receipts: [
            "Generated-surface diffs are intentional.",
            "Risk-register changes explain any open, provisional, or accepted state.",
        ],
        stopConditions: [
            "A generated path changed without an upstream/generator reason.",
            "A risk is open but has no owner, closure gate, or evidence path.",
        ],
    },
    {
        id: "monthly",
        title: "Monthly dependency, runtime, and drift hygiene",
        when: "Use for scheduled dependency-pin, runtime-floor, generator-portability, mock, and budget review.",
        safeStart: [
            "node scripts/change-impact-plan.mjs --scope docs-and-contracts",
            "node scripts/risk-status-report.mjs --status all",
            "node scripts/release-readiness-report.mjs",
        ],
        proofTargets: [
            "make dependency-boundary",
            "make dependency-license",
            "make runtime-support",
            "make generator-config",
            "make generator-portability",
            "make mock-contract",
            "make performance-budgets",
            "make risk-register",
        ],
        docs: [
            "docs/dependency-policy.md",
            "docs/dependency-license-policy.md",
            "docs/runtime-support.json",
            "docs/generator-portability-plan.md",
            "docs/performance-budgets.json",
            "docs/risk-register.md",
        ],
        receipts: [
            "Dependency changes state runtime vs dev impact.",
            "Routine maintenance may leave budgets provisional, but final readiness requires measured tightening.",
        ],
        stopConditions: [
            "A new runtime dependency lacks purpose and license evidence.",
            "A runtime floor changes without package/readme/migration alignment.",
        ],
    },
    {
        id: "dependency",
        title: "Dependency update plan",
        when: "Use before changing package manifests, lockfiles, engines, or tooling dependencies.",
        safeStart: [
            "node scripts/change-impact-plan.mjs --path wrapper/package.json",
            "node scripts/change-impact-plan.mjs --path cli/package.json",
            "node scripts/change-impact-plan.mjs --path mcp/package.json",
        ],
        proofTargets: [
            "make dependency-boundary",
            "make dependency-license",
            "make runtime-support",
            "make package-contract",
            "make supply-chain",
            "make change-impact",
        ],
        docs: [
            "docs/dependency-policy.md",
            "docs/dependency-license-policy.md",
            "docs/dependency-boundary.json",
            "docs/package-contract.json",
            "docs/supply-chain-policy.md",
        ],
        receipts: [
            "Lockfile changes are package-local.",
            "Changelog entries exist when install, runtime, command, export, or behavior changes.",
        ],
        stopConditions: [
            "The change pulls generated-core internals into product code.",
            "The update changes auth, CI/CD, publish, or release settings without explicit approval.",
        ],
    },
    {
        id: "generator",
        title: "Fern and OpenAPI generator bump plan",
        when: "Use before changing Fern CLI, Fern generator image, GOCLMCP generator data, or OpenAPI source shape.",
        safeStart: [
            "node scripts/change-impact-plan.mjs --scope openapi-truth",
            "node scripts/change-impact-plan.mjs --scope generated-core",
            "node scripts/risk-status-report.mjs --status all",
        ],
        proofTargets: [
            "cd ../GOCLMCP && make gen-openapi",
            "cd ../GOCLMCP && make openapi-drift catalog-drift selfinspect-drift raw-allowlist-drift",
            "cd ../GOCLMCP && go test ./internal/tools/...",
            "cd spec/fern && fern check --warnings --from-openapi",
            "cd spec/fern && fern generate --group ts --local --force",
            "make openapi-operations",
            "make operation-parity",
            "make openapi-lint",
            "make schema-quality",
            "make generator-config",
            "make generator-comparison",
            "make generator-portability",
            "make perfect-full",
        ],
        docs: [
            "AGENTS.md",
            "docs/generator-portability-plan.md",
            "docs/generator-config-contract.json",
            "docs/openapi-operations.md",
            "docs/operation-parity.md",
            "spec/evidence/discrepancies.md",
        ],
        receipts: [
            "Discrepancy entries explain every live/spec divergence.",
            "Generated output is reproduced from canonical sources, not hand-edited.",
        ],
        stopConditions: [
            "The proposed edit touches GOCLMCP merge/dedup logic without explicit approval.",
            "Fern output changes but generator/source evidence is missing.",
        ],
    },
    {
        id: "drift",
        title: "Clockify API drift response plan",
        when: "Use when live Clockify behavior, official docs, GOCLMCP output, TS SDK, CLI, MCP, or README claims disagree.",
        safeStart: [
            "node scripts/change-impact-plan.mjs --scope openapi-truth",
            "node scripts/contract-inventory-report.mjs",
            "node scripts/risk-status-report.mjs --status open",
        ],
        proofTargets: [
            "make openapi-evidence",
            "make upstream-drift",
            "make openapi-operations",
            "make operation-parity",
            "make readme-tables",
            "make workflow-cookbook",
            "make acceptance-scenarios",
            "make perfect-full",
        ],
        docs: [
            "docs/openapi-evidence-policy.md",
            "docs/upstream-drift-policy.md",
            "spec/evidence/discrepancies.md",
            "docs/openapi-operations.md",
            "docs/operation-parity.md",
            "docs/workflow-cookbook.md",
        ],
        receipts: [
            "Raw probe files stay ignored under spec/evidence/probes/.",
            "Sanitized findings are promoted into the discrepancy ledger.",
        ],
        stopConditions: [
            "A live probe used a customer workspace instead of the sacrificial sandbox.",
            "The workaround hides unsupported behavior instead of documenting recovery.",
        ],
    },
    {
        id: "release",
        title: "Release, handoff, or final-readiness rehearsal",
        when: "Use before claiming a package, handoff, tag, or final enterprise hardening goal is ready.",
        safeStart: [
            "node scripts/release-readiness-report.mjs",
            "node scripts/enterprise-goal-status.mjs",
            "node scripts/risk-status-report.mjs --status all",
            "node scripts/workflow-plan.mjs --workflow first-run-support",
            "node scripts/create-support-bundle.mjs --output /tmp/clockify-support-bundle.json",
        ],
        proofTargets: [
            "make enterprise-audit",
            "make perfect-fast",
            "make perfect-full",
            "make performance-receipt",
            "LIVE=1 make final-proof-draft or DEFER_LIVE_REASON=\"...\" make final-proof-draft",
            "make final-proof-receipt-check",
            "make final-proof-final",
        ],
        docs: [
            "docs/release-readiness-checklist.md",
            "docs/final-proof-runbook.md",
            "docs/final-proof-receipt.template.md",
            "docs/final-proof-receipt.md",
            "docs/risk-register.md",
        ],
        receipts: [
            "Final proof receipt is filled from real command output.",
            "Support bundle readinessContext preserves finalBlockingSignalIds, blockingSignalIds, riskRoutingSummary, and orderedProofChainCoverage.",
            "First-run support workflow preserves safeCommandHints before release or handoff claims.",
            "Temporary context is removed after evidence capture and receipt completion, immediately before final-proof-final.",
        ],
        stopConditions: [
            "readinessContext is missing finalBlockingSignalIds, blockingSignalIds, riskRoutingSummary, or orderedProofChainCoverage.",
            "The final receipt is copied from the template without evidence.",
            "Performance budgets remain provisional after required baseline receipts.",
            "Live proof is deferred; deferral is draft-only and must be replaced before final-proof-final.",
            "npm publish, release workflow, or auth behavior would change without maintainer approval.",
        ],
    },
    {
        id: "rollback",
        title: "Rollback and recovery plan",
        when: "Use after a dependency, generator, package, CLI, MCP, docs, live, or final-proof attempt fails.",
        safeStart: [
            "node scripts/change-impact-plan.mjs --scope docs-and-contracts",
            "node scripts/workflow-plan.mjs --workflow first-run-support",
            "node scripts/create-support-bundle.mjs --output /tmp/clockify-support-bundle.json",
            "node scripts/risk-status-report.mjs --status all",
        ],
        proofTargets: [
            "make change-impact",
            "make risk-register",
            "Run the narrow failed target again after the rollback.",
        ],
        docs: [
            "docs/maintenance-playbook.md",
            "docs/support-runbook.md",
            "docs/risk-register.md",
            "docs/final-proof-receipt.md when rollback happens during final proof",
        ],
        receipts: [
            "Rollback scope names only the change being undone.",
            "Failure output is captured in a support bundle or final-proof receipt when relevant.",
            "Support bundle readinessContext is kept with blocker, risk-routing, and ordered proof-chain summaries.",
        ],
        stopConditions: [
            "The rollback support bundle is missing readinessContext.",
            "The first-run-support workflow loses safeCommandHints before rollback handoff.",
            "Rollback would reset unrelated user work.",
            "The previous pin, contract value, or generated metadata cannot be identified.",
        ],
    },
];

const validCadences = new Set([...cadences.map((cadence) => cadence.id), "all"]);

function usage() {
    return [
        "Usage: node scripts/maintenance-plan.mjs [--cadence <weekly|monthly|dependency|generator|drift|release|rollback|all>] [--format <markdown|json>]",
        "",
        "Prints a no-network maintenance plan for SDK/CLI/MCP/OpenAPI upkeep.",
        "Does not run Git, npm, Docker, Fern, tests, builds, or Clockify API calls.",
        "This plan is not proof; run the listed targets and capture receipts before claiming readiness.",
    ].join("\n");
}

function parseArgs(argv) {
    const options = { cadence: "all", format: "markdown" };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--help" || arg === "-h") {
            console.log(usage());
            process.exit(0);
        }
        if (arg === "--cadence") {
            options.cadence = argv[i + 1] ?? "";
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
    if (!validCadences.has(options.cadence)) {
        throw new Error(`Unknown cadence: ${options.cadence}`);
    }
    if (!["markdown", "json"].includes(options.format)) {
        throw new Error(`Unknown format: ${options.format}`);
    }
    return options;
}

export function buildReport(options = { cadence: "all" }) {
    const selected =
        options.cadence === "all"
            ? cadences
            : cadences.filter((cadence) => cadence.id === options.cadence);

    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        network: "none",
        commandsExecuted: [],
        envValuesCaptured: false,
        reportScope: "maintenance-plan",
        selectedCadence: options.cadence,
        warning:
            "This plan is not proof. It does not run Git, npm, Docker, Fern, tests, builds, or Clockify API calls.",
        cadences: selected,
        next: [
            "Choose the smallest matching plan.",
            "Run the safe-start helper commands first if you need orientation.",
            "Run the listed proof targets only when validation is allowed.",
            "Capture receipts before claiming release, handoff, or final readiness.",
        ],
    };
}

function renderList(lines, label, items) {
    lines.push(`${label}:`);
    for (const item of items) lines.push(`- \`${item}\``);
    lines.push("");
}

function renderTextList(lines, label, items) {
    lines.push(`${label}:`);
    for (const item of items) lines.push(`- ${item}`);
    lines.push("");
}

function renderMarkdown(report) {
    const lines = ["# Maintenance Plan", ""];
    lines.push("This plan is not proof. It does not run commands.");
    lines.push("");
    lines.push(`Generated at: ${report.generatedAt}`);
    lines.push(`Selected cadence: \`${report.selectedCadence}\``);
    lines.push("");
    for (const cadence of report.cadences) {
        lines.push(`## ${cadence.title}`);
        lines.push("");
        lines.push(`Cadence id: \`${cadence.id}\``);
        lines.push("");
        lines.push(cadence.when);
        lines.push("");
        renderList(lines, "Safe-start helpers", cadence.safeStart);
        renderList(lines, "Proof targets", cadence.proofTargets);
        renderList(lines, "Docs to inspect or update", cadence.docs);
        renderTextList(lines, "Receipts to leave", cadence.receipts);
        renderTextList(lines, "Stop conditions", cadence.stopConditions);
    }
    lines.push("## Next");
    lines.push("");
    for (const item of report.next) lines.push(`- ${item}`);
    return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    const report = buildReport(options);
    if (options.format === "json") {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log(renderMarkdown(report));
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
