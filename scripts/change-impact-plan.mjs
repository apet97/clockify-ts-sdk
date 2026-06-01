// Planner module: change impact proof plan.
// Invoked via `node scripts/plan.mjs change-impact [--scope <id> | --path <changed-path>]`.
// Does not run Git, npm, Docker, Fern, tests, builds, or Clockify API calls.
// Reads docs/change-impact-contract.json via scripts/plan.mjs.
function patternMatches(pattern, changedPath) {
    if (pattern === changedPath) return true;
    if (pattern.endsWith("/**")) return changedPath.startsWith(pattern.slice(0, -3));
    if (pattern.endsWith("*")) return changedPath.startsWith(pattern.slice(0, -1));
    if (pattern.includes("**")) {
        const [prefix, suffix] = pattern.split("**");
        return changedPath.startsWith(prefix) && changedPath.endsWith(suffix ?? "");
    }
    return false;
}

function findScopes(contract, options) {
    if (options.scope === "list") return [];
    if (options.scope) return contract.scopes.filter((scope) => scope.id === options.scope);
    if (options.changedPath) {
        return contract.scopes.filter((scope) =>
            scope.changedPaths.some((pattern) => patternMatches(pattern, options.changedPath)),
        );
    }
    return contract.scopes.filter((scope) =>
        ["docs-and-contracts", "axioms-contract", "release-readiness"].includes(scope.id),
    );
}

export function buildPlan(contract, options = { scope: null, changedPath: null }) {
    if (options.scope && options.changedPath) {
        throw new Error("Use either --scope or --path, not both");
    }
    const scopes = findScopes(contract, options);
    const missing = options.scope && options.scope !== "list" && scopes.length === 0;
    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        network: "none",
        commandsExecuted: [],
        envValuesCaptured: false,
        reportScope: options.scope ? "scope" : options.changedPath ? "path" : "default",
        input: {
            scope: options.scope,
            changedPath: options.changedPath,
        },
        availableScopes: options.scope === "list" ? contract.scopes.map((scope) => scope.id) : undefined,
        matchedScopes: scopes.map((scope) => ({
            id: scope.id,
            changedPaths: scope.changedPaths,
            requiredTargets: scope.requiredTargets,
            requiredDocs: scope.requiredDocs,
            changelogRequired: scope.changelogRequired,
            notes: scope.notes,
        })),
        ok: !missing,
        warning:
            "This plan is not proof. Run the listed targets and capture receipts before claiming readiness.",
    };
}

export function renderMarkdown(plan) {
    if (plan.availableScopes) {
        return `# Change Impact Scopes\n\n${plan.availableScopes.map((id) => `- \`${id}\``).join("\n")}\n`;
    }

    const lines = ["# Change Impact Proof Plan", ""];
    lines.push("This plan is not proof. It does not run commands.");
    lines.push("");
    if (plan.input.scope) lines.push(`Scope: \`${plan.input.scope}\``);
    if (plan.input.changedPath) lines.push(`Changed path: \`${plan.input.changedPath}\``);
    if (!plan.input.scope && !plan.input.changedPath) {
        lines.push("Default view: docs/contracts, release readiness, and final proof scopes.");
    }
    lines.push("");

    if (plan.matchedScopes.length === 0) {
        lines.push("No matching change scope found.");
        lines.push("");
        lines.push("Run `node scripts/plan.mjs change-impact --scope list` to see available scopes.");
        return `${lines.join("\n")}\n`;
    }

    for (const scope of plan.matchedScopes) {
        lines.push(`## ${scope.id}`);
        lines.push("");
        lines.push(scope.notes);
        lines.push("");
        lines.push("Required targets:");
        for (const target of scope.requiredTargets) lines.push(`- \`make ${target}\``);
        lines.push("");
        lines.push("Required docs:");
        for (const doc of scope.requiredDocs) lines.push(`- \`${doc}\``);
        lines.push("");
        lines.push(`Changelog required: ${scope.changelogRequired ? "yes" : "no"}`);
        lines.push("");
    }
    return `${lines.join("\n")}\n`;
}

