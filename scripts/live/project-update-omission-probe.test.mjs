import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createLivePrefix } from "./orchestrator.mjs";
import {
    PROBED_FIELDS,
    ProbeConfigurationError,
    assertCleanupPlannable,
    buildProbePlan,
    buildReceipt,
    runProbe,
    validateProbeEnvironment,
} from "./project-update-omission-probe.mjs";

const SAFE_ENV = Object.freeze({
    CLOCKIFY_API_KEY: "secret-api-key",
    CLOCKIFY_WORKSPACE_ID: "0123456789abcdef01234567",
    CLOCKIFY_LIVE_WORKSPACE_CONFIRM: "0123456789abcdef01234567",
    CLOCKIFY_LIVE_SANDBOX_ACK: "1",
});
const SAFE_FINGERPRINT = createHash("sha256")
    .update(SAFE_ENV.CLOCKIFY_WORKSPACE_ID)
    .digest("hex");

function safeOptions(overrides = {}) {
    return { expectedWorkspaceFingerprint: SAFE_FINGERPRINT, ...overrides };
}

// --- prefix enforcement ---

test("createLivePrefix output is accepted by buildProbePlan", () => {
    const prefix = createLivePrefix();
    const plan = buildProbePlan({ prefix });
    assert.equal(plan.namePrefix, prefix);
});

test("buildProbePlan rejects a prefix outside the governed clockify115-live- namespace", () => {
    assert.throws(
        () => buildProbePlan({ prefix: "attacker-controlled-" }),
        (err) => err instanceof ProbeConfigurationError && err.code === "live_prefix_invalid",
    );
});

test("buildProbePlan rejects a missing prefix", () => {
    assert.throws(
        () => buildProbePlan({}),
        (err) => err instanceof ProbeConfigurationError && err.code === "live_prefix_invalid",
    );
});

// --- field restoration/cleanup planning ---

test("buildProbePlan describes the full create -> hydrate -> minimal-update -> re-fetch -> compare -> cleanup sequence", () => {
    const plan = buildProbePlan({ prefix: createLivePrefix() });
    const actions = plan.steps.map((step) => step.action);
    assert.deepEqual(actions, [
        "create",
        "hydrate-confirm",
        "minimal-update",
        "re-fetch",
        "compare-omitted-fields",
        "cleanup",
    ]);
    assert.deepEqual(plan.probedFields, [...PROBED_FIELDS]);
    assert.equal(plan.steps.at(-1).method, "archive-then-delete");
});

test("assertCleanupPlannable fails closed before any mutation when the client cannot archive-then-delete", () => {
    assert.throws(
        () => assertCleanupPlannable(undefined),
        (err) => err instanceof ProbeConfigurationError && err.code === "live_cleanup_not_plannable",
    );
    assert.throws(
        () => assertCleanupPlannable({ projects: { create: async () => ({}) } }),
        (err) => err instanceof ProbeConfigurationError && err.code === "live_cleanup_not_plannable",
    );
});

test("assertCleanupPlannable accepts a client exposing create/get/update/delete", () => {
    const client = {
        projects: {
            create: async () => ({}),
            get: async () => ({}),
            update: async () => ({}),
            delete: async () => ({}),
        },
    };
    assert.doesNotThrow(() => assertCleanupPlannable(client));
});

test("runProbe refuses to create anything when cleanup cannot be planned (fail closed before mutation)", async () => {
    let created = false;
    const client = {
        projects: {
            create: async () => {
                created = true;
                return { id: "should-not-be-called" };
            },
        },
    };
    await assert.rejects(
        runProbe({ client, workspaceId: SAFE_ENV.CLOCKIFY_WORKSPACE_ID, prefix: createLivePrefix() }),
        (err) => err instanceof ProbeConfigurationError && err.code === "live_cleanup_not_plannable",
    );
    assert.equal(created, false);
});

// --- redaction ---

