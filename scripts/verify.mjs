import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

import { commandsForPhase, VERIFY_PHASES } from "./lib/verify-plan.mjs";

const phase = process.argv[2];
if (!new Set(VERIFY_PHASES).has(phase)) {
    console.error("usage: node scripts/verify.mjs <fast|full|live|release>");
    process.exit(2);
}

function run(command, args, env = {}) {
    const result = spawnSync(command, args, {
        stdio: "inherit",
        env: {
            ...process.env,
            CLOCKIFY_API_KEY: "",
            CLOCKIFY_ADDON_TOKEN: "",
            CLOCKIFY_WORKSPACE_ID: "",
            CLOCKIFY_LIVE_WORKSPACE_CONFIRM: "",
            CLOCKIFY_LIVE_PREFIX: "",
            CLOCKIFY_RUN_LIVE_E2E: "",
            ...env,
        },
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
}

function trackedState() {
    const result = spawnSync("git", ["diff", "--binary", "HEAD"], { encoding: "utf8" });
    if (result.status !== 0) process.exit(result.status ?? 1);
    return createHash("sha256").update(result.stdout).digest("hex");
}

const before = trackedState();

for (const entry of commandsForPhase(phase)) {
    const liveEnvironment = entry.inheritLiveEnvironment === true
        ? {
            CLOCKIFY_API_KEY: process.env.CLOCKIFY_API_KEY ?? "",
            CLOCKIFY_WORKSPACE_ID: process.env.CLOCKIFY_WORKSPACE_ID ?? "",
            CLOCKIFY_LIVE_WORKSPACE_CONFIRM:
                  process.env.CLOCKIFY_LIVE_WORKSPACE_CONFIRM ?? "",
        }
        : {};
    run(entry.command, entry.args, { ...entry.env, ...liveEnvironment });
}

if (trackedState() !== before) {
    console.error(`verify ${phase} mutated tracked files`);
    process.exit(1);
}
console.log(`verify ${phase}: OK`);
