#!/usr/bin/env node
// PROJECT-001 (P02-11): controlled live probe for project PUT-update
// field-omission semantics -- does Clockify PRESERVE or ERASE optional
// project fields (color, note, isPublic, billable) omitted from a minimal PUT
// update? Neither the official nor corrected OpenAPI documents this;
// only a live probe against a real sandbox answers it.
//
// SAFETY: mutates real Clockify state. Refuses to run the mutating
// sequence unless the standard live-proof gate passes (credentials plus
// an exactly-confirmed, fingerprint-pinned sacrificial workspace -- see
// scripts/live/orchestrator.mjs#validateLiveEnvironment) AND
// CLOCKIFY_LIVE_SANDBOX_ACK=1 is explicitly set: one more deliberate step
// beyond the standard gate, because this is a novel, not-yet-run probe.
// `--dry-plan` prints the planned action sequence without credentials or
// mutation.
//
// This file only builds and offline-tests the harness (P02-11); per the
// remediation plan it must not be executed live in that packet. A human
// runs it against a real sacrificial sandbox at H02-PROJECT.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createLivePrefix, validateLiveEnvironment } from "./orchestrator.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export class ProbeConfigurationError extends Error {
    constructor(code) {
        super(code);
        this.name = "ProbeConfigurationError";
        this.code = code;
    }
}

/** Request fields and their GET response keys. Clockify calls the request
 *  field `isPublic` but returns it as `public`; keeping that mapping explicit
 *  prevents a false preservation result from comparing two `undefined`s. */
export const PROBED_FIELDS = Object.freeze(["color", "note", "isPublic", "billable"]);
export const GET_FIELD_KEYS = Object.freeze({
    color: "color",
    note: "note",
    isPublic: "public",
    billable: "billable",
});

/** Sentinel hydration values -- fixture data, not customer data; never
 *  included in the sanitized receipt regardless (see buildReceipt). */
export const HYDRATED_VALUES = Object.freeze({
    color: "#00FF00",
    note: "clockify115-live-probe-note",
    isPublic: true,
    billable: true,
});

/**
 * Full live-run gate: the standard live-proof gate (credentials + an
 * exactly-confirmed, fingerprint-pinned sacrificial workspace) plus this
 * probe's own explicit CLOCKIFY_LIVE_SANDBOX_ACK=1 acknowledgment.
 */
export function validateProbeEnvironment(env, options = {}) {
    const { apiKey, workspaceId } = validateLiveEnvironment(env, options);
    const ack = typeof env?.CLOCKIFY_LIVE_SANDBOX_ACK === "string" ? env.CLOCKIFY_LIVE_SANDBOX_ACK.trim() : "";
    if (ack !== "1") {
        throw new ProbeConfigurationError("live_sandbox_ack_missing");
    }
    return { apiKey, workspaceId };
}

/**
 * The redacted action plan: what the probe would do, in order, without
 * running any of it. Field values never appear here -- only field names --
 * even though these are fixture sentinels, not secrets, matching the
 * plan's "prints a redacted action plan" requirement.
 */
export function buildProbePlan({ prefix }) {
    if (typeof prefix !== "string" || !prefix.startsWith("clockify115-live-")) {
        throw new ProbeConfigurationError("live_prefix_invalid");
    }
    return {
        namePrefix: prefix,
        probedFields: [...PROBED_FIELDS],
        steps: [
            { action: "create", entity: "project", setsFields: ["name", ...PROBED_FIELDS] },
            { action: "hydrate-confirm", entity: "project", checksFields: [...PROBED_FIELDS] },
            {
                action: "minimal-update",
                entity: "project",
                setsFields: ["name"],
                omitsFields: [...PROBED_FIELDS],
            },
            { action: "re-fetch", entity: "project" },
            { action: "compare-omitted-fields", fields: [...PROBED_FIELDS] },
            { action: "cleanup", entity: "project", method: "archive-then-delete" },
        ],
    };
}

/**
 * Confirm cleanup can actually be planned before anything is created --
 * literal action 4's "fail closed before mutation when cleanup cannot be
 * planned". Pure: only inspects the client shape, never touches the network.
 */
