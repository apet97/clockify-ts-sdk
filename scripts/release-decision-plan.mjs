// Planner module: release workflow decision plan.
// Invoked via `node scripts/plan.mjs release-decision [--decision <id|all>]`.
// Does not run Git, npm, Docker, Fern, tests, builds, or Clockify API calls.
const decisions = [
    {
        id: "local-tarball-handoff",
        title: "Local tarball handoff, no npm publish",
        defaultSafe: true,
        explicitMaintainerApprovalRequired: false,
        when: "Use when a consumer needs an installable artifact but the repo is not publishing to npm.",
        requiredEvidence: [
            "Final proof receipt or handoff-specific command receipt.",
            "Packed consumer smoke for SDK, CLI, and MCP.",
            "Support bundle and support runbook when the recipient needs escalation data.",
        ],
        proofTargets: [
            "make perfect-full",
            "make pack-smoke",
            "make release-readiness",
            "make final-proof-receipt-check when this is final readiness",
        ],
        allowedActions: [
            "Attach or hand off local tarball paths after proof.",
            "Keep npm publication disabled.",
            "Document non-blocking residual risks in the support packet; close final-readiness blockers before the final proof receipt.",
        ],
        forbiddenActions: [
            "Do not run npm publish.",
            "Do not create a release tag just to distribute tarballs.",
            "Do not modify release workflow triggers.",
        ],
    },
    {
        id: "tag-github-release-only",
        title: "Tag or GitHub release without npm publication",
        defaultSafe: false,
        explicitMaintainerApprovalRequired: true,
        when: "Use only if maintainers want a source/archive release marker while npm remains off.",
        requiredEvidence: [
            "Written maintainer approval for tag/release scope.",
            "Proof that tag automation will not publish npm packages.",
            "Release readiness checklist with publish/tag approval recorded.",
        ],
        proofTargets: [
            "make release-readiness",
            "make ci-contract",
            "make supply-chain",
            "make perfect-full",
        ],
        allowedActions: [
            "Prepare a tag/release plan after approval.",
            "Keep package artifacts separate from npm publishing.",
            "Record the exact approved workflow in a decision record.",
        ],
        forbiddenActions: [
            "Do not push tags while legacy npm release automation can fire unexpectedly.",
            "Do not rely on local package readiness as publish permission.",
            "Do not bypass CI or tag-vs-version checks.",
        ],
    },
    {
        id: "npm-via-ci",
        title: "Intentional npm publication through reviewed CI",
        defaultSafe: false,
        explicitMaintainerApprovalRequired: true,
        when: "Use only after maintainers explicitly decide to publish one or more packages.",
        requiredEvidence: [
            "Maintainer approval naming package, version, tag, provenance, and rollback owner.",
            "Reviewed release workflow update or confirmation that the existing workflow is still correct.",
            "Post-publish smoke install plan.",
            "Security, supply-chain, support, and final-proof receipts.",
        ],
        proofTargets: [
            "make perfect-full",
            "make pack-smoke",
            "make release-support-contract",
            "make supply-chain",
            "make ci-contract",
            "make final-proof-receipt-check",
        ],
        allowedActions: [
            "Update release workflow only in a dedicated approved change.",
            "Publish through CI with provenance after proof gates pass.",
            "Run post-publish smoke install and record package versions.",
        ],
        forbiddenActions: [
            "Do not run npm publish from a developer laptop.",
            "Do not alter auth, NPM_TOKEN, provenance, or workflow triggers inside routine SDK polish.",
            "Do not publish if package names, changelogs, tarball contents, or support policy disagree.",
        ],
    },
    {
        id: "retire-legacy-workflow",
        title: "Retire or pause the legacy tag-triggered npm workflow",
        defaultSafe: false,
        explicitMaintainerApprovalRequired: true,
        when: "Use if maintainers decide the legacy release workflow is unsafe or inconsistent with no-default-publish policy.",
        requiredEvidence: [
            "Maintainer approval to change CI/CD release behavior.",
            "Risk-register update closing legacy-release-workflow-needs-maintainer-decision.",
            "Replacement handoff or publish path documented before removal.",
        ],
        proofTargets: [
            "make ci-contract",
            "make release-support-contract",
            "make release-readiness",
            "make risk-register",
            "make perfect-fast",
        ],
        allowedActions: [
            "Pause, remove, or replace release automation in a dedicated approved change.",
            "Update CI policy, release support policy, risk register, and operator docs together.",
            "Record why the chosen replacement is safer.",
        ],
        forbiddenActions: [
            "Do not delete release automation as collateral cleanup.",
            "Do not leave package publication paths undocumented.",
            "Do not mark the risk closed until the replacement path and proof are in place.",
        ],
    },
];

