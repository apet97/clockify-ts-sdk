#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");

function usage() {
    return [
        "Usage: node scripts/change-impact-plan.mjs [--scope <id> | --path <changed-path>] [--format <markdown|json>]",
        "",
        "Prints a no-network proof plan from docs/change-impact-contract.json.",
        "Does not run Git, npm, Docker, Fern, tests, builds, or Clockify API calls.",
        "Use --scope list to print available scope ids.",
    ].join("\n");
}

function parseArgs(argv) {
    const options = { scope: null, changedPath: null, format: "markdown" };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--help" || arg === "-h") {
            console.log(usage());
            process.exit(0);
        }
        if (arg === "--scope") {
            options.scope = argv[i + 1] ?? "";
            i += 1;
            continue;
        }
        if (arg === "--path") {
            options.changedPath = argv[i + 1] ?? "";
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
    if (options.scope && options.changedPath) throw new Error("Use either --scope or --path, not both");
    if (!["markdown", "json"].includes(options.format)) throw new Error(`Unknown format: ${options.format}`);
    return options;
}

async function loadContract() {
    return JSON.parse(await readFile(path.join(root, "docs/change-impact-contract.json"), "utf8"));
}

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
        ["docs-and-contracts", "axioms-contract", "final-proof", "release-readiness"].includes(scope.id),
    );
}

export function buildPlan(contract, options = { scope: null, changedPath: null }) {
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

function renderMarkdown(plan) {
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
        lines.push("Run `node scripts/change-impact-plan.mjs --scope list` to see available scopes.");
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

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    const contract = await loadContract();
    const plan = buildPlan(contract, options);
    if (options.format === "json") {
        console.log(JSON.stringify(plan, null, 2));
    } else {
        console.log(renderMarkdown(plan));
    }
    if (!plan.ok) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        console.error(usage());
        process.exit(2);
    });
}