test("buildReceipt records only booleans per probed field, never raw values", () => {
    const hydrated = { color: "#00FF00", note: "clockify115-live-probe-note", isPublic: true };
    const afterMinimalUpdate = { color: "#00FF00", note: null, isPublic: false };
    const receipt = buildReceipt({ hydrated, afterMinimalUpdate, cleanupOk: true });

    assert.deepEqual(receipt.preserved, { color: true, note: false, isPublic: false });
    for (const value of Object.values(receipt.preserved)) {
        assert.equal(typeof value, "boolean");
    }
    const serialized = JSON.stringify(receipt);
    assert.ok(!serialized.includes("#00FF00"));
    assert.ok(!serialized.includes("clockify115-live-probe-note"));
});

test("runProbe's returned receipt never contains the created project id or name", async () => {
    const hydratedValues = { color: "#00FF00", note: "clockify115-live-probe-note", isPublic: true };
    let projectId = "";
    let projectName = "";
    const client = {
        projects: {
            create: async ({ name, ...fields }) => {
                projectName = name;
                projectId = "665f1b1c1c1c1c1c1c1c1c1c";
                return { id: projectId, name, ...fields };
            },
            get: async () => ({ id: projectId, name: projectName, ...hydratedValues }),
            update: async () => ({}),
            delete: async () => ({}),
        },
    };

    const receipt = await runProbe({
        client,
        workspaceId: SAFE_ENV.CLOCKIFY_WORKSPACE_ID,
        prefix: createLivePrefix(),
    });

    const serialized = JSON.stringify(receipt);
    assert.ok(!serialized.includes(projectId));
    assert.ok(projectName.length > 0);
    assert.ok(!serialized.includes(projectName));
});

// --- missing credentials ---

test("validateProbeEnvironment rejects missing credentials", () => {
    assert.throws(() => validateProbeEnvironment({}, safeOptions()), /live_configuration_invalid/);
});

test("validateProbeEnvironment rejects a missing CLOCKIFY_LIVE_SANDBOX_ACK", () => {
    const { CLOCKIFY_LIVE_SANDBOX_ACK: _drop, ...withoutAck } = SAFE_ENV;
    assert.throws(
        () => validateProbeEnvironment(withoutAck, safeOptions()),
        (err) => err instanceof ProbeConfigurationError && err.code === "live_sandbox_ack_missing",
    );
});

test("validateProbeEnvironment rejects an ack value other than the literal string 1", () => {
    assert.throws(
        () => validateProbeEnvironment({ ...SAFE_ENV, CLOCKIFY_LIVE_SANDBOX_ACK: "true" }, safeOptions()),
        (err) => err instanceof ProbeConfigurationError && err.code === "live_sandbox_ack_missing",
    );
});

test("validateProbeEnvironment accepts full credentials + ack against the pinned sacrificial workspace", () => {
    const result = validateProbeEnvironment(SAFE_ENV, safeOptions());
    assert.equal(result.apiKey, SAFE_ENV.CLOCKIFY_API_KEY);
    assert.equal(result.workspaceId, SAFE_ENV.CLOCKIFY_WORKSPACE_ID);
});

// --- refusal outside a sacrificial workspace marker ---

test("validateProbeEnvironment refuses an unconfirmed workspace even with ack set", () => {
    assert.throws(
        () =>
            validateProbeEnvironment(
                { ...SAFE_ENV, CLOCKIFY_LIVE_WORKSPACE_CONFIRM: "fedcba9876543210fedcba98" },
                safeOptions(),
            ),
        /live_workspace_unconfirmed/,
    );
});

test("validateProbeEnvironment refuses a workspace outside the pinned sacrificial fingerprint even with ack set", () => {
    assert.throws(
        () => validateProbeEnvironment(SAFE_ENV, { expectedWorkspaceFingerprint: "0".repeat(64) }),
        /live_workspace_not_sacrificial/,
    );
});
