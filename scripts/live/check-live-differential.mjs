#!/usr/bin/env node
// live-differential: does the live wire carry fields the generated types cannot express?
//
// Every other gate in this repo verifies internal consistency -- spec vs codegen,
// codegen vs docs, docs vs counts. Nothing verified that a generated type matches
// what Clockify actually RETURNS. That gap has shipped real bugs three times over
// (see scripts/lib/live-differential.mjs for the list), so this gate closes it.
//
// Safety posture, identical to the live-evidence campaign:
//   - read-only operations only; nothing here creates, mutates, or deletes,
//   - the same orchestrator gate (CLOCKIFY_LIVE_WORKSPACE_CONFIRM + the pinned
//     sacrificial-workspace fingerprint),
//   - the receipt records FIELD NAMES ONLY, never a single response value,
//   - blank credentials are an offline-safe no-op, so the gate never blocks a
//     laptop or CI run that has no sandbox.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import { diffOperation, responseSchemaFor } from "../lib/live-differential.mjs";
import { validateLiveEnvironment } from "./orchestrator.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONTRACT_PATH = "docs/live-differential-contract.json";
const contract = JSON.parse(fs.readFileSync(path.join(root, CONTRACT_PATH), "utf8"));

const apiKey = process.env.CLOCKIFY_API_KEY ?? "";
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID ?? "";
if (!apiKey || !workspaceId) {
    console.log("live-differential: skipped (blank credentials). Offline-safe no-op.");
    process.exit(0);
}

validateLiveEnvironment(process.env);

const BASE = (process.env.CLOCKIFY_BASE_URL ?? "https://api.clockify.me/api/v1").replace(/\/$/, "");
const spec = YAML.parse(
    fs.readFileSync(path.join(root, contract.sources.correctedOpenApi), "utf8"),
);
const manifest = JSON.parse(
    fs.readFileSync(path.join(root, contract.sources.liveEvidenceManifest), "utf8"),
);

/** operationId -> operation object, keyed off the corrected spec. */
const operationsById = new Map();
for (const [pathKey, item] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(item ?? {})) {
        if (operation?.operationId)
            operationsById.set(operation.operationId, { method, pathKey, operation });
    }
}

async function request(url) {
    const res = await fetch(url, { headers: { "X-Api-Key": apiKey, Accept: "application/json" } });
    const text = await res.text();
    let body = null;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = null;
    }
    return { status: res.status, body };
}

// Resolve the handful of ids the read-only surface needs. Anything unresolved
// simply skips its operations -- it never guesses an id.
const ids = { workspaceId };
const me = await request(`${BASE}/user`);
if (me.status === 200 && me.body?.id) ids.userId = me.body.id;
const projects = await request(`${BASE}/workspaces/${workspaceId}/projects?page-size=1`);
if (projects.status === 200 && Array.isArray(projects.body) && projects.body[0]?.id) {
    ids.projectId = projects.body[0].id;
}

const rows = manifest.operations.filter(
    (row) => row.status === "live-success" && row.proofKind === "read-only",
);

const findings = [];
const checked = [];
const skipped = [];
const knownDriftById = new Map(
    (contract.knownDrift ?? []).map((entry) => [entry.operationId, entry]),
);
const observedKnownDrift = new Set();