export function assertCleanupPlannable(client) {
    const ok =
        client != null &&
        typeof client.projects?.create === "function" &&
        typeof client.projects?.get === "function" &&
        typeof client.projects?.update === "function" &&
        typeof client.projects?.delete === "function";
    if (!ok) {
        throw new ProbeConfigurationError("live_cleanup_not_plannable");
    }
}

function fieldsEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

/** Build the sanitized, boolean-only receipt -- never raw field values or
 *  the created project's id/name (literal action 2: "record only
 *  booleans/hash-free field-preservation outcomes"). */
export function buildReceipt({ hydrated, afterMinimalUpdate, cleanupOk }) {
    const preserved = {};
    for (const field of PROBED_FIELDS) {
        const getField = GET_FIELD_KEYS[field];
        preserved[field] = fieldsEqual(hydrated?.[getField], afterMinimalUpdate?.[getField]);
    }
    return {
        probe: "project-update-omission",
        preserved,
        cleanup: cleanupOk ? "passed" : "failed",
    };
}

/**
 * The full create -> hydrate -> minimal-update -> re-fetch -> compare ->
 * archive-then-delete sequence against a real (or fake, for tests) typed
 * client. Fails closed before any mutation when cleanup cannot be planned.
 * Cleanup is attempted even if the probe itself throws partway through,
 * once a project has actually been created.
 */
export async function runProbe({ client, workspaceId, prefix }) {
    assertCleanupPlannable(client);
    const plan = buildProbePlan({ prefix });
    const projectName = `${plan.namePrefix}project-update-omission`;

    let projectId;
    let cleanupOk = false;
    try {
        const created = await client.projects.create({
            workspaceId,
            name: projectName,
            ...HYDRATED_VALUES,
        });
        projectId = created.id;

        const hydrated = await client.projects.get({ workspaceId, projectId });
        await client.projects.update({ workspaceId, projectId, name: projectName });
        const afterMinimalUpdate = await client.projects.get({ workspaceId, projectId });

        await client.projects.update({ workspaceId, projectId, name: projectName, archived: true });
        await client.projects.delete({ workspaceId, projectId });
        cleanupOk = true;

        return buildReceipt({ hydrated, afterMinimalUpdate, cleanupOk });
    } catch (cause) {
        if (projectId !== undefined && !cleanupOk) {
            try {
                await client.projects.update({ workspaceId, projectId, name: projectName, archived: true });
                await client.projects.delete({ workspaceId, projectId });
                cleanupOk = true;
            } catch {
                // best-effort recovery cleanup; the thrown error below still
                // reports the true cleanup outcome via its code.
            }
        }
        throw new ProbeConfigurationError(
            cleanupOk ? "live_probe_failed_cleanup_ok" : "live_probe_failed_cleanup_failed",
        );
    }
}

function printDryPlan(prefix) {
    console.log(JSON.stringify(buildProbePlan({ prefix }), null, 2));
}

async function main() {
    const args = process.argv.slice(2);
    const prefix = createLivePrefix();

    if (args.includes("--dry-plan")) {
        printDryPlan(prefix);
        return;
    }

    let credentials;
    try {
        credentials = validateProbeEnvironment(process.env);
    } catch (err) {
        console.error(
            `project-update-omission-probe: refusing to run -- ${err.code ?? err.message ?? err}`,
        );
        console.error(
            "Set CLOCKIFY_API_KEY, CLOCKIFY_WORKSPACE_ID, CLOCKIFY_LIVE_WORKSPACE_CONFIRM " +
                "(= CLOCKIFY_WORKSPACE_ID), and CLOCKIFY_LIVE_SANDBOX_ACK=1, against the pinned " +
                "sacrificial sandbox in docs/live-sandbox-fingerprint.json.",
        );
        process.exitCode = 1;
        return;
    }

    const { createClockifyClient } = await import(
        pathToFileURL(path.join(root, "wrapper", "dist", "esm", "create-client.js")).href
    );
    const client = createClockifyClient({ apiKey: credentials.apiKey });
    const receipt = await runProbe({ client, workspaceId: credentials.workspaceId, prefix });
    console.log(JSON.stringify(receipt, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
