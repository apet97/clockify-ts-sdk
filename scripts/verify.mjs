import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const phase = process.argv[2];
if (!new Set(["fast", "full", "live", "release"]).has(phase)) {
    console.error("usage: node scripts/verify.mjs <fast|full|live|release>");
    process.exit(2);
}

function run(command, args, env = {}) {
    const result = spawnSync(command, args, {
        stdio: "inherit",
        env: { ...process.env, CLOCKIFY_API_KEY: "", CLOCKIFY_WORKSPACE_ID: "", ...env },
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
}

function trackedState() {
    const result = spawnSync("git", ["diff", "--binary", "HEAD"], { encoding: "utf8" });
    if (result.status !== 0) process.exit(result.status ?? 1);
    return createHash("sha256").update(result.stdout).digest("hex");
}

const before = trackedState();
const fast = [
    ["make", ["sdk-codegen"]],
    ["make", ["sdk-codegen-drift", "sdk-codegen-test", "generated-edit-check"], { CLOCKIFY_ALLOW_GENERATED_DIFF: "1" }],
    ["npm", ["run", "build", "-w", "clockify-sdk-ts-115"]],
    ["npm", ["run", "lint", "-w", "clockify-sdk-ts-115"]],
    ["npm", ["run", "lint", "-w", "@apet97/clockify-cli-115"]],
    ["npm", ["run", "lint", "-w", "@apet97/clockify-mcp-115"]],
    ["npm", ["run", "type-check"]],
    ["npm", ["test"]],
    ["npm", ["run", "build"]],
    ["make", ["pack-snapshot-check", "performance-budgets"]],
    ["npm", ["audit", "--omit=dev"]],
];

for (const [command, args, env] of fast) run(command, args, env);
if (phase === "full" || phase === "release") {
    for (const target of [
        "goclmcp-drift",
        "spec-sync-drift",
        "codegen-determinism",
        "build-determinism",
        "generator-comparison",
        "pack-smoke",
        "coverage",
        "mutation-ci",
    ]) run("make", [target]);
}
if (phase === "live") run("make", ["perfect-live"] , {
    CLOCKIFY_API_KEY: process.env.CLOCKIFY_API_KEY ?? "",
    CLOCKIFY_WORKSPACE_ID: process.env.CLOCKIFY_WORKSPACE_ID ?? "",
});
if (phase === "release") {
    run("npm", ["audit"]);
    run("make", ["mcpb", "mcpb-validate", "mcpb-smoke"]);
    run("make", ["version-consistency", "tag-hygiene", "secret-hygiene"]);
}

if (trackedState() !== before) {
    console.error(`verify ${phase} mutated tracked files`);
    process.exit(1);
}
console.log(`verify ${phase}: OK`);