for (const row of rows) {
    const entry = operationsById.get(row.operationId);
    if (!entry) {
        skipped.push({ operationId: row.operationId, reason: "not-in-corrected-spec" });
        continue;
    }
    if (entry.method !== "get") {
        skipped.push({ operationId: row.operationId, reason: "not-a-get" });
        continue;
    }
    const schema = responseSchemaFor(entry.operation);
    if (!schema) {
        skipped.push({ operationId: row.operationId, reason: "no-json-2xx-schema" });
        continue;
    }

    const placeholders = [...entry.pathKey.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
    const unresolved = placeholders.filter((name) => !ids[name]);
    if (unresolved.length > 0) {
        skipped.push({
            operationId: row.operationId,
            reason: `unresolved-id:${unresolved.join(",")}`,
        });
        continue;
    }
    const url = BASE + entry.pathKey.replace(/\{(\w+)\}/g, (_, name) => ids[name]);

    const { status, body } = await request(url);
    if (status < 200 || status >= 300 || body == null) {
        skipped.push({ operationId: row.operationId, reason: `non-2xx-or-empty:${status}` });
        continue;
    }
    if (Array.isArray(body) && body.length === 0) {
        skipped.push({ operationId: row.operationId, reason: "empty-collection" });
        continue;
    }

    const diff = diffOperation({ spec, schema, body });
    checked.push({
        operationId: row.operationId,
        operationKey: `${entry.method.toUpperCase()} ${entry.pathKey}`,
        schemaPathCount: diff.schemaPathCount,
        wirePathCount: diff.wirePathCount,
        schemaOnlyCount: diff.schemaOnly.length,
    });
    if (diff.missingFromSchema.length > 0) {
        // A recorded drift is not a pass -- it is a tracked defect with a
        // closure target upstream. New fields on a known-drift operation still
        // fail, so the record cannot quietly absorb a fresh regression.
        const known = knownDriftById.get(row.operationId);
        const knownFields = new Set(known?.missingFromSchema ?? []);
        const fresh = diff.missingFromSchema.filter((field) => !knownFields.has(field));
        observedKnownDrift.add(row.operationId);
        if (fresh.length > 0) {
            findings.push({
                operationId: row.operationId,
                operationKey: `${entry.method.toUpperCase()} ${entry.pathKey}`,
                // Field NAMES only. Never a value.
                missingFromSchema: fresh,
                previouslyRecorded: known ? diff.missingFromSchema.length - fresh.length : 0,
            });
        }
    }
    await new Promise((resolve) => setTimeout(resolve, contract.requestDelayMs ?? 120));
}

const receipt = {
    schemaVersion: 1,
    gate: "live-differential",
    valuesCaptured: false,
    workspaceScoped: true,
    checkedCount: checked.length,
    skippedCount: skipped.length,
    findingCount: findings.length,
    checked: checked.sort((a, b) => a.operationId.localeCompare(b.operationId)),
    skipped: skipped.sort((a, b) => a.operationId.localeCompare(b.operationId)),
    findings: findings.sort((a, b) => a.operationId.localeCompare(b.operationId)),
};
const receiptPath = path.join(root, contract.receiptPath);
fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

console.log(
    `live-differential: checked ${checked.length}, skipped ${skipped.length}, findings ${findings.length}`,
);
console.log(`receipt: ${contract.receiptPath} (field names only, no values)`);

if (checked.length < (contract.minimumCheckedOperations ?? 1)) {
    console.error(
        `live-differential: only ${checked.length} operations were comparable, ` +
            `below the contract minimum ${contract.minimumCheckedOperations}. ` +
            "A collapsing probe surface would make this gate silently vacuous.",
    );
    process.exit(1);
}

// The record ratchets shut: once upstream widens a schema, the stale entry must
// be deleted rather than linger as a standing exemption.
const staleDrift = [...knownDriftById.keys()].filter(
    (operationId) =>
        checked.some((entry) => entry.operationId === operationId) &&
        !observedKnownDrift.has(operationId),
);
if (staleDrift.length > 0) {
    console.error(
        "\nlive-differential FAILED: recorded drift no longer reproduces (fixed upstream?).",
    );
    for (const operationId of staleDrift) {
        console.error(`- ${operationId}: remove its knownDrift entry from ${CONTRACT_PATH}`);
    }
    process.exit(1);
}

if (findings.length > 0) {
    console.error("\nlive-differential FAILED: the wire carries fields the generated types drop.");
    for (const finding of findings) {
        console.error(`- ${finding.operationKey} (${finding.operationId})`);
        for (const field of finding.missingFromSchema) console.error(`    + ${field}`);
    }
    console.error(
        "\nFix upstream in ../GOCLMCP (usually a first-writer-wins schema-name collision),",
    );
    console.error("then re-snapshot spec/corrected. Do not hand-edit the snapshot.");
    process.exit(1);
}

console.log(
    `live-differential passed: no new drift (${observedKnownDrift.size} recorded drift ` +
        `operation(s) still open, tracked in ${CONTRACT_PATH}).`,
);
