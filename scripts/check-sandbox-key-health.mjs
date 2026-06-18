#!/usr/bin/env node
// check-sandbox-key-health: optional live preflight for the sandbox Clockify key.
// Blank credentials are a clean offline skip; live failures never print the key.

const API_KEY = (process.env.CLOCKIFY_API_KEY ?? "").trim();
const WORKSPACE_ID = (process.env.CLOCKIFY_WORKSPACE_ID ?? "").trim();
const ENDPOINT = "https://api.clockify.me/api/v1/user";

function truncId(value) {
    if (!value) return "unset";
    return value.length <= 8 ? value : `${value.slice(0, 4)}...${value.slice(-4)}`;
}

if (!API_KEY) {
    console.log(
        "sandbox-key-health: CLOCKIFY_API_KEY is blank; skipping optional live check (offline deterministic run).",
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
