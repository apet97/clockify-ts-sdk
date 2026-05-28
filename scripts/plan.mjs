#!/usr/bin/env node
// plan: single entry for the no-network planner/report scripts.
// Dispatches to a topic-specific module that exports buildReport (or buildPlan)
// and renderMarkdown. Handles --format markdown|json and topic-specific filters.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");

const TOPICS = {
    acceptance: { module: "./acceptance-plan.mjs", optionKey: "scenario", defaultValue: "all" },
    "change-impact": { module: "./change-impact-plan.mjs", optionKeys: ["scope", "path"] },
    examples: { module: "./examples-plan.mjs", optionKey: "example", defaultValue: "all" },
    maintenance: { module: "./maintenance-plan.mjs", optionKey: "cadence", defaultValue: "all" },
    onboarding: { module: "./onboarding-plan.mjs", optionKey: "goal", defaultValue: "all" },
    workflow: { module: "./workflow-plan.mjs", optionKey: "workflow", defaultValue: "all" },
    "performance-calibration": { module: "./performance-calibration-plan.mjs" },
    "release-decision": { module: "./release-decision-plan.mjs", optionKey: "decision", defaultValue: "all" },
    "contract-inventory": { module: "./contract-inventory-report.mjs" },
    "risk-status": { module: "./risk-status-report.mjs", optionKey: "status", defaultValue: "all" },
};

function usage() {
    return [
        "Usage: node scripts/plan.mjs <topic> [--format markdown|json] [--<key> <value>]",
        "",
        `Topics: ${Object.keys(TOPICS).join(", ")}`,
        "",
        "Per-topic option keys:",
        ...Object.entries(TOPICS).map(([name, config]) => {
            const keys = config.optionKeys ?? (config.optionKey ? [config.optionKey] : []);
            return `  ${name}: ${keys.length ? keys.map((k) => `--${k}`).join(", ") : "(no filters)"}`;
        }),
    ].join("\n");
}

function parseArgs(argv) {
    const options = { format: "markdown" };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--help" || arg === "-h") {
            console.log(usage());
            process.exit(0);
        }
        if (arg === "--format") {
            options.format = argv[i + 1] ?? "";
            i += 1;
            continue;
        }
        if (arg.startsWith("--")) {
            const key = arg.slice(2);
            options[key] = argv[i + 1] ?? "";
            i += 1;
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
    if (!["markdown", "json"].includes(options.format)) {
        throw new Error(`Unknown format: ${options.format}`);
    }
    return options;
}

async function readJson(relPath) {
    return JSON.parse(await readFile(path.join(root, relPath), "utf8"));
}

async function callBuilder(planner, topic, config, options) {
    // Topic-specific argument shapes:
    if (topic === "change-impact") {
        const contract = await readJson("docs/change-impact-contract.json");
        return planner.buildPlan(contract, { scope: options.scope ?? null, changedPath: options.path ?? null });
    }
    if (topic === "onboarding") {
        return planner.buildPlan(options.goal ?? "all");
    }
    const builder = planner.buildReport ?? planner.buildPlan;
    if (!builder) throw new Error(`Planner ${topic} exports no buildReport/buildPlan`);
    const callOptions = { ...options };
    if (config.optionKey && callOptions[config.optionKey] == null) {
        callOptions[config.optionKey] = config.defaultValue;
    }
    return await builder(callOptions);
}

async function main() {
    const argv = process.argv.slice(2);
    const [topic, ...rest] = argv;
    if (!topic) {
        console.error(usage());
        process.exit(2);
    }
    const config = TOPICS[topic];
    if (!config) {
        console.error(`Unknown topic: ${topic}\n\n${usage()}`);
        process.exit(2);
    }
    const options = parseArgs(rest);
    const planner = await import(config.module);
    const report = await callBuilder(planner, topic, config, options);
    if (options.format === "json") {
        console.log(JSON.stringify(report, null, 2));
        return;
    }
    if (typeof planner.renderMarkdown !== "function") {
        throw new Error(`Planner ${topic} does not export renderMarkdown`);
    }
    console.log(planner.renderMarkdown(report));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(2);
    });
}
