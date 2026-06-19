#!/usr/bin/env node
// check-sandbox-key-health: optional live preflight for the sandbox Clockify key.
// Blank credentials skip the live probe, but env-var shape checks still run
// offline. Live failures never print the key.

const API_KEY = (process.env.CLOCKIFY_API_KEY ?? "").trim();
const WORKSPACE_ID = (process.env.CLOCKIFY_WORKSPACE_ID ?? "").trim();
const ENDPOINT = "https://api.clockify.me/api/v1/user";
const PLACEHOLDERS = new Set(["changeme", "your-key", "todo", "xxx", "placeholder"]);

function truncId(value) {
    if (!value) return "unset";
    return value.length <= 8 ? value : `${value.slice(0, 4)}...${value.slice(-4)}`;
}

const shapeFailures = [];
if (WORKSPACE_ID && !/^[0-9a-fA-F]{24}$/.test(WORKSPACE_ID)) {
    shapeFailures.push("CLOCKIFY_WORKSPACE_ID is set but is not a 24-hex id");
}
if (API_KEY) {
    if (API_KEY !== (process.env.CLOCKIFY_API_KEY ?? "")) {
        shapeFailures.push("CLOCKIFY_API_KEY has leading/trailing whitespace");
    }
    if (API_KEY.length < 20) {
        shapeFailures.push("CLOCKIFY_API_KEY is implausibly short for a Clockify key");
    }
    if (PLACEHOLDERS.has(API_KEY.toLowerCase())) {
        shapeFailures.push("CLOCKIFY_API_KEY looks like a placeholder value");
    }
}
if (shapeFailures.length > 0) {
    console.error("sandbox-key-health: offline shape checks FAILED (key never printed):");
    for (const failure of shapeFailures) console.error(`- ${failure}`);
    process.exit(1);
}

if (!API_KEY) {
    console.log(
        "sandbox-key-health: env-var contract OK; CLOCKIFY_API_KEY blank, skipping optional LIVE probe (offline deterministic run).",
    );
    process.exit(0);
}

try {
    const res = await fetch(ENDPOINT, {
        headers: { "X-Api-Key": API_KEY },
        signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 200) {
        console.log(`sandbox-key-health: OK status=200 workspace=${truncId(WORKSPACE_ID)}.`);
        process.exit(0);
    }

    console.error(
        `sandbox-key-health: FAILED status=${res.status} endpoint=${ENDPOINT} workspace=${truncId(WORKSPACE_ID)}.`,
    );
    process.exit(1);
} catch (error) {
    const reason = error instanceof Error ? error.name : "Error";
    console.error(
        `sandbox-key-health: FAILED ${reason} reaching ${ENDPOINT} workspace=${truncId(WORKSPACE_ID)}. The key is never printed.`,
    );
    process.exit(1);
}