const validDecisions = new Set([...decisions.map((decision) => decision.id), "all"]);
const readinessContextChecklist = {
    workflowCommand: "node scripts/plan.mjs workflow --workflow first-run-support",
    sourceCommand: "node scripts/create-support-bundle.mjs --output /tmp/clockify-support-bundle.json",
    requiredFields: [
        "safeCommandHints",
        "readinessContext",
        "finalBlockingSignalIds",
        "blockingSignalIds",
        "riskRoutingSummary",
        "orderedProofChainCoverage",
    ],
    rule:
        "Review the first-run support workflow and support-bundle readinessContext before tag, npm, CI/CD, release-workflow, or handoff decisions.",
};

export function buildReport(options = { decision: "all" }) {
    const decision = options.decision ?? "all";
    if (!validDecisions.has(decision)) {
        throw new Error(`Unknown decision: ${decision}`);
    }
    const selected = decision === "all" ? decisions : decisions.filter((entry) => entry.id === decision);

    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        network: "none",
        commandsExecuted: [],
        envValuesCaptured: false,
        reportScope: "release-decision-plan",
        selectedDecision: decision,
        riskId: "legacy-release-workflow-needs-maintainer-decision",
        warning:
            "This plan is not proof. It does not run Git, npm, Docker, Fern, tests, builds, Clockify API calls, npm publish, or CI/CD changes.",
        publishPermission: "none",
        ciCdChangePermission: "none",
        readinessContextChecklist,
        decisions: selected,
        next: [
            "Choose the least powerful release path that satisfies the real need.",
            "Review support-bundle readinessContext before treating any release decision as safe.",
            "Use local tarball handoff by default when npm publication is not explicitly approved.",
            "Get written maintainer approval before tags, npm publication, or CI/CD release workflow changes.",
            "Run the listed proof targets and record receipts before claiming release readiness.",
        ],
    };
}

function addCommandList(lines, label, items) {
    lines.push(`${label}:`);
    for (const item of items) lines.push(`- \`${item}\``);
    lines.push("");
}

function addTextList(lines, label, items) {
    lines.push(`${label}:`);
    for (const item of items) lines.push(`- ${item}`);
    lines.push("");
}

export function renderMarkdown(report) {
    const lines = ["# Release Decision Plan", ""];
    lines.push("This plan is not release proof and does not grant publish permission.");
    lines.push("");
    lines.push(`Generated at: ${report.generatedAt}`);
    lines.push(`Selected decision: \`${report.selectedDecision}\``);
    lines.push(`Tracked risk: \`${report.riskId}\``);
    lines.push(`Publish permission: ${report.publishPermission}`);
    lines.push(`CI/CD change permission: ${report.ciCdChangePermission}`);
    lines.push("");
    lines.push("## Readiness context checklist");
    lines.push("");
    lines.push(`Workflow command: \`${report.readinessContextChecklist.workflowCommand}\``);
    lines.push(`Source command: \`${report.readinessContextChecklist.sourceCommand}\``);
    lines.push(report.readinessContextChecklist.rule);
    lines.push("");
    addTextList(lines, "Required readinessContext fields", report.readinessContextChecklist.requiredFields);
    for (const decision of report.decisions) {
        lines.push(`## ${decision.title}`);
        lines.push("");
        lines.push(`Decision id: \`${decision.id}\``);
        lines.push(`Default safe path: ${decision.defaultSafe ? "yes" : "no"}`);
        lines.push(
            `Explicit maintainer approval required: ${
                decision.explicitMaintainerApprovalRequired ? "yes" : "no"
            }`,
        );
        lines.push("");
        lines.push(decision.when);
        lines.push("");
        addTextList(lines, "Required evidence", decision.requiredEvidence);
        addCommandList(lines, "Proof targets", decision.proofTargets);
        addTextList(lines, "Allowed actions", decision.allowedActions);
        addTextList(lines, "Forbidden actions", decision.forbiddenActions);
    }
    lines.push("## Next");
    lines.push("");
    for (const item of report.next) lines.push(`- ${item}`);
    return `${lines.join("\n")}\n`;
}

