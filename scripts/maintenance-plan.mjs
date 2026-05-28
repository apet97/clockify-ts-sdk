// Planner module: maintenance plan for SDK/CLI/MCP/OpenAPI upkeep.
// Invoked via `node scripts/plan.mjs maintenance [--cadence <id|all>]`.
// Does not run Git, npm, Docker, Fern, tests, builds, or Clockify API calls.
const cadences = [
    {
        id: "weekly",
        title: "Weekly active-maintenance sweep",
        when: "Use when code, docs, generated metadata, or operator guidance moved during the week.",
        safeStart: [
            "node scripts/repo-doctor.mjs",
            "node scripts/plan.mjs contract-inventory",
            "node scripts/plan.mjs risk-status --status all",
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
            "node scripts/plan.mjs change-impact --scope docs-and-contracts",
            "node scripts/plan.mjs risk-status --status all",
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
            "node scripts/plan.mjs change-impact --path wrapper/package.json",
            "node scripts/plan.mjs change-impact --path cli/package.json",
            "node scripts/plan.mjs change-impact --path mcp/package.json",
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
            "node scripts/plan.mjs change-impact --scope openapi-truth",
            "node scripts/plan.mjs change-impact --scope generated-core",
            "node scripts/plan.mjs risk-status --status all",
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
            "node scripts/plan.mjs change-impact --scope openapi-truth",
            "node scripts/plan.mjs contract-inventory",
            "node scripts/plan.mjs risk-status --status open",
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
        title: "Release or handoff rehearsal",
        when: "Use before claiming a package or handoff is ready.",
        safeStart: [
            "node scripts/plan.mjs release-decision --decision all",
            "node scripts/plan.mjs risk-status --status all",
            "node scripts/plan.mjs workflow --workflow first-run-support",
            "node scripts/create-support-bundle.mjs --output /tmp/clockify-support-bundle.json",
        ],
        proofTargets: [
            "make enterprise-audit",
            "make perfect-fast",
            "make perfect-full",
            "make performance-receipt",
            "make perfect-live",
        ],
        docs: [
            "docs/release-readiness-checklist.md",
            "docs/risk-register.md",
        ],
        receipts: [
            "Support bundle readinessContext preserves riskRoutingSummary and orderedProofChainCoverage.",
            "First-run support workflow preserves safeCommandHints before release or handoff claims.",
            "make perfect-live emits a JSON cleanup receipt with zero leftovers.",
        ],
        stopConditions: [
            "readinessContext is missing riskRoutingSummary.",
            "Performance budgets remain provisional after required baseline receipts.",
            "make perfect-live leaves sandbox objects behind.",
            "npm publish, release workflow, or auth behavior would change without maintainer approval.",
        ],
    },
    {
        id: "rollback",
        title: "Rollback and recovery plan",
        when: "Use after a dependency, generator, package, CLI, MCP, docs, live, or final-proof attempt fails.",
        safeStart: [
            "node scripts/plan.mjs change-impact --scope docs-and-contracts",
            "node scripts/plan.mjs workflow --workflow first-run-support",
            "node scripts/create-support-bundle.mjs --output /tmp/clockify-support-bundle.json",
            "node scripts/plan.mjs risk-status --status all",
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

export function buildReport(options = { cadence: "all" }) {
    const cadence = options.cadence ?? "all";
    if (!validCadences.has(cadence)) {
        throw new Error(`Unknown cadence: ${cadence}`);
    }
    const selected = cadence === "all" ? cadences : cadences.filter((entry) => entry.id === cadence);

    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        network: "none",
        commandsExecuted: [],
        envValuesCaptured: false,
        reportScope: "maintenance-plan",
        selectedCadence: cadence,
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

export function renderMarkdown(report) {
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
