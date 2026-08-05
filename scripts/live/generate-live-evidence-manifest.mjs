// Live-evidence manifest generator for docs/live-evidence-manifest.schema.json.
//
// Runs a real, credentialed probe campaign against the pinned sacrificial
// Clockify sandbox workspace and produces one sanitized row per canonical
// operation in docs/openapi-operations.json. Read-only operations are
// called directly; write operations create/mutate/delete throwaway,
// uniquely-named entities (prefix "clockify115-live-<runId>-") and are
// cleaned up in the same run. Operations that are confirmed dead, gated by
// plan/seat limits, irreversible (workspace creation, real user invites,
// token rotation), or that mutate persistent/shared state without a
// safe, symmetric read-back are deliberately left at "documented" /
// "probe-documented" rather than fabricated as "live-success" -- see
// docs/openapi-source-lock-policy.md and spec/evidence/discrepancies.md
// for the evidence this campaign was designed against.
//
// This script never prints credential values, never writes raw response
// bodies to the manifest (only structural shape hashes), and requires
// the same live-environment safety gate (CLOCKIFY_LIVE_WORKSPACE_CONFIRM
// + workspace fingerprint pin) as scripts/live/orchestrator.mjs.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClockifyClient } from "../../wrapper/dist/esm/create-client.js";
import { withResponse } from "../../wrapper/dist/esm/with-response.js";
import { validateLiveEvidenceManifest } from "../check-live-evidence-manifest.mjs";
import { cleanupLivePrefixes, guardCleanupClientForDeadline } from "./cleanup.mjs";
import {
    GOVERNED_SAFETY_DEMOTIONS,
    createCampaignArtifacts,
    hashArtifactTree,
    hashRelativeFiles,
    isDirectInvocation,
    safeCorrelationId,
    safeErrorSummary,
    writeFileAtomic,
} from "./live-evidence-attestation.mjs";
import {
    acquireLiveLock,
    createBoundedLiveClient,
    createLiveCancellationController,
    createLivePrefix,
    GOVERNED_LEGACY_PREFIXES,
    guardLiveClientForCancellation,
    LIVE_CLEANUP_BUDGET_MS,
    LIVE_CLEANUP_RANGE_END,
    LIVE_CLEANUP_RANGE_START,
    normalizeCleanup,
    releaseLiveLock,
    validateLiveEnvironment,
} from "./orchestrator.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FAR_FUTURE_DATE = "2099-06-01T00:00:00Z";
const FAR_FUTURE_DATE_END = "2099-06-08T00:00:00Z";
// Some report endpoints (e.g. generateAttendanceReport) require an exact
// start-of-day / end-of-day boundary, confirmed live 2026-07-26.
const FAR_FUTURE_DAY_START = "2099-06-01T00:00:00.000Z";
const FAR_FUTURE_DAY_END = "2099-06-07T23:59:59.999Z";
const contract = JSON.parse(
    fs.readFileSync(path.join(root, "docs", "live-evidence-currentness-contract.json"), "utf8"),
);

// ---------------------------------------------------------------------
// Deterministic, order-independent structural shape hashing.
// Never hashes real values -- only type markers and (sorted) key names.
// ---------------------------------------------------------------------
function shapeOf(value) {
    if (value === null || value === undefined) return { t: "null" };
    if (Array.isArray(value)) {
        if (value.length === 0) return { t: "array", items: [] };
        const variants = new Set(value.map((item) => stableStringify(shapeOf(item))));
        return { t: "array", items: [...variants].sort().map((s) => JSON.parse(s)) };
    }
    if (typeof value === "object") {
        const keys = Object.keys(value).sort();
        const props = {};
        for (const key of keys) props[key] = shapeOf(value[key]);
        return { t: "object", keys, props };
    }
    if (typeof value === "string") return { t: "string" };
    if (typeof value === "number") return { t: "number" };
    if (typeof value === "boolean") return { t: "boolean" };
    return { t: "unknown" };
}

function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value !== null && typeof value === "object") {
        const keys = Object.keys(value).sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}

function shapeHash(value) {
    return createHash("sha256")
        .update(stableStringify(shapeOf(value)))
        .digest("hex");
}

function httpClassOf(status) {
    const digit = Math.floor(Number(status) / 100);
    return `${digit}xx`;
}

// ---------------------------------------------------------------------
// Row bookkeeping
// ---------------------------------------------------------------------
const CANONICAL_OPERATIONS = JSON.parse(
    fs.readFileSync(new URL("../../docs/openapi-operations.json", import.meta.url), "utf8"),
).operations;
const OPERATION_ID_BY_KEY = new Map(
    CANONICAL_OPERATIONS.map((op) => [`${op.method} ${op.path}`, op.operationId]),
);

/** Look up the real canonical operationId for a fallback pushDocumented(key, ...) call. */
function operationIdFor(operationKey) {
    const operationId = OPERATION_ID_BY_KEY.get(operationKey);
    if (!operationId) throw new Error(`no canonical operationId for ${operationKey}`);
    return operationId;
}

const livePrefix = createLivePrefix();
const runId = createHash("sha256").update(livePrefix).digest("hex").slice(0, 16);
const webhookPrefix = `c115-${runId}-`;
const rows = [];
const seenKeys = new Set();
const probeFailures = [];
let evidenceSeq = 0;

const CAMPAIGN_SAFETY_DEMOTIONS = Object.freeze(
    Object.entries(GOVERNED_SAFETY_DEMOTIONS).map(([operationKey, reason]) =>
        Object.freeze({ operationKey, reason }),
    ),
);
const cancellation = createLiveCancellationController();

function nextEvidenceId() {
    evidenceSeq += 1;
    return `probe-${runId}-${String(evidenceSeq).padStart(3, "0")}`;
}

function pushDocumented(operationKey, operationId) {
    if (seenKeys.has(operationKey)) throw new Error(`duplicate operationKey: ${operationKey}`);
    seenKeys.add(operationKey);
    rows.push({ operationKey, operationId, status: "documented" });
}

function pushProbeDocumented(operationKey, operationId) {
    if (seenKeys.has(operationKey)) throw new Error(`duplicate operationKey: ${operationKey}`);
    seenKeys.add(operationKey);
    rows.push({ operationKey, operationId, status: "probe-documented" });
}

function pushLiveSuccess(
    operationKey,
    operationId,
    { proofKind, httpClass, argsForShape, data, cleanup },
) {
    if (seenKeys.has(operationKey)) throw new Error(`duplicate operationKey: ${operationKey}`);
    seenKeys.add(operationKey);
    const row = {
        operationKey,
        operationId,
        status: "live-success",
        proofKind,
        observedHttpClass: httpClass,
        requestShapeSha256: shapeHash(argsForShape ?? {}),
        responseShapeSha256: shapeHash(data ?? null),
        evidenceId: nextEvidenceId(),
        verifiedAt: new Date().toISOString(),
    };
    if (proofKind === "sandbox-mutation") row.cleanup = cleanup ?? "passed";
    rows.push(row);
    return row;
}

/** Read-only single-call probe: no cleanup concerns. */
async function liveReadOnly(operationKey, operationId, argsForShape, exec) {
    try {
        const { data, status } = await exec();
        pushLiveSuccess(operationKey, operationId, {
            proofKind: "read-only",
            httpClass: httpClassOf(status),
            argsForShape,
            data,
        });
        console.log(`[live-success] ${operationKey}`);
        return data;
    } catch (err) {
        if (cancellation.isCancellation(err)) throw err;
        pushDocumented(operationKey, operationId);
        probeFailures.push({ operationKey });
        console.warn(`[documented] ${operationKey} ${JSON.stringify(safeErrorSummary(err))}`);
        return undefined;
    }
}

/**
 * Mutation-family probe: pushes a live-success/sandbox-mutation row.
 * Mutation rows remain internally pending until every exact-id fallback and
 * aggregate prefix rescan has completed. Only the final all-clear path
 * promotes them to the schema-visible `cleanup: "passed"` state.
 */
async function liveMutation(operationKey, operationId, argsForShape, exec) {
    try {
        const { data, status } = await exec();
        pushLiveSuccess(operationKey, operationId, {
            proofKind: "sandbox-mutation",
            httpClass: httpClassOf(status),
            argsForShape,
            data,
            cleanup: "pending",
        });
        console.log(`[live-success] ${operationKey}`);
        return data;
    } catch (err) {
        if (cancellation.isCancellation(err)) throw err;
        pushDocumented(operationKey, operationId);
        probeFailures.push({ operationKey });
        console.warn(`[documented] ${operationKey} ${JSON.stringify(safeErrorSummary(err))}`);
        return undefined;
    }
}

/**
 * DELETE (and other void-responseType) calls resolve their body to
 * `undefined` on success, identical to liveMutation's failure return --
 * a raw `=== undefined` check on the return value cannot distinguish
 * "deleted cleanly" from "delete threw". Check the row's actual recorded
 * status instead.
 */
function wasLiveSuccess(operationKey) {
    return rows.find((row) => row.operationKey === operationKey)?.status === "live-success";
}

/** Keep a family pending until the final aggregate cleanup proves it absent. */
function downgradeFamilyCleanup(operationKeys) {
    const keySet = new Set(operationKeys);
    for (const row of rows) {
        if (keySet.has(row.operationKey) && row.proofKind === "sandbox-mutation") {
            row.cleanup = "pending";
        }
    }
}

const cleanupStack = new Map();
function registerCleanup(label, fn) {
    // Keep the first callback: it is often the richer archive-then-delete
    // fallback, while later registrations merely record that normal cleanup
    // failed. One live entity must correspond to one cleanup attempt.
    if (!cleanupStack.has(label)) cleanupStack.set(label, { label, fn });
}
function retireCleanup(label) {
    cleanupStack.delete(label);
}
async function runRegisteredCleanup(deadlineMs) {
    const receipt = { attempted: 0, succeeded: 0, failed: 0 };
    while (cleanupStack.size > 0) {
        const { label, fn } = [...cleanupStack.values()].at(-1);
        cleanupStack.delete(label);
        receipt.attempted += 1;
        if (Date.now() >= deadlineMs) {
            receipt.failed += 1;
            continue;
        }
        try {
            await fn();
            receipt.succeeded += 1;
        } catch (err) {
            if (err?.statusCode === 404 || err?.status === 404) {
                receipt.succeeded += 1;
                continue;
            }
            receipt.failed += 1;
            console.warn(
                `[cleanup-failed] correlation=${safeCorrelationId(runId, label)} ${JSON.stringify(safeErrorSummary(err))}`,
            );
        }
    }
    return receipt;
}

// ---------------------------------------------------------------------
// Safety gate: identical posture to scripts/live/orchestrator.mjs.
// ---------------------------------------------------------------------
let workspaceId;
let testUserId = process.env.CLOCKIFY_TEST_USER_ID;
let testProjectId = process.env.CLOCKIFY_TEST_PROJECT_ID;
let client;

/**
 * The pinned CLOCKIFY_TEST_USER_ID / CLOCKIFY_TEST_PROJECT_ID env values
 * are not guaranteed to be members of the currently-configured
 * CLOCKIFY_WORKSPACE_ID (confirmed live: both 400 "doesn't belong to
 * Workspace" against the pinned sandbox). Resolve real, current
 * workspace-member ids instead of trusting stale env values; fall back
 * to the env value only if live discovery itself fails.
 */
async function resolveRealIds() {
    const me = await client.users.getCurrentUser();
    if (!/^[0-9a-fA-F]{24}$/.test(me?.id ?? "")) {
        throw Object.assign(new Error("current user unavailable"), {
            code: "live_current_user_unavailable",
        });
    }
    testUserId = me.id;
    try {
        const projects = await client.projects.list({ workspaceId, page: 1, "page-size": 1 });
        if (Array.isArray(projects) && projects[0]?.id) testProjectId = projects[0].id;
    } catch {
        cancellation.throwIfRequested();
        // keep env fallback
    }
}

function name(family, suffix = "") {
    return `${livePrefix}${family}${suffix ? `-${suffix}` : ""}`;
}

async function waitForWebhookVisibility(webhookId) {
    const delaysMs = [0, 250, 500, 1_000];
    for (const delayMs of delaysMs) {
        cancellation.throwIfRequested();
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        cancellation.throwIfRequested();
        const collection = await client.webhooks.list({ workspaceId });
        if (collection?.webhooks?.some((webhook) => webhook.id === webhookId)) return;
    }
    throw Object.assign(new Error("created webhook did not become visible"), {
        code: "live_webhook_not_visible",
    });
}

async function cleanupTimeEntry(timeEntryId) {
    await client.timeEntries.markInvoiced({
        workspaceId,
        timeEntryIds: [timeEntryId],
        invoiced: false,
    });
    await client.timeEntries.delete({ workspaceId, timeEntryId });
}

// =======================================================================
// TIER A -- read-only operations (no mutation, no cleanup)
// =======================================================================
async function tierAReadOnly() {
    await liveReadOnly("GET /user", "getCurrentUser", { self: "string" }, () =>
        withResponse(client.users.getCurrentUser()),
    );
    await liveReadOnly("GET /workspaces", "getAllMyWorkspaces", {}, () =>
        withResponse(client.workspaces.list()),
    );
    await liveReadOnly("GET /workspaces/{workspaceId}", "getWorkspaceInfo", { workspaceId }, () =>
        withResponse(client.workspaces.get({ workspaceId })),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/approval-requests",
        "getApprovalRequests",
        { workspaceId, statuses: ["PENDING"] },
        () => withResponse(client.approvals.list({ workspaceId, statuses: ["PENDING"] })),
    );
    await liveReadOnly(
        "POST /workspaces/{workspaceId}/audit-log",
        "searchAuditLogs",
        {
            workspaceId,
            actions: ["CREATE_PROJECT"],
            start: FAR_FUTURE_DATE,
            end: FAR_FUTURE_DATE_END,
            page: 1,
            "page-size": 5,
        },
        () =>
            withResponse(
                client.auditLogReport.search({
                    workspaceId,
                    actions: ["CREATE_PROJECT"],
                    start: FAR_FUTURE_DATE,
                    end: FAR_FUTURE_DATE_END,
                    page: 1,
                    "page-size": 5,
                }),
            ),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/clients",
        "getWorkspacesWorkspaceIdClients",
        { workspaceId },
        () => withResponse(client.clients.list({ workspaceId })),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/custom-fields",
        "listWorkspaceCustomFields",
        { workspaceId },
        () => withResponse(client.customFields.listForWorkspace({ workspaceId })),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/entities/created",
        "getCreatedEntityInfo",
        { workspaceId, type: ["PROJECTS"], start: FAR_FUTURE_DATE, end: FAR_FUTURE_DATE_END },
        () =>
            withResponse(
                client.entityChangesExperimental.listCreated({
                    workspaceId,
                    type: ["PROJECTS"],
                    start: FAR_FUTURE_DATE,
                    end: FAR_FUTURE_DATE_END,
                }),
            ),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/entities/deleted",
        "getDeletedEntityInfo",
        { workspaceId, type: ["PROJECTS"], start: FAR_FUTURE_DATE, end: FAR_FUTURE_DATE_END },
        () =>
            withResponse(
                client.entityChangesExperimental.listDeleted({
                    workspaceId,
                    type: ["PROJECTS"],
                    start: FAR_FUTURE_DATE,
                    end: FAR_FUTURE_DATE_END,
                }),
            ),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/entities/updated",
        "getUpdatedEntityInfo",
        { workspaceId, type: ["PROJECTS"], start: FAR_FUTURE_DATE, end: FAR_FUTURE_DATE_END },
        () =>
            withResponse(
                client.entityChangesExperimental.listUpdated({
                    workspaceId,
                    type: ["PROJECTS"],
                    start: FAR_FUTURE_DATE,
                    end: FAR_FUTURE_DATE_END,
                }),
            ),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/expenses",
        "getWorkspaceExpenses",
        { workspaceId },
        () => withResponse(client.expenses.list({ workspaceId })),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/expenses/categories",
        "getExpenseCategories",
        { workspaceId },
        () => withResponse(client.expenseCategories.list({ workspaceId })),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/holidays",
        "getWorkspaceHolidays",
        { workspaceId },
        () => withResponse(client.holidays.list({ workspaceId })),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/holidays/in-period",
        "getWorkspaceHolidaysInPeriod",
        {
            workspaceId,
            "assigned-to": testUserId,
            start: FAR_FUTURE_DATE,
            end: FAR_FUTURE_DATE_END,
        },
        () =>
            withResponse(
                client.holidays.listInPeriod({
                    workspaceId,
                    "assigned-to": testUserId,
                    start: FAR_FUTURE_DATE,
                    end: FAR_FUTURE_DATE_END,
                }),
            ),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/invoices",
        "getWorkspaceInvoices",
        { workspaceId },
        () => withResponse(client.invoices.list({ workspaceId })),
    );
    await liveReadOnly(
        "POST /workspaces/{workspaceId}/invoices/info",
        "filterInvoices",
        { workspaceId, page: 1, pageSize: 5 },
        () => withResponse(client.invoices.filter({ workspaceId, page: 1, pageSize: 5 })),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/invoices/settings",
        "getInvoiceSettings",
        { workspaceId },
        () => withResponse(client.invoiceSettings.get({ workspaceId })),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/projects",
        "getWorkspaceProjects",
        { workspaceId },
        () => withResponse(client.projects.list({ workspaceId })),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/projects/{projectId}",
        "getProjectById",
        { workspaceId, projectId: testProjectId },
        () => withResponse(client.projects.get({ workspaceId, projectId: testProjectId })),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/projects/{projectId}/custom-fields",
        "listProjectCustomFields",
        { workspaceId, projectId: testProjectId },
        () =>
            withResponse(
                client.customFields.listForProject({ workspaceId, projectId: testProjectId }),
            ),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/projects/{projectId}/tasks",
        "findTasksOnProject",
        { workspaceId, projectId: testProjectId },
        () => withResponse(client.tasks.list({ workspaceId, projectId: testProjectId })),
    );
    await liveReadOnly(
        "POST /workspaces/{workspaceId}/reports/attendance",
        "generateAttendanceReport",
        {
            workspaceId,
            dateRangeStart: FAR_FUTURE_DAY_START,
            dateRangeEnd: FAR_FUTURE_DAY_END,
            attendanceFilter: {},
        },
        () =>
            withResponse(
                client.reports.attendance({
                    workspaceId,
                    dateRangeStart: FAR_FUTURE_DAY_START,
                    dateRangeEnd: FAR_FUTURE_DAY_END,
                    attendanceFilter: {},
                }),
            ),
    );
    await liveReadOnly(
        "POST /workspaces/{workspaceId}/reports/detailed",
        "generateDetailedReport",
        {
            workspaceId,
            dateRangeStart: FAR_FUTURE_DATE,
            dateRangeEnd: FAR_FUTURE_DATE_END,
            detailedFilter: {},
        },
        () =>
            withResponse(
                client.reports.detailed({
                    workspaceId,
                    dateRangeStart: FAR_FUTURE_DATE,
                    dateRangeEnd: FAR_FUTURE_DATE_END,
                    detailedFilter: {},
                }),
            ),
    );
    await liveReadOnly(
        "POST /workspaces/{workspaceId}/reports/expenses/detailed",
        "generateDetailedReportV1",
        { workspaceId, dateRangeStart: FAR_FUTURE_DATE, dateRangeEnd: FAR_FUTURE_DATE_END },
        () =>
            withResponse(
                client.expenseReport.generateDetailedReportV1({
                    workspaceId,
                    dateRangeStart: FAR_FUTURE_DATE,
                    dateRangeEnd: FAR_FUTURE_DATE_END,
                }),
            ),
    );
    await liveReadOnly(
        "POST /workspaces/{workspaceId}/reports/summary",
        "generateSummaryReport",
        {
            workspaceId,
            dateRangeStart: FAR_FUTURE_DATE,
            dateRangeEnd: FAR_FUTURE_DATE_END,
            summaryFilter: { groups: ["USER"] },
        },
        () =>
            withResponse(
                client.reports.summary({
                    workspaceId,
                    dateRangeStart: FAR_FUTURE_DATE,
                    dateRangeEnd: FAR_FUTURE_DATE_END,
                    summaryFilter: { groups: ["USER"] },
                }),
            ),
    );
    // Requires an exact 7-day range and a weeklyFilter, confirmed live.
    await liveReadOnly(
        "POST /workspaces/{workspaceId}/reports/weekly",
        "generateWeeklyReport",
        {
            workspaceId,
            dateRangeStart: FAR_FUTURE_DAY_START,
            dateRangeEnd: FAR_FUTURE_DAY_END,
            weeklyFilter: { group: "USER", subgroup: "TIME" },
        },
        () =>
            withResponse(
                client.reports.weekly({
                    workspaceId,
                    dateRangeStart: FAR_FUTURE_DAY_START,
                    dateRangeEnd: FAR_FUTURE_DAY_END,
                    weeklyFilter: { group: "USER", subgroup: "TIME" },
                }),
            ),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/scheduling/assignments/all",
        "getAllSchedulingAssignments",
        { workspaceId, start: FAR_FUTURE_DATE, end: FAR_FUTURE_DATE_END },
        () =>
            withResponse(
                client.scheduling.list({
                    workspaceId,
                    start: FAR_FUTURE_DATE,
                    end: FAR_FUTURE_DATE_END,
                }),
            ),
    );
    await liveReadOnly(
        "POST /workspaces/{workspaceId}/scheduling/assignments/projects/totals",
        "getScheduledAssignmentsPerProject",
        { workspaceId, start: FAR_FUTURE_DATE, end: FAR_FUTURE_DATE_END, pageSize: 5 },
        () =>
            withResponse(
                client.scheduling.listPerProject({
                    workspaceId,
                    start: FAR_FUTURE_DATE,
                    end: FAR_FUTURE_DATE_END,
                    pageSize: 5,
                }),
            ),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/scheduling/assignments/projects/totals/{projectId}",
        "getScheduledAssignmentsOnProject",
        { workspaceId, projectId: testProjectId, start: FAR_FUTURE_DATE, end: FAR_FUTURE_DATE_END },
        () =>
            withResponse(
                client.scheduling.listOnProject({
                    workspaceId,
                    projectId: testProjectId,
                    start: FAR_FUTURE_DATE,
                    end: FAR_FUTURE_DATE_END,
                }),
            ),
    );
    await liveReadOnly(
        "POST /workspaces/{workspaceId}/scheduling/assignments/user-filter/totals",
        "getUsersCapacityTotals",
        { workspaceId, start: FAR_FUTURE_DATE, end: FAR_FUTURE_DATE_END },
        () =>
            withResponse(
                client.scheduling.getUsersCapacityFiltered({
                    workspaceId,
                    start: FAR_FUTURE_DATE,
                    end: FAR_FUTURE_DATE_END,
                }),
            ),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/scheduling/assignments/users/{userId}/totals",
        "getUserCapacityTotal",
        { workspaceId, userId: testUserId, start: FAR_FUTURE_DATE, end: FAR_FUTURE_DATE_END },
        () =>
            withResponse(
                client.scheduling.getUserCapacity({
                    workspaceId,
                    userId: testUserId,
                    start: FAR_FUTURE_DATE,
                    end: FAR_FUTURE_DATE_END,
                }),
            ),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/shared-reports",
        "getWorkspacesWorkspaceIdSharedReports",
        { workspaceId },
        () => withResponse(client.sharedReports.list({ workspaceId })),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/tags",
        "getWorkspacesWorkspaceIdTags",
        { workspaceId },
        () => withResponse(client.tags.list({ workspaceId, page: 1, "page-size": 5 })),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/time-entries/status/in-progress",
        "getWorkspacesWorkspaceIdTimeEntriesStatusInProgress",
        { workspaceId },
        () => withResponse(client.timeEntries.listInProgress({ workspaceId })),
    );
    // getBalancesForPolicy is probed in tierBTimeOffPolicies() once a
    // throwaway policy exists -- it needs a real policyId path param.
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/time-off/balance/user/{userId}",
        "getBalanceForUser",
        { workspaceId, userId: testUserId, page: 1, "page-size": 5 },
        () =>
            withResponse(
                client.balances.getForUser({
                    workspaceId,
                    userId: testUserId,
                    page: 1,
                    "page-size": 5,
                }),
            ),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/time-off/policies",
        "getTimeOffPolicies",
        { workspaceId, status: "ACTIVE" },
        () => withResponse(client.timeOffPolicies.list({ workspaceId, status: "ACTIVE" })),
    );
    await liveReadOnly(
        "POST /workspaces/{workspaceId}/time-off/requests",
        "getAllTimeOffRequestsOnWorkspace",
        { workspaceId, statuses: ["ALL"], page: 1, pageSize: 5 },
        () =>
            withResponse(
                client.timeOff.list({ workspaceId, statuses: ["ALL"], page: 1, pageSize: 5 }),
            ),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/user-groups",
        "findAllGroupsOnWorkspace",
        { workspaceId },
        () => withResponse(client.userGroups.list({ workspaceId })),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/user/{userId}/time-entries",
        "getWorkspacesWorkspaceIdUserUserIdTimeEntries",
        { workspaceId, userId: testUserId },
        () => withResponse(client.timeEntries.listForUser({ workspaceId, userId: testUserId })),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/users",
        "findWorkspaceUsers",
        { workspaceId },
        () => withResponse(client.users.list({ workspaceId })),
    );
    await liveReadOnly(
        "POST /workspaces/{workspaceId}/users/info",
        "filterWorkspaceUsers",
        { workspaceId, page: 1, pageSize: 5 },
        () =>
            withResponse(client.users.filterWorkspaceUsers({ workspaceId, page: 1, pageSize: 5 })),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/users/{userId}/managers",
        "findUserTeamManagers",
        { workspaceId, userId: testUserId },
        () => withResponse(client.users.findUserTeamManagers({ workspaceId, userId: testUserId })),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/webhooks",
        "getWebhooksOnWorkspace",
        { workspaceId },
        () => withResponse(client.webhooks.list({ workspaceId })),
    );
    // No real addon installation exists in this sandbox to supply a
    // genuine addonId -- attempt honestly; a 4xx here just means this
    // isn't verifiable without an installed addon, not a fabricated pass.
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/addons/{addonId}/webhooks",
        "getAddonWebhooksOnWorkspace",
        { workspaceId, addonId: "0".repeat(24) },
        () => withResponse(client.webhooks.listForAddon({ workspaceId, addonId: "0".repeat(24) })),
    );
    await liveReadOnly(
        "GET /workspaces/{workspaceId}/member-profile/{userId}",
        "getMemberProfile",
        { workspaceId, userId: testUserId },
        () => withResponse(client.memberProfiles.get({ workspaceId, userId: testUserId })),
    );
}

// =======================================================================
// TIER B -- write-op families (throwaway, uniquely-named entities)
// =======================================================================

async function tierBTags() {
    const tagName = name("tags");
    const tag = await liveMutation(
        "POST /workspaces/{workspaceId}/tags",
        "postWorkspacesWorkspaceIdTags",
        { workspaceId, name: tagName },
        () => withResponse(client.tags.create({ workspaceId, name: tagName })),
    );
    if (!tag?.id) {
        for (const key of [
            "GET /workspaces/{workspaceId}/tags/{tagId}",
            "PUT /workspaces/{workspaceId}/tags/{tagId}",
            "DELETE /workspaces/{workspaceId}/tags/{tagId}",
        ]) {
            pushDocumented(key, operationIdFor(key));
        }
        return;
    }
    const tagId = tag.id;
    registerCleanup(`tag ${tagId}`, () => client.tags.delete({ workspaceId, tagId }));
    let residual = false;

    await liveMutation(
        "GET /workspaces/{workspaceId}/tags/{tagId}",
        "getWorkspacesWorkspaceIdTagsTagId",
        { workspaceId, tagId },
        () => withResponse(client.tags.get({ workspaceId, tagId })),
    );
    await liveMutation(
        "PUT /workspaces/{workspaceId}/tags/{tagId}",
        "putWorkspacesWorkspaceIdTagsTagId",
        { workspaceId, tagId, name: `${tagName}-updated` },
        () => withResponse(client.tags.update({ workspaceId, tagId, name: `${tagName}-updated` })),
    );
    await liveMutation(
        "DELETE /workspaces/{workspaceId}/tags/{tagId}",
        "deleteWorkspacesWorkspaceIdTagsTagId",
        { workspaceId, tagId },
        () => withResponse(client.tags.delete({ workspaceId, tagId })),
    );
    if (wasLiveSuccess("DELETE /workspaces/{workspaceId}/tags/{tagId}")) {
        retireCleanup(`tag ${tagId}`);
    } else {
        residual = true;
        registerCleanup(`tag ${tagId}`, () => client.tags.delete({ workspaceId, tagId }));
    }
    if (residual) {
        downgradeFamilyCleanup([
            "POST /workspaces/{workspaceId}/tags",
            "GET /workspaces/{workspaceId}/tags/{tagId}",
            "PUT /workspaces/{workspaceId}/tags/{tagId}",
            "DELETE /workspaces/{workspaceId}/tags/{tagId}",
        ]);
    }
}

async function tierBProjects() {
    const projectName = name("projects");
    const project = await liveMutation(
        "POST /workspaces/{workspaceId}/projects",
        "createProject",
        { workspaceId, name: projectName },
        () => withResponse(client.projects.create({ workspaceId, name: projectName })),
    );
    if (!project?.id) {
        for (const key of [
            "POST /workspaces/{workspaceId}/projects/from-template",
            "PUT /workspaces/{workspaceId}/projects/{projectId}",
            "DELETE /workspaces/{workspaceId}/projects/{projectId}",
            "PATCH /workspaces/{workspaceId}/projects/{projectId}/custom-fields/{customFieldId}",
            "DELETE /workspaces/{workspaceId}/projects/{projectId}/custom-fields/{customFieldId}",
            "PATCH /workspaces/{workspaceId}/projects/{projectId}/estimate",
            "POST /workspaces/{workspaceId}/projects/{projectId}/memberships",
            "PATCH /workspaces/{workspaceId}/projects/{projectId}/memberships",
            "PATCH /workspaces/{workspaceId}/projects/{projectId}/template",
            "PUT /workspaces/{workspaceId}/projects/{projectId}/users/{userId}/cost-rate",
            "PUT /workspaces/{workspaceId}/projects/{projectId}/users/{userId}/hourly-rate",
        ]) {
            pushDocumented(key, operationIdFor(key)); // operationId unknown here but every remaining key still needs a row
        }
        return;
    }
    const projectId = project.id;
    registerCleanup(`project ${projectId}`, async () => {
        await client.projects.update({
            workspaceId,
            projectId,
            name: projectName,
            archived: true,
        });
        await client.projects.delete({ workspaceId, projectId });
    });
    let residual = false;

    // Permission/plan-gated per prior evidence (403 "project templates" on
    // this API key's plan) -- attempt anyway, honestly falls back if gated.
    const templateProject = await liveMutation(
        "POST /workspaces/{workspaceId}/projects/from-template",
        "createProjectFromTemplate",
        { workspaceId, name: name("projects", "tmpl"), templateProjectId: projectId },
        () =>
            withResponse(
                client.projects.createFromTemplate({
                    workspaceId,
                    name: name("projects", "tmpl"),
                    templateProjectId: projectId,
                }),
            ),
    );
    if (templateProject?.id) {
        const templateProjectId = templateProject.id;
        registerCleanup(`template project ${templateProjectId}`, async () => {
            await client.projects.update({
                workspaceId,
                projectId: templateProjectId,
                name: name("projects", "tmpl"),
                archived: true,
            });
            await client.projects.delete({ workspaceId, projectId: templateProjectId });
        });
    }

    await liveMutation(
        "PATCH /workspaces/{workspaceId}/projects/{projectId}/estimate",
        "updateProjectEstimate",
        {
            workspaceId,
            projectId,
            timeEstimate: { estimate: "PT10H", type: "MANUAL", active: true },
        },
        () =>
            withResponse(
                client.projects.updateEstimate({
                    workspaceId,
                    projectId,
                    timeEstimate: { estimate: "PT10H", type: "MANUAL", active: true },
                }),
            ),
    );

    await liveMutation(
        "POST /workspaces/{workspaceId}/projects/{projectId}/memberships",
        "assignOrRemoveProjectUsers",
        { workspaceId, projectId, userIds: [testUserId] },
        () =>
            withResponse(
                client.projects.setMembers({ workspaceId, projectId, userIds: [testUserId] }),
            ),
    );

    await liveMutation(
        "PATCH /workspaces/{workspaceId}/projects/{projectId}/memberships",
        "updateProjectMemberships",
        { workspaceId, projectId, memberships: [{ userId: testUserId }] },
        () =>
            withResponse(
                client.projects.updateMemberships({
                    workspaceId,
                    projectId,
                    memberships: [{ userId: testUserId }],
                }),
            ),
    );

    await liveMutation(
        "PATCH /workspaces/{workspaceId}/projects/{projectId}/template",
        "updateProjectTemplate",
        { workspaceId, projectId, isTemplate: false },
        () =>
            withResponse(
                client.projects.updateTemplate({ workspaceId, projectId, isTemplate: false }),
            ),
    );

    await liveMutation(
        "PUT /workspaces/{workspaceId}/projects/{projectId}/users/{userId}/cost-rate",
        "updateProjectUserCostRate",
        { workspaceId, projectId, userId: testUserId, amount: 100 },
        () =>
            withResponse(
                client.projects.updateUserCostRate({
                    workspaceId,
                    projectId,
                    userId: testUserId,
                    amount: 100,
                }),
            ),
    );
    await liveMutation(
        "PUT /workspaces/{workspaceId}/projects/{projectId}/users/{userId}/hourly-rate",
        "updateProjectUserHourlyRate",
        { workspaceId, projectId, userId: testUserId, amount: 100 },
        () =>
            withResponse(
                client.projects.updateUserHourlyRate({
                    workspaceId,
                    projectId,
                    userId: testUserId,
                    amount: 100,
                }),
            ),
    );

    // updateProjectCustomField / removeProjectCustomField -- explicitly
    // unprobed anywhere per prior evidence. Attempt against a throwaway
    // workspace custom field scoped to this throwaway project; both are
    // deleted with the project regardless of outcome.
    let customFieldId;
    try {
        const { data: field } = await withResponse(
            client.customFields.createForWorkspace({
                workspaceId,
                name: name("projfield"),
                type: "TXT",
                entityType: "TIMEENTRY",
            }),
        );
        customFieldId = field?.id;
    } catch (err) {
        console.warn(
            `[setup-failed] project-custom-field ${JSON.stringify(safeErrorSummary(err))}`,
        );
    }
    if (customFieldId) {
        registerCleanup(`project custom field ${customFieldId}`, () =>
            client.customFields.deleteForWorkspace({ workspaceId, customFieldId }),
        );
        await liveMutation(
            "PATCH /workspaces/{workspaceId}/projects/{projectId}/custom-fields/{customFieldId}",
            "updateProjectCustomField",
            { workspaceId, projectId, customFieldId, status: "VISIBLE" },
            () =>
                withResponse(
                    client.customFields.updateForProject({
                        workspaceId,
                        projectId,
                        customFieldId,
                        status: "VISIBLE",
                    }),
                ),
        );
        await liveMutation(
            "DELETE /workspaces/{workspaceId}/projects/{projectId}/custom-fields/{customFieldId}",
            "removeProjectCustomField",
            { workspaceId, projectId, customFieldId },
            () =>
                withResponse(
                    client.customFields.removeFromProject({
                        workspaceId,
                        projectId,
                        customFieldId,
                    }),
                ),
        );
        try {
            await withResponse(
                client.customFields.deleteForWorkspace({ workspaceId, customFieldId }),
            );
            retireCleanup(`project custom field ${customFieldId}`);
        } catch (err) {
            residual = true;
            console.warn(
                `[cleanup-failed] project-custom-field ${JSON.stringify(safeErrorSummary(err))}`,
            );
            registerCleanup(`project custom field ${customFieldId}`, () =>
                client.customFields.deleteForWorkspace({ workspaceId, customFieldId }),
            );
        }
    } else {
        pushDocumented(
            "PATCH /workspaces/{workspaceId}/projects/{projectId}/custom-fields/{customFieldId}",
            "updateProjectCustomField",
        );
        pushDocumented(
            "DELETE /workspaces/{workspaceId}/projects/{projectId}/custom-fields/{customFieldId}",
            "removeProjectCustomField",
        );
    }

    // updateProject (PUT, full-replace) -- also probed here with a real
    // field change (not the archive step, which reuses this same wire
    // operation but is applied separately below without a second row).
    await liveMutation(
        "PUT /workspaces/{workspaceId}/projects/{projectId}",
        "updateProject",
        { workspaceId, projectId, name: projectName, note: "clockify115-live-evidence-probe" },
        () =>
            withResponse(
                client.projects.update({
                    workspaceId,
                    projectId,
                    name: projectName,
                    note: "clockify115-live-evidence-probe",
                }),
            ),
    );

    // Archive-then-delete: archiving reuses the same wire operation as the
    // updateProject probe above, so it is applied directly (not through
    // liveMutation) to avoid a duplicate operationKey; deleteProject is
    // itself the terminal probe AND the cleanup step.
    try {
        await withResponse(
            client.projects.update({ workspaceId, projectId, name: projectName, archived: true }),
        );
    } catch (err) {
        residual = true;
        console.warn(`[cleanup-failed] archive-project ${JSON.stringify(safeErrorSummary(err))}`);
    }
    await liveMutation(
        "DELETE /workspaces/{workspaceId}/projects/{projectId}",
        "deleteProject",
        { workspaceId, projectId },
        () => withResponse(client.projects.delete({ workspaceId, projectId })),
    );
    if (wasLiveSuccess("DELETE /workspaces/{workspaceId}/projects/{projectId}")) {
        retireCleanup(`project ${projectId}`);
    } else {
        residual = true;
        registerCleanup(`project ${projectId}`, () =>
            client.projects.delete({ workspaceId, projectId }),
        );
    }

    if (residual) {
        downgradeFamilyCleanup([
            "POST /workspaces/{workspaceId}/projects",
            "POST /workspaces/{workspaceId}/projects/from-template",
            "PATCH /workspaces/{workspaceId}/projects/{projectId}/estimate",
            "POST /workspaces/{workspaceId}/projects/{projectId}/memberships",
            "PATCH /workspaces/{workspaceId}/projects/{projectId}/memberships",
            "PATCH /workspaces/{workspaceId}/projects/{projectId}/template",
            "PUT /workspaces/{workspaceId}/projects/{projectId}/users/{userId}/cost-rate",
            "PUT /workspaces/{workspaceId}/projects/{projectId}/users/{userId}/hourly-rate",
            "PATCH /workspaces/{workspaceId}/projects/{projectId}/custom-fields/{customFieldId}",
            "DELETE /workspaces/{workspaceId}/projects/{projectId}/custom-fields/{customFieldId}",
            "PUT /workspaces/{workspaceId}/projects/{projectId}",
            "DELETE /workspaces/{workspaceId}/projects/{projectId}",
        ]);
    }
}

async function tierBClients() {
    const clientName = name("clients");
    const clientRecord = await liveMutation(
        "POST /workspaces/{workspaceId}/clients",
        "postWorkspacesWorkspaceIdClients",
        { workspaceId, name: clientName },
        () => withResponse(client.clients.create({ workspaceId, name: clientName })),
    );
    if (!clientRecord?.id) {
        for (const key of [
            "GET /workspaces/{workspaceId}/clients/{clientId}",
            "PUT /workspaces/{workspaceId}/clients/{clientId}",
            "DELETE /workspaces/{workspaceId}/clients/{clientId}",
        ]) {
            pushDocumented(key, operationIdFor(key));
        }
        return;
    }
    const clientId = clientRecord.id;
    registerCleanup(`client ${clientId}`, async () => {
        await client.clients.update({
            workspaceId,
            clientId,
            body: { name: clientName, archived: true },
        });
        await client.clients.delete({ workspaceId, clientId });
    });
    let residual = false;

    await liveMutation(
        "GET /workspaces/{workspaceId}/clients/{clientId}",
        "getWorkspacesWorkspaceIdClientsClientId",
        { workspaceId, clientId },
        () => withResponse(client.clients.get({ workspaceId, clientId })),
    );
    await liveMutation(
        "PUT /workspaces/{workspaceId}/clients/{clientId}",
        "putWorkspacesWorkspaceIdClientsClientId",
        { workspaceId, clientId, name: clientName, note: "clockify115-live-evidence-probe" },
        () =>
            withResponse(
                client.clients.update({
                    workspaceId,
                    clientId,
                    name: clientName,
                    note: "clockify115-live-evidence-probe",
                }),
            ),
    );

    // Dedicated /archive route is unconfirmed/likely-dead per prior
    // evidence -- archiving is done via the update body-envelope bypass
    // (core.bodyFromRequest returns `body` verbatim when present), which
    // is the confirmed live mechanism. This reuses the update wire
    // operation, so it is applied directly (not through liveMutation).
    try {
        await withResponse(
            client.clients.update({
                workspaceId,
                clientId,
                body: { name: clientName, archived: true },
            }),
        );
    } catch (err) {
        residual = true;
        console.warn(`[cleanup-failed] archive-client ${JSON.stringify(safeErrorSummary(err))}`);
    }
    await liveMutation(
        "DELETE /workspaces/{workspaceId}/clients/{clientId}",
        "deleteWorkspacesWorkspaceIdClientsClientId",
        { workspaceId, clientId },
        () => withResponse(client.clients.delete({ workspaceId, clientId })),
    );
    if (wasLiveSuccess("DELETE /workspaces/{workspaceId}/clients/{clientId}")) {
        retireCleanup(`client ${clientId}`);
    } else {
        residual = true;
        registerCleanup(`client ${clientId}`, () =>
            client.clients.delete({ workspaceId, clientId }),
        );
    }
    if (residual) {
        downgradeFamilyCleanup([
            "POST /workspaces/{workspaceId}/clients",
            "GET /workspaces/{workspaceId}/clients/{clientId}",
            "PUT /workspaces/{workspaceId}/clients/{clientId}",
            "DELETE /workspaces/{workspaceId}/clients/{clientId}",
        ]);
    }

}

async function tierBTasks() {
    if (!testProjectId) {
        for (const key of [
            "GET /workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}",
            "POST /workspaces/{workspaceId}/projects/{projectId}/tasks",
            "PUT /workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}",
            "DELETE /workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}",
            "PUT /workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}/cost-rate",
            "PUT /workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}/hourly-rate",
        ]) {
            pushDocumented(key, operationIdFor(key));
        }
        return;
    }
    const taskName = name("tasks");
    const task = await liveMutation(
        "POST /workspaces/{workspaceId}/projects/{projectId}/tasks",
        "addTaskOnProject",
        { workspaceId, projectId: testProjectId, name: taskName },
        () =>
            withResponse(
                client.tasks.create({ workspaceId, projectId: testProjectId, name: taskName }),
            ),
    );
    if (!task?.id) {
        for (const key of [
            "GET /workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}",
            "PUT /workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}",
            "DELETE /workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}",
            "PUT /workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}/cost-rate",
            "PUT /workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}/hourly-rate",
        ]) {
            pushDocumented(key, operationIdFor(key));
        }
        return;
    }
    const taskId = task.id;
    registerCleanup(`task ${taskId}`, async () => {
        await client.tasks.update({
            workspaceId,
            projectId: testProjectId,
            taskId,
            name: `${taskName}-updated`,
            status: "DONE",
        });
        await client.tasks.delete({ workspaceId, projectId: testProjectId, taskId });
    });
    let residual = false;

    await liveMutation(
        "GET /workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}",
        "getTaskById",
        { workspaceId, projectId: testProjectId, taskId },
        () => withResponse(client.tasks.get({ workspaceId, projectId: testProjectId, taskId })),
    );
    await liveMutation(
        "PUT /workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}",
        "updateTaskOnProject",
        { workspaceId, projectId: testProjectId, taskId, name: `${taskName}-updated` },
        () =>
            withResponse(
                client.tasks.update({
                    workspaceId,
                    projectId: testProjectId,
                    taskId,
                    name: `${taskName}-updated`,
                }),
            ),
    );
    await liveMutation(
        "PUT /workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}/cost-rate",
        "updateTaskCostRate",
        { workspaceId, projectId: testProjectId, taskId, amount: 100 },
        () =>
            withResponse(
                client.tasks.updateCostRate({
                    workspaceId,
                    projectId: testProjectId,
                    taskId,
                    amount: 100,
                }),
            ),
    );
    await liveMutation(
        "PUT /workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}/hourly-rate",
        "updateTaskBillableRate",
        { workspaceId, projectId: testProjectId, taskId, amount: 100 },
        () =>
            withResponse(
                client.tasks.updateBillableRate({
                    workspaceId,
                    projectId: testProjectId,
                    taskId,
                    amount: 100,
                }),
            ),
    );

    // Deleting an active task 400s; mark DONE first (replace-PUT, status
    // field not archived boolean) -- this reuses the updateTaskOnProject
    // wire operation, applied directly to avoid a duplicate row.
    try {
        await withResponse(
            client.tasks.update({
                workspaceId,
                projectId: testProjectId,
                taskId,
                name: `${taskName}-updated`,
                status: "DONE",
            }),
        );
    } catch (err) {
        residual = true;
        console.warn(`[cleanup-failed] finish-task ${JSON.stringify(safeErrorSummary(err))}`);
    }
    await liveMutation(
        "DELETE /workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}",
        "deleteTaskFromProject",
        { workspaceId, projectId: testProjectId, taskId },
        () => withResponse(client.tasks.delete({ workspaceId, projectId: testProjectId, taskId })),
    );
    if (wasLiveSuccess("DELETE /workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}")) {
        retireCleanup(`task ${taskId}`);
    } else {
        residual = true;
        registerCleanup(`task ${taskId}`, () =>
            client.tasks.delete({ workspaceId, projectId: testProjectId, taskId }),
        );
    }
    if (residual) {
        downgradeFamilyCleanup([
            "POST /workspaces/{workspaceId}/projects/{projectId}/tasks",
            "GET /workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}",
            "PUT /workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}",
            "PUT /workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}/cost-rate",
            "PUT /workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}/hourly-rate",
            "DELETE /workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}",
        ]);
    }
}

async function tierBCustomFieldsWorkspace() {
    const fieldName = name("field");
    const field = await liveMutation(
        "POST /workspaces/{workspaceId}/custom-fields",
        "createWorkspaceCustomField",
        { workspaceId, name: fieldName, type: "TXT", entityType: "TIMEENTRY" },
        () =>
            withResponse(
                client.customFields.createForWorkspace({
                    workspaceId,
                    name: fieldName,
                    type: "TXT",
                    entityType: "TIMEENTRY",
                }),
            ),
    );
    if (!field?.id) {
        for (const key of [
            "PUT /workspaces/{workspaceId}/custom-fields/{customFieldId}",
            "DELETE /workspaces/{workspaceId}/custom-fields/{customFieldId}",
        ]) {
            pushDocumented(key, operationIdFor(key));
        }
        return;
    }
    const customFieldId = field.id;
    registerCleanup(`custom field ${customFieldId}`, () =>
        client.customFields.deleteForWorkspace({ workspaceId, customFieldId }),
    );
    let residual = false;

    await liveMutation(
        "PUT /workspaces/{workspaceId}/custom-fields/{customFieldId}",
        "updateWorkspaceCustomField",
        { workspaceId, customFieldId, name: `${fieldName}-updated`, type: "TXT" },
        () =>
            withResponse(
                client.customFields.updateForWorkspace({
                    workspaceId,
                    customFieldId,
                    name: `${fieldName}-updated`,
                    type: "TXT",
                }),
            ),
    );
    await liveMutation(
        "DELETE /workspaces/{workspaceId}/custom-fields/{customFieldId}",
        "deleteWorkspaceCustomField",
        { workspaceId, customFieldId },
        () => withResponse(client.customFields.deleteForWorkspace({ workspaceId, customFieldId })),
    );
    if (wasLiveSuccess("DELETE /workspaces/{workspaceId}/custom-fields/{customFieldId}")) {
        retireCleanup(`custom field ${customFieldId}`);
    } else {
        residual = true;
        registerCleanup(`custom field ${customFieldId}`, () =>
            client.customFields.deleteForWorkspace({ workspaceId, customFieldId }),
        );
    }
    if (residual) {
        downgradeFamilyCleanup([
            "POST /workspaces/{workspaceId}/custom-fields",
            "PUT /workspaces/{workspaceId}/custom-fields/{customFieldId}",
            "DELETE /workspaces/{workspaceId}/custom-fields/{customFieldId}",
        ]);
    }
}

async function tierBTimeEntries() {
    // markInvoicedBulk (PATCH .../time-entries/invoiced/bulk) was quarantined
    // upstream in GOCLMCP PHANTOM_PATHS on 2026-08-04/05: every method
    // (GET/POST/PUT/PATCH/DELETE/OPTIONS) 404s on the route. It no longer
    // exists in the canonical operation inventory, so there is nothing left
    // to document here. See spec/evidence/discrepancies.md
    // `time-entries.mark-invoiced.bulk-route-404-deferred`.
    if (!testProjectId || !testUserId) {
        for (const key of [
            "POST /workspaces/{workspaceId}/time-entries",
            "GET /workspaces/{workspaceId}/time-entries/{timeEntryId}",
            "PUT /workspaces/{workspaceId}/time-entries/{timeEntryId}",
            "DELETE /workspaces/{workspaceId}/time-entries/{timeEntryId}",
            "PATCH /workspaces/{workspaceId}/time-entries/invoiced",
            "POST /workspaces/{workspaceId}/user/{userId}/time-entries",
            "PUT /workspaces/{workspaceId}/user/{userId}/time-entries",
            "PATCH /workspaces/{workspaceId}/user/{userId}/time-entries",
            "DELETE /workspaces/{workspaceId}/user/{userId}/time-entries",
            "POST /workspaces/{workspaceId}/user/{userId}/time-entries/{timeEntryId}/duplicate",
        ]) {
            pushDocumented(key, operationIdFor(key));
        }
        return;
    }
    const start = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const timeEntryDescription = name("time-entry");
    const userTimeEntryDescription = name("user-time-entry");
    const runningTimeEntryDescription = name("running-time-entry");
    let residual = false;
    const familyKeys = [];

    familyKeys.push("POST /workspaces/{workspaceId}/time-entries");
    const entry = await liveMutation(
        "POST /workspaces/{workspaceId}/time-entries",
        "postWorkspacesWorkspaceIdTimeEntries",
        {
            workspaceId,
            projectId: testProjectId,
            start,
            end,
            billable: true,
            description: timeEntryDescription,
        },
        () =>
            withResponse(
                client.timeEntries.create({
                    workspaceId,
                    projectId: testProjectId,
                    start,
                    end,
                    billable: true,
                    description: timeEntryDescription,
                }),
            ),
    );
    if (!entry?.id) {
        for (const key of [
            "GET /workspaces/{workspaceId}/time-entries/{timeEntryId}",
            "PUT /workspaces/{workspaceId}/time-entries/{timeEntryId}",
            "DELETE /workspaces/{workspaceId}/time-entries/{timeEntryId}",
            "PATCH /workspaces/{workspaceId}/time-entries/invoiced",
        ]) {
            pushDocumented(key, operationIdFor(key));
        }
    } else {
        const timeEntryId = entry.id;
        registerCleanup(`time entry ${timeEntryId}`, () => cleanupTimeEntry(timeEntryId));
        familyKeys.push(
            "GET /workspaces/{workspaceId}/time-entries/{timeEntryId}",
            "PUT /workspaces/{workspaceId}/time-entries/{timeEntryId}",
            "PATCH /workspaces/{workspaceId}/time-entries/invoiced",
            "DELETE /workspaces/{workspaceId}/time-entries/{timeEntryId}",
        );
        await liveMutation(
            "GET /workspaces/{workspaceId}/time-entries/{timeEntryId}",
            "getWorkspacesWorkspaceIdTimeEntriesTimeEntryId",
            { workspaceId, timeEntryId },
            () => withResponse(client.timeEntries.get({ workspaceId, timeEntryId })),
        );
        await liveMutation(
            "PUT /workspaces/{workspaceId}/time-entries/{timeEntryId}",
            "putWorkspacesWorkspaceIdTimeEntriesTimeEntryId",
            {
                workspaceId,
                timeEntryId,
                projectId: testProjectId,
                start,
                end,
                description: `${timeEntryDescription}-updated`,
            },
            () =>
                withResponse(
                    client.timeEntries.update({
                        workspaceId,
                        timeEntryId,
                        projectId: testProjectId,
                        start,
                        end,
                        description: `${timeEntryDescription}-updated`,
                    }),
                ),
        );
        await liveMutation(
            "PATCH /workspaces/{workspaceId}/time-entries/invoiced",
            "patchWorkspacesWorkspaceIdTimeEntriesInvoiced",
            { workspaceId, timeEntryIds: [timeEntryId], invoiced: true },
            () =>
                withResponse(
                    client.timeEntries.markInvoiced({
                        workspaceId,
                        timeEntryIds: [timeEntryId],
                        invoiced: true,
                    }),
                ),
        );
        // Un-invoice before delete -- an invoiced entry may not be deletable.
        try {
            await withResponse(
                client.timeEntries.markInvoiced({
                    workspaceId,
                    timeEntryIds: [timeEntryId],
                    invoiced: false,
                }),
            );
        } catch (err) {
            console.warn(
                `[cleanup-failed] uninvoiced-time-entry ${JSON.stringify(safeErrorSummary(err))}`,
            );
        }
        await liveMutation(
            "DELETE /workspaces/{workspaceId}/time-entries/{timeEntryId}",
            "deleteWorkspacesWorkspaceIdTimeEntriesTimeEntryId",
            { workspaceId, timeEntryId },
            () => withResponse(client.timeEntries.delete({ workspaceId, timeEntryId })),
        );
        if (wasLiveSuccess("DELETE /workspaces/{workspaceId}/time-entries/{timeEntryId}")) {
            retireCleanup(`time entry ${timeEntryId}`);
        } else {
            residual = true;
            registerCleanup(`time entry ${timeEntryId}`, () => cleanupTimeEntry(timeEntryId));
        }
    }

    // createForUser + duplicate -- both cleaned up via deleteMany below.
    familyKeys.push(
        "POST /workspaces/{workspaceId}/user/{userId}/time-entries",
        "POST /workspaces/{workspaceId}/user/{userId}/time-entries/{timeEntryId}/duplicate",
    );
    const createdIds = [];
    const userEntry = await liveMutation(
        "POST /workspaces/{workspaceId}/user/{userId}/time-entries",
        "postWorkspacesWorkspaceIdUserUserIdTimeEntries",
        {
            workspaceId,
            userId: testUserId,
            projectId: testProjectId,
            start,
            end,
            billable: true,
            description: userTimeEntryDescription,
        },
        () =>
            withResponse(
                client.timeEntries.createForUser({
                    workspaceId,
                    userId: testUserId,
                    projectId: testProjectId,
                    start,
                    end,
                    billable: true,
                    description: userTimeEntryDescription,
                }),
            ),
    );
    if (userEntry?.id) {
        createdIds.push(userEntry.id);
        registerCleanup(`time entry ${userEntry.id}`, () => cleanupTimeEntry(userEntry.id));
        const duplicated = await liveMutation(
            "POST /workspaces/{workspaceId}/user/{userId}/time-entries/{timeEntryId}/duplicate",
            "postWorkspacesWorkspaceIdUserUserIdTimeEntriesTimeEntryIdDuplicate",
            { workspaceId, userId: testUserId, timeEntryId: userEntry.id },
            () =>
                withResponse(
                    client.timeEntries.duplicate({
                        workspaceId,
                        userId: testUserId,
                        timeEntryId: userEntry.id,
                    }),
                ),
        );
        if (Array.isArray(duplicated) ? duplicated[0]?.id : duplicated?.id) {
            const duplicatedId = Array.isArray(duplicated) ? duplicated[0].id : duplicated.id;
            createdIds.push(duplicatedId);
            registerCleanup(`time entry ${duplicatedId}`, () => cleanupTimeEntry(duplicatedId));
        }
    } else {
        pushDocumented(
            "POST /workspaces/{workspaceId}/user/{userId}/time-entries/{timeEntryId}/duplicate",
            "postWorkspacesWorkspaceIdUserUserIdTimeEntriesTimeEntryIdDuplicate",
        );
    }

    // PUT on this route is genuinely "Bulk edit time entries" per the
    // corrected OpenAPI spec (x-fern-sdk-method-name "startTimer" is a
    // misleading SDK method name, not the wire semantic) -- each array
    // item requires a real existing id/start/end, confirmed live
    // 2026-07-26 ("Time entry id cannot have a null value" on a null
    // id). Bulk-edit the entries already created above.
    familyKeys.push("PUT /workspaces/{workspaceId}/user/{userId}/time-entries");
    if (createdIds.length > 0) {
        await liveMutation(
            "PUT /workspaces/{workspaceId}/user/{userId}/time-entries",
            "putWorkspacesWorkspaceIdUserUserIdTimeEntries",
            {
                workspaceId,
                userId: testUserId,
                body: createdIds.map((id) => ({
                    id,
                    start,
                    end,
                    projectId: testProjectId,
                    billable: true,
                    description: userTimeEntryDescription,
                })),
            },
            () =>
                withResponse(
                    client.timeEntries.startTimer({
                        workspaceId,
                        userId: testUserId,
                        body: createdIds.map((id) => ({
                            id,
                            start,
                            end,
                            projectId: testProjectId,
                            billable: true,
                            description: userTimeEntryDescription,
                        })),
                    }),
                ),
        );
    } else {
        pushDocumented(
            "PUT /workspaces/{workspaceId}/user/{userId}/time-entries",
            "putWorkspacesWorkspaceIdUserUserIdTimeEntries",
        );
    }

    // PATCH on this route is genuinely "Stop running timer" per the
    // corrected spec -- needs a real running entry (create() without an
    // `end` starts one), then stop it via {end}.
    familyKeys.push("PATCH /workspaces/{workspaceId}/user/{userId}/time-entries");
    let runningEntryId;
    try {
        const { data: running } = await withResponse(
            client.timeEntries.createForUser({
                workspaceId,
                userId: testUserId,
                projectId: testProjectId,
                start: new Date().toISOString(),
                description: runningTimeEntryDescription,
            }),
        );
        runningEntryId = running?.id;
    } catch (err) {
        console.warn(`[setup-failed] running-timer ${JSON.stringify(safeErrorSummary(err))}`);
    }
    if (runningEntryId) {
        createdIds.push(runningEntryId);
        registerCleanup(`time entry ${runningEntryId}`, () => cleanupTimeEntry(runningEntryId));
        await liveMutation(
            "PATCH /workspaces/{workspaceId}/user/{userId}/time-entries",
            "patchWorkspacesWorkspaceIdUserUserIdTimeEntries",
            { workspaceId, userId: testUserId, end: new Date().toISOString() },
            () =>
                withResponse(
                    client.timeEntries.updateForUser({
                        workspaceId,
                        userId: testUserId,
                        end: new Date().toISOString(),
                    }),
                ),
        );
    } else {
        pushDocumented(
            "PATCH /workspaces/{workspaceId}/user/{userId}/time-entries",
            "patchWorkspacesWorkspaceIdUserUserIdTimeEntries",
        );
    }

    // deleteMany -- scoped strictly to the ids this run created (per
    // prior evidence this op has no probe history; never scope a bulk
    // delete to anything but entries this run itself created).
    familyKeys.push("DELETE /workspaces/{workspaceId}/user/{userId}/time-entries");
    if (createdIds.length > 0) {
        await liveMutation(
            "DELETE /workspaces/{workspaceId}/user/{userId}/time-entries",
            "deleteMany",
            { workspaceId, userId: testUserId, "time-entry-ids": createdIds },
            () =>
                withResponse(
                    client.timeEntries.deleteMany({
                        workspaceId,
                        userId: testUserId,
                        "time-entry-ids": createdIds,
                    }),
                ),
        );
        if (wasLiveSuccess("DELETE /workspaces/{workspaceId}/user/{userId}/time-entries")) {
            for (const id of createdIds) retireCleanup(`time entry ${id}`);
        } else {
            residual = true;
            for (const id of createdIds) {
                registerCleanup(`time entry ${id}`, () => cleanupTimeEntry(id));
            }
        }
    } else {
        pushDocumented("DELETE /workspaces/{workspaceId}/user/{userId}/time-entries", "deleteMany");
    }

    if (residual) downgradeFamilyCleanup(familyKeys);
}

async function tierBExpenses() {
    if (!testUserId) {
        for (const key of [
            "POST /workspaces/{workspaceId}/expenses/categories",
            "PUT /workspaces/{workspaceId}/expenses/categories/{categoryId}",
            "PATCH /workspaces/{workspaceId}/expenses/categories/{categoryId}/status",
            "DELETE /workspaces/{workspaceId}/expenses/categories/{categoryId}",
            "POST /workspaces/{workspaceId}/expenses",
            "GET /workspaces/{workspaceId}/expenses/{expenseId}",
            "PUT /workspaces/{workspaceId}/expenses/{expenseId}",
            "DELETE /workspaces/{workspaceId}/expenses/{expenseId}",
            "GET /workspaces/{workspaceId}/expenses/{expenseId}/files/{fileId}",
        ]) {
            pushDocumented(key, operationIdFor(key));
        }
        return;
    }
    let residual = false;
    const familyKeys = [];

    const categoryName = name("expcat");
    familyKeys.push("POST /workspaces/{workspaceId}/expenses/categories");
    const category = await liveMutation(
        "POST /workspaces/{workspaceId}/expenses/categories",
        "addExpenseCategory",
        { workspaceId, name: categoryName },
        () => withResponse(client.expenseCategories.create({ workspaceId, name: categoryName })),
    );
    if (!category?.id) {
        for (const key of [
            "PUT /workspaces/{workspaceId}/expenses/categories/{categoryId}",
            "PATCH /workspaces/{workspaceId}/expenses/categories/{categoryId}/status",
            "DELETE /workspaces/{workspaceId}/expenses/categories/{categoryId}",
            "POST /workspaces/{workspaceId}/expenses",
            "GET /workspaces/{workspaceId}/expenses/{expenseId}",
            "PUT /workspaces/{workspaceId}/expenses/{expenseId}",
            "DELETE /workspaces/{workspaceId}/expenses/{expenseId}",
            "GET /workspaces/{workspaceId}/expenses/{expenseId}/files/{fileId}",
        ]) {
            pushDocumented(key, operationIdFor(key));
        }
        return;
    }
    const categoryId = category.id;
    registerCleanup(`expense category ${categoryId}`, async () => {
        await client.expenseCategories.archive({ workspaceId, categoryId, archived: true });
        await client.expenseCategories.delete({ workspaceId, categoryId });
    });
    familyKeys.push("PUT /workspaces/{workspaceId}/expenses/categories/{categoryId}");
    await liveMutation(
        "PUT /workspaces/{workspaceId}/expenses/categories/{categoryId}",
        "updateExpenseCategory",
        { workspaceId, categoryId, name: `${categoryName}-updated` },
        () =>
            withResponse(
                client.expenseCategories.update({
                    workspaceId,
                    categoryId,
                    name: `${categoryName}-updated`,
                }),
            ),
    );

    // createExpense -- MAJOR units per prior evidence (float dollars in
    // "total", not "amount"); date must be full ISO8601 with Z.
    familyKeys.push(
        "POST /workspaces/{workspaceId}/expenses",
        "GET /workspaces/{workspaceId}/expenses/{expenseId}",
        "PUT /workspaces/{workspaceId}/expenses/{expenseId}",
        "GET /workspaces/{workspaceId}/expenses/{expenseId}/files/{fileId}",
        "DELETE /workspaces/{workspaceId}/expenses/{expenseId}",
    );
    const expense = await liveMutation(
        "POST /workspaces/{workspaceId}/expenses",
        "createExpense",
        {
            workspaceId,
            userId: testUserId,
            categoryId,
            amount: 100,
            date: new Date().toISOString(),
            notes: "clockify115-live-evidence-probe",
        },
        () =>
            withResponse(
                client.expenses.create({
                    workspaceId,
                    userId: testUserId,
                    categoryId,
                    amount: 100,
                    date: new Date().toISOString(),
                    notes: "clockify115-live-evidence-probe",
                }),
            ),
    );
    if (expense?.id) {
        const expenseId = expense.id;
        registerCleanup(`expense ${expenseId}`, () =>
            client.expenses.delete({ workspaceId, expenseId }),
        );
        await liveMutation(
            "GET /workspaces/{workspaceId}/expenses/{expenseId}",
            "getExpenseById",
            { workspaceId, expenseId },
            () => withResponse(client.expenses.get({ workspaceId, expenseId })),
        );
        await liveMutation(
            "PUT /workspaces/{workspaceId}/expenses/{expenseId}",
            "updateExpense",
            {
                workspaceId,
                expenseId,
                userId: testUserId,
                categoryId,
                amount: 100,
                date: new Date().toISOString(),
                notes: "clockify115-live-evidence-probe-2",
                changeFields: ["NOTES"],
            },
            () =>
                withResponse(
                    client.expenses.update({
                        workspaceId,
                        expenseId,
                        userId: testUserId,
                        categoryId,
                        amount: 100,
                        date: new Date().toISOString(),
                        notes: "clockify115-live-evidence-probe-2",
                        changeFields: ["NOTES"],
                    }),
                ),
        );
        // No file was attached to this throwaway expense -- downloadReceipt
        // is genuinely inapplicable here (prior evidence: no probe either).
        pushDocumented(
            "GET /workspaces/{workspaceId}/expenses/{expenseId}/files/{fileId}",
            "downloadExpenseReceipt",
        );
        await liveMutation(
            "DELETE /workspaces/{workspaceId}/expenses/{expenseId}",
            "deleteExpense",
            { workspaceId, expenseId },
            () => withResponse(client.expenses.delete({ workspaceId, expenseId })),
        );
        if (wasLiveSuccess("DELETE /workspaces/{workspaceId}/expenses/{expenseId}")) {
            retireCleanup(`expense ${expenseId}`);
        } else {
            residual = true;
            registerCleanup(`expense ${expenseId}`, () =>
                client.expenses.delete({ workspaceId, expenseId }),
            );
        }
    } else {
        for (const key of [
            "GET /workspaces/{workspaceId}/expenses/{expenseId}",
            "PUT /workspaces/{workspaceId}/expenses/{expenseId}",
            "GET /workspaces/{workspaceId}/expenses/{expenseId}/files/{fileId}",
            "DELETE /workspaces/{workspaceId}/expenses/{expenseId}",
        ]) {
            pushDocumented(key, operationIdFor(key));
        }
    }

    // Archive-then-delete for the category (soft archive is the real
    // mechanism per prior evidence; reuses no other op's wire call).
    familyKeys.push(
        "PATCH /workspaces/{workspaceId}/expenses/categories/{categoryId}/status",
        "DELETE /workspaces/{workspaceId}/expenses/categories/{categoryId}",
    );
    await liveMutation(
        "PATCH /workspaces/{workspaceId}/expenses/categories/{categoryId}/status",
        "archiveExpenseCategory",
        { workspaceId, categoryId, archived: true },
        () =>
            withResponse(
                client.expenseCategories.archive({ workspaceId, categoryId, archived: true }),
            ),
    );
    await liveMutation(
        "DELETE /workspaces/{workspaceId}/expenses/categories/{categoryId}",
        "deleteExpenseCategory",
        { workspaceId, categoryId },
        () => withResponse(client.expenseCategories.delete({ workspaceId, categoryId })),
    );
    if (wasLiveSuccess("DELETE /workspaces/{workspaceId}/expenses/categories/{categoryId}")) {
        retireCleanup(`expense category ${categoryId}`);
    } else {
        residual = true;
        registerCleanup(`expense category ${categoryId}`, () =>
            client.expenseCategories.delete({ workspaceId, categoryId }),
        );
    }

    if (residual) downgradeFamilyCleanup(familyKeys);
}

async function tierBInvoices() {
    // These writes can move a draft into a state whose cleanup cannot be
    // proven, or can create a response-lost duplicate whose server-selected
    // number is not guaranteed to retain the campaign prefix.
    pushProbeDocumented(
        "POST /workspaces/{workspaceId}/invoices/{invoiceId}/payments",
        "addInvoicePayment",
    );
    pushProbeDocumented(
        "PATCH /workspaces/{workspaceId}/invoices/{invoiceId}/status",
        "changeInvoiceStatus",
    );
    pushProbeDocumented(
        "POST /workspaces/{workspaceId}/invoices/{invoiceId}/duplicate",
        "duplicateInvoice",
    );
    if (!testUserId) {
        for (const key of [
            "POST /workspaces/{workspaceId}/invoices",
            "GET /workspaces/{workspaceId}/invoices/{invoiceId}",
            "PUT /workspaces/{workspaceId}/invoices/{invoiceId}",
            "DELETE /workspaces/{workspaceId}/invoices/{invoiceId}",
            "GET /workspaces/{workspaceId}/invoices/{invoiceId}/export",
            "POST /workspaces/{workspaceId}/invoices/{invoiceId}/items",
            "POST /workspaces/{workspaceId}/invoices/{invoiceId}/items/import",
            "DELETE /workspaces/{workspaceId}/invoices/{invoiceId}/items/{order}",
            "GET /workspaces/{workspaceId}/invoices/{invoiceId}/payments",
            "DELETE /workspaces/{workspaceId}/invoices/{invoiceId}/payments/{paymentId}",
        ]) {
            pushDocumented(key, operationIdFor(key));
        }
        return;
    }
    // Deliberately left unpromoted upstream (needs a real payable invoice
    // with real time/expense entries) and no proven direct delete path
    // for a post-payment invoice -- both stay probe-documented, not
    // fabricated as freshly live-verified.
    pushProbeDocumented(
        "POST /workspaces/{workspaceId}/invoices/{invoiceId}/items/import",
        "importInvoiceItems",
    );
    pushProbeDocumented(
        "DELETE /workspaces/{workspaceId}/invoices/{invoiceId}/payments/{paymentId}",
        "deleteInvoicePayment",
    );

    let residual = false;
    const familyKeys = [];
    let invoiceClientId;
    try {
        const { data: invoiceClient } = await withResponse(
            client.clients.create({ workspaceId, name: name("invclient") }),
        );
        invoiceClientId = invoiceClient?.id;
        if (invoiceClientId) {
            registerCleanup(`invoice client ${invoiceClientId}`, async () => {
                await client.clients.update({
                    workspaceId,
                    clientId: invoiceClientId,
                    body: { name: name("invclient"), archived: true },
                });
                await client.clients.delete({ workspaceId, clientId: invoiceClientId });
            });
        }
    } catch (err) {
        console.warn(`[setup-failed] invoice-client ${JSON.stringify(safeErrorSummary(err))}`);
    }
    const invoiceNumber = name("inv");
    familyKeys.push("POST /workspaces/{workspaceId}/invoices");
    const invoice = invoiceClientId
        ? await liveMutation(
              "POST /workspaces/{workspaceId}/invoices",
              "addInvoice",
              {
                  workspaceId,
                  clientId: invoiceClientId,
                  number: invoiceNumber,
                  issuedDate: new Date().toISOString(),
                  dueDate: FAR_FUTURE_DATE,
                  currency: "USD",
              },
              () =>
                  withResponse(
                      client.invoices.create({
                          workspaceId,
                          clientId: invoiceClientId,
                          number: invoiceNumber,
                          issuedDate: new Date().toISOString(),
                          dueDate: FAR_FUTURE_DATE,
                          currency: "USD",
                      }),
                  ),
          )
        : undefined;
    if (!invoiceClientId) {
        pushDocumented("POST /workspaces/{workspaceId}/invoices", "addInvoice");
    }
    if (!invoice?.id) {
        for (const key of [
            "GET /workspaces/{workspaceId}/invoices/{invoiceId}",
            "PUT /workspaces/{workspaceId}/invoices/{invoiceId}",
            "DELETE /workspaces/{workspaceId}/invoices/{invoiceId}",
            "GET /workspaces/{workspaceId}/invoices/{invoiceId}/export",
            "POST /workspaces/{workspaceId}/invoices/{invoiceId}/items",
            "DELETE /workspaces/{workspaceId}/invoices/{invoiceId}/items/{order}",
            "GET /workspaces/{workspaceId}/invoices/{invoiceId}/payments",
        ]) {
            pushDocumented(key, operationIdFor(key));
        }
        return;
    }
    const invoiceId = invoice.id;
    registerCleanup(`invoice ${invoiceId}`, () =>
        client.invoices.delete({ workspaceId, invoiceId }),
    );
    familyKeys.push(
        "GET /workspaces/{workspaceId}/invoices/{invoiceId}",
        "PUT /workspaces/{workspaceId}/invoices/{invoiceId}",
        "GET /workspaces/{workspaceId}/invoices/{invoiceId}/export",
        "POST /workspaces/{workspaceId}/invoices/{invoiceId}/items",
        "DELETE /workspaces/{workspaceId}/invoices/{invoiceId}/items/{order}",
        "GET /workspaces/{workspaceId}/invoices/{invoiceId}/payments",
        "DELETE /workspaces/{workspaceId}/invoices/{invoiceId}",
    );

    await liveMutation(
        "GET /workspaces/{workspaceId}/invoices/{invoiceId}",
        "getInvoiceById",
        { workspaceId, invoiceId },
        () => withResponse(client.invoices.get({ workspaceId, invoiceId })),
    );
    // updateInvoice is a full-replace, MAJOR footgun per prior evidence --
    // percent fields, not the GET's ×100-scaled ints.
    await liveMutation(
        "PUT /workspaces/{workspaceId}/invoices/{invoiceId}",
        "updateInvoice",
        {
            workspaceId,
            invoiceId,
            number: invoiceNumber,
            issuedDate: new Date().toISOString(),
            dueDate: FAR_FUTURE_DATE,
            currency: "USD",
        },
        () =>
            withResponse(
                client.invoices.update({
                    workspaceId,
                    invoiceId,
                    number: invoiceNumber,
                    issuedDate: new Date().toISOString(),
                    dueDate: FAR_FUTURE_DATE,
                    currency: "USD",
                }),
            ),
    );

    // itemType must name an existing workspace invoice item-type -- since
    // that's workspace-config-dependent and unresolved here, this stays
    // probe-documented rather than guessing a name that 404s.
    pushProbeDocumented(
        "POST /workspaces/{workspaceId}/invoices/{invoiceId}/items",
        "addInvoiceItem",
    );
    pushDocumented(
        "DELETE /workspaces/{workspaceId}/invoices/{invoiceId}/items/{order}",
        "deleteInvoiceItem",
    );

    await liveMutation(
        "GET /workspaces/{workspaceId}/invoices/{invoiceId}/payments",
        "getInvoicePayments",
        { workspaceId, invoiceId },
        () => withResponse(client.invoicePayments.list({ workspaceId, invoiceId })),
    );
    await liveMutation(
        "GET /workspaces/{workspaceId}/invoices/{invoiceId}/export",
        "exportInvoice",
        { workspaceId, invoiceId, userLocale: "en" },
        () => withResponse(client.invoices.export({ workspaceId, invoiceId, userLocale: "en" })),
    );

    await liveMutation(
        "DELETE /workspaces/{workspaceId}/invoices/{invoiceId}",
        "deleteInvoice",
        { workspaceId, invoiceId },
        () => withResponse(client.invoices.delete({ workspaceId, invoiceId })),
    );
    if (wasLiveSuccess("DELETE /workspaces/{workspaceId}/invoices/{invoiceId}")) {
        retireCleanup(`invoice ${invoiceId}`);
    } else {
        residual = true;
        registerCleanup(`invoice ${invoiceId}`, () =>
            client.invoices.delete({ workspaceId, invoiceId }),
        );
    }

    // The throwaway invoice client is archive-then-delete like any other
    // client (reuses the same wire operation already probed in
    // tierBClients, so applied directly rather than through liveMutation).
    if (invoiceClientId) {
        try {
            await withResponse(
                client.clients.update({
                    workspaceId,
                    clientId: invoiceClientId,
                    body: { name: name("invclient"), archived: true },
                }),
            );
            await withResponse(client.clients.delete({ workspaceId, clientId: invoiceClientId }));
            retireCleanup(`invoice client ${invoiceClientId}`);
        } catch (err) {
            console.warn(
                `[cleanup-failed] invoice-client ${JSON.stringify(safeErrorSummary(err))}`,
            );
            registerCleanup(`invoice client ${invoiceClientId}`, () =>
                client.clients.delete({ workspaceId, clientId: invoiceClientId }),
            );
        }
    }

    if (residual) downgradeFamilyCleanup(familyKeys);
}

async function tierBWebhooks() {
    const webhookUrl = "https://example.invalid/clockify115-live-evidence-probe";
    // Webhook names are capped at 30 characters. The per-run short prefix is
    // passed to aggregate cleanup alongside the standard run prefix, so an
    // ambiguous create remains discoverable without a dangerous broad match.
    const webhookName = `${webhookPrefix}wh`;
    const webhookUpdatedName = `${webhookPrefix}wh-up`;
    let residual = false;
    // GET .../webhooks/{webhookId}/logs was quarantined upstream in GOCLMCP
    // PHANTOM_PATHS on 2026-08-04/05: it was a wrong-verb duplicate of this
    // same POST, which was already live-success. See
    // spec/evidence/discrepancies.md `webhooks.logs.method-is-post-not-get`.
    const familyKeys = [
        "GET /workspaces/{workspaceId}/webhooks/{webhookId}",
        "PUT /workspaces/{workspaceId}/webhooks/{webhookId}",
        "GET /workspaces/{workspaceId}/webhooks/{webhookId}/statuses",
        "POST /workspaces/{workspaceId}/webhooks/{webhookId}/logs",
        "DELETE /workspaces/{workspaceId}/webhooks/{webhookId}",
    ];
    const webhook = await liveMutation(
        "POST /workspaces/{workspaceId}/webhooks",
        "createWebhook",
        {
            workspaceId,
            name: webhookName,
            url: webhookUrl,
            webhookEvent: "NEW_PROJECT",
            triggerSourceType: "WORKSPACE_ID",
            triggerSource: [],
        },
        () =>
            withResponse(
                client.webhooks.create({
                    workspaceId,
                    name: webhookName,
                    url: webhookUrl,
                    webhookEvent: "NEW_PROJECT",
                    triggerSourceType: "WORKSPACE_ID",
                    triggerSource: [],
                }),
            ),
    );
    if (!webhook?.id) {
        for (const key of familyKeys) pushDocumented(key, operationIdFor(key));
        return;
    }
    const webhookId = webhook.id;
    registerCleanup(`webhook ${webhookId}`, () =>
        client.webhooks.delete({ workspaceId, webhookId }),
    );
    // Webhook persistence is eventually consistent: a successful create can
    // be followed immediately by GET 400 / PUT 404. Poll only the safe list
    // read; the create and every subsequent mutation remain single-attempt.
    await waitForWebhookVisibility(webhookId);

    await liveMutation(
        "GET /workspaces/{workspaceId}/webhooks/{webhookId}",
        "getWebhookById",
        { workspaceId, webhookId },
        () => withResponse(client.webhooks.get({ workspaceId, webhookId })),
    );
    await liveMutation(
        "PUT /workspaces/{workspaceId}/webhooks/{webhookId}",
        "updateWebhook",
        {
            workspaceId,
            webhookId,
            name: webhookUpdatedName,
            url: webhookUrl,
            webhookEvent: "NEW_PROJECT",
            triggerSourceType: "WORKSPACE_ID",
            triggerSource: [],
        },
        () =>
            withResponse(
                client.webhooks.update({
                    workspaceId,
                    webhookId,
                    name: webhookUpdatedName,
                    url: webhookUrl,
                    webhookEvent: "NEW_PROJECT",
                    triggerSourceType: "WORKSPACE_ID",
                    triggerSource: [],
                }),
            ),
    );
    await liveMutation(
        "GET /workspaces/{workspaceId}/webhooks/{webhookId}/statuses",
        "getWebhookEventStatusesWithLatestLog",
        { workspaceId, webhookId },
        () =>
            withResponse(
                client.webhooks.getWebhookEventStatusesWithLatestLog({ workspaceId, webhookId }),
            ),
    );
    await liveMutation(
        "POST /workspaces/{workspaceId}/webhooks/{webhookId}/logs",
        "getWebhookLogs",
        { workspaceId, webhookId, sortByNewest: true },
        () =>
            withResponse(
                client.webhooks.searchLogs({ workspaceId, webhookId, sortByNewest: true }),
            ),
    );

    await liveMutation(
        "DELETE /workspaces/{workspaceId}/webhooks/{webhookId}",
        "deleteWebhook",
        { workspaceId, webhookId },
        () => withResponse(client.webhooks.delete({ workspaceId, webhookId })),
    );
    if (wasLiveSuccess("DELETE /workspaces/{workspaceId}/webhooks/{webhookId}")) {
        retireCleanup(`webhook ${webhookId}`);
    } else {
        residual = true;
        registerCleanup(`webhook ${webhookId}`, () =>
            client.webhooks.delete({ workspaceId, webhookId }),
        );
    }
    if (residual)
        downgradeFamilyCleanup(["POST /workspaces/{workspaceId}/webhooks", ...familyKeys]);
}

async function tierBTimeOff() {
    if (!testUserId) {
        for (const key of [
            "POST /workspaces/{workspaceId}/time-off/policies",
            "GET /workspaces/{workspaceId}/time-off/policies/{policyId}",
            "PUT /workspaces/{workspaceId}/time-off/policies/{policyId}",
            "PATCH /workspaces/{workspaceId}/time-off/policies/{policyId}",
            "DELETE /workspaces/{workspaceId}/time-off/policies/{policyId}",
            "GET /workspaces/{workspaceId}/time-off/balance/policy/{policyId}",
            "PATCH /workspaces/{workspaceId}/time-off/balance/policy/{policyId}",
            "POST /workspaces/{workspaceId}/time-off/policies/{policyId}/requests",
            "POST /workspaces/{workspaceId}/time-off/policies/{policyId}/users/{userId}/requests",
            "DELETE /workspaces/{workspaceId}/time-off/policies/{policyId}/requests/{requestId}",
        ]) {
            pushDocumented(key, operationIdFor(key));
        }
        return;
    }
    // Terminal/undeletable per prior evidence -- do not create more
    // permanent litter (only PENDING requests are deletable; a REJECTED
    // or APPROVED status is a one-way door).
    pushProbeDocumented(
        "PATCH /workspaces/{workspaceId}/time-off/policies/{policyId}/requests/{requestId}",
        "changeTimeOffRequestStatus",
    );
    const policyName = name("timeoffpolicy");
    // Confirmed live 2026-07-26: a sparse create body 400s "must not be
    // null" with no field name -- contrary to the spec's only-`name`-
    // required claim, the server needs negativeBalance, approve, and
    // automaticTimeEntryCreation (with defaultEntities, even all-null)
    // fully populated. Reverse-engineered by mimicking an existing real
    // policy's GET shape field-for-field until create stopped 400ing.
    const policyBody = {
        name: policyName,
        timeUnit: "DAYS",
        everyoneIncludingNew: true,
        allowNegativeBalance: true,
        negativeBalance: { amount: 10, timeUnit: "DAYS", period: "YEAR", shouldReset: false },
        allowHalfDay: true,
        approve: {
            requiresApproval: true,
            teamManagers: false,
            specificMembers: false,
            userIds: [],
        },
        automaticTimeEntryCreation: {
            enabled: true,
            defaultEntities: { projectId: null, taskId: null },
        },
    };
    const policy = await liveMutation(
        "POST /workspaces/{workspaceId}/time-off/policies",
        "createTimeOffPolicy",
        { workspaceId, ...policyBody },
        () => withResponse(client.timeOffPolicies.create({ workspaceId, ...policyBody })),
    );
    if (!policy?.id) {
        for (const key of [
            "GET /workspaces/{workspaceId}/time-off/policies/{policyId}",
            "PUT /workspaces/{workspaceId}/time-off/policies/{policyId}",
            "PATCH /workspaces/{workspaceId}/time-off/policies/{policyId}",
            "DELETE /workspaces/{workspaceId}/time-off/policies/{policyId}",
            "GET /workspaces/{workspaceId}/time-off/balance/policy/{policyId}",
            "PATCH /workspaces/{workspaceId}/time-off/balance/policy/{policyId}",
            "POST /workspaces/{workspaceId}/time-off/policies/{policyId}/requests",
            "POST /workspaces/{workspaceId}/time-off/policies/{policyId}/users/{userId}/requests",
            "DELETE /workspaces/{workspaceId}/time-off/policies/{policyId}/requests/{requestId}",
        ]) {
            pushDocumented(key, operationIdFor(key));
        }
        return;
    }
    const policyId = policy.id;
    registerCleanup(`time-off policy ${policyId}`, async () => {
        await client.timeOffPolicies.updateStatus({ workspaceId, policyId, status: "ARCHIVED" });
        await client.timeOffPolicies.delete({ workspaceId, policyId });
    });
    let residual = false;
    const familyKeys = [
        "GET /workspaces/{workspaceId}/time-off/policies/{policyId}",
        "PUT /workspaces/{workspaceId}/time-off/policies/{policyId}",
        "PATCH /workspaces/{workspaceId}/time-off/policies/{policyId}",
        "GET /workspaces/{workspaceId}/time-off/balance/policy/{policyId}",
        "PATCH /workspaces/{workspaceId}/time-off/balance/policy/{policyId}",
        "POST /workspaces/{workspaceId}/time-off/policies/{policyId}/requests",
        "POST /workspaces/{workspaceId}/time-off/policies/{policyId}/users/{userId}/requests",
        "DELETE /workspaces/{workspaceId}/time-off/policies/{policyId}/requests/{requestId}",
        "DELETE /workspaces/{workspaceId}/time-off/policies/{policyId}",
    ];

    await liveMutation(
        "GET /workspaces/{workspaceId}/time-off/policies/{policyId}",
        "getTimeOffPolicy",
        { workspaceId, policyId },
        () => withResponse(client.timeOffPolicies.get({ workspaceId, policyId })),
    );
    // Full-replace PUT -- needs the same fully-populated shape as create
    // (negativeBalance/approve/automaticTimeEntryCreation), confirmed live
    // 2026-07-26; users/userGroups would be sent FLAT as
    // {contains,ids,status} filter shapes (not the GET's flat userIds[])
    // if used instead of everyoneIncludingNew.
    const policyUpdateBody = { ...policyBody, name: `${policyName}-updated` };
    await liveMutation(
        "PUT /workspaces/{workspaceId}/time-off/policies/{policyId}",
        "updateTimeOffPolicy",
        { workspaceId, policyId, ...policyUpdateBody },
        () =>
            withResponse(
                client.timeOffPolicies.update({ workspaceId, policyId, ...policyUpdateBody }),
            ),
    );
    await liveMutation(
        "PATCH /workspaces/{workspaceId}/time-off/policies/{policyId}",
        "changeTimeOffPolicyStatus",
        { workspaceId, policyId, status: "ACTIVE" },
        () =>
            withResponse(
                client.timeOffPolicies.updateStatus({ workspaceId, policyId, status: "ACTIVE" }),
            ),
    );

    await liveMutation(
        "GET /workspaces/{workspaceId}/time-off/balance/policy/{policyId}",
        "getBalancesForPolicy",
        { workspaceId, policyId },
        () => withResponse(client.balances.listForPolicy({ workspaceId, policyId })),
    );
    // Mutates a real balance for testUserId with no proven revert path --
    // stays probe-documented rather than a fresh live mutation.
    pushProbeDocumented(
        "PATCH /workspaces/{workspaceId}/time-off/balance/policy/{policyId}",
        "updateBalance",
    );

    // Far-future dates avoid real approval-notification side effects
    // (per prior evidence); DAYS-unit policy wants {start,days}.
    const requestNote = name("time-off-request");
    const request = await liveMutation(
        "POST /workspaces/{workspaceId}/time-off/policies/{policyId}/requests",
        "createTimeOffRequest",
        {
            workspaceId,
            policyId,
            note: requestNote,
            timeOffPeriod: { period: { start: "2099-06-01", days: 1 } },
        },
        () =>
            withResponse(
                client.timeOff.submit({
                    workspaceId,
                    policyId,
                    note: requestNote,
                    timeOffPeriod: { period: { start: "2099-06-01", days: 1 } },
                }),
            ),
    );
    const requestId = Array.isArray(request) ? request[0]?.id : request?.id;
    if (requestId) {
        registerCleanup(`time-off request ${requestId}`, () =>
            client.timeOff.withdraw({ workspaceId, policyId, requestId }),
        );
        await liveMutation(
            "DELETE /workspaces/{workspaceId}/time-off/policies/{policyId}/requests/{requestId}",
            "deleteTimeOffRequest",
            { workspaceId, policyId, requestId },
            () => withResponse(client.timeOff.withdraw({ workspaceId, policyId, requestId })),
        );
        if (
            wasLiveSuccess(
                "DELETE /workspaces/{workspaceId}/time-off/policies/{policyId}/requests/{requestId}",
            )
        ) {
            retireCleanup(`time-off request ${requestId}`);
        } else {
            residual = true;
            registerCleanup(`time-off request ${requestId}`, () =>
                client.timeOff.withdraw({ workspaceId, policyId, requestId }),
            );
        }
    } else {
        pushDocumented(
            "DELETE /workspaces/{workspaceId}/time-off/policies/{policyId}/requests/{requestId}",
            "deleteTimeOffRequest",
        );
    }

    const requestForUserNote = name("time-off-request-user");
    const requestForUser = await liveMutation(
        "POST /workspaces/{workspaceId}/time-off/policies/{policyId}/users/{userId}/requests",
        "createTimeOffRequestForUser",
        {
            workspaceId,
            policyId,
            userId: testUserId,
            note: requestForUserNote,
            timeOffPeriod: { period: { start: "2099-06-01", days: 1 } },
        },
        () =>
            withResponse(
                client.timeOff.submitForUser({
                    workspaceId,
                    policyId,
                    userId: testUserId,
                    note: requestForUserNote,
                    timeOffPeriod: { period: { start: "2099-06-01", days: 1 } },
                }),
            ),
    );
    const requestForUserId = Array.isArray(requestForUser)
        ? requestForUser[0]?.id
        : requestForUser?.id;
    if (requestForUserId) {
        registerCleanup(`time-off request ${requestForUserId}`, () =>
            client.timeOff.withdraw({ workspaceId, policyId, requestId: requestForUserId }),
        );
        try {
            await withResponse(
                client.timeOff.withdraw({ workspaceId, policyId, requestId: requestForUserId }),
            );
            retireCleanup(`time-off request ${requestForUserId}`);
        } catch (err) {
            residual = true;
            console.warn(
                `[cleanup-failed] time-off-request ${JSON.stringify(safeErrorSummary(err))}`,
            );
            registerCleanup(`time-off request ${requestForUserId}`, () =>
                client.timeOff.withdraw({ workspaceId, policyId, requestId: requestForUserId }),
            );
        }
    }

    // Archive first -- confirmed live 2026-07-26 that an immediate
    // delete of an active policy 400s; ARCHIVED is the real enum value
    // (not "INACTIVE"). This reuses the changeTimeOffPolicyStatus wire
    // operation already probed above, so it's applied directly.
    try {
        await withResponse(
            client.timeOffPolicies.updateStatus({ workspaceId, policyId, status: "ARCHIVED" }),
        );
    } catch (err) {
        console.warn(
            `[cleanup-failed] archive-time-off-policy ${JSON.stringify(safeErrorSummary(err))}`,
        );
    }
    await liveMutation(
        "DELETE /workspaces/{workspaceId}/time-off/policies/{policyId}",
        "deleteTimeOffPolicy",
        { workspaceId, policyId },
        () => withResponse(client.timeOffPolicies.delete({ workspaceId, policyId })),
    );
    if (wasLiveSuccess("DELETE /workspaces/{workspaceId}/time-off/policies/{policyId}")) {
        retireCleanup(`time-off policy ${policyId}`);
    } else {
        residual = true;
        registerCleanup(`time-off policy ${policyId}`, () =>
            client.timeOffPolicies.delete({ workspaceId, policyId }),
        );
    }
    if (residual)
        downgradeFamilyCleanup(["POST /workspaces/{workspaceId}/time-off/policies", ...familyKeys]);
}

async function tierBScheduling() {
    // changeRecurringPeriod 400s "cannot be longer than one week" against
    // a full 7-day assignment (confirmed live 2026-07-26) -- use a short
    // span for this family's assignment instead of the shared 7-day
    // FAR_FUTURE_DATE_END.
    const SCHED_END = "2099-06-03T00:00:00Z";

    if (!testUserId || !testProjectId) {
        for (const key of [
            "POST /workspaces/{workspaceId}/scheduling/assignments/recurring",
            "PATCH /workspaces/{workspaceId}/scheduling/assignments/recurring/{assignmentId}",
            "DELETE /workspaces/{workspaceId}/scheduling/assignments/recurring/{assignmentId}",
            "PUT /workspaces/{workspaceId}/scheduling/assignments/series/{assignmentId}",
            "POST /workspaces/{workspaceId}/scheduling/assignments/{assignmentId}/copy",
        ]) {
            pushDocumented(key, operationIdFor(key));
        }
        pushProbeDocumented(
            "PUT /workspaces/{workspaceId}/scheduling/assignments/publish",
            "publishAssignments",
        );
        return;
    }
    let residual = false;
    const familyKeys = [
        "PATCH /workspaces/{workspaceId}/scheduling/assignments/recurring/{assignmentId}",
        "PUT /workspaces/{workspaceId}/scheduling/assignments/series/{assignmentId}",
        "PUT /workspaces/{workspaceId}/scheduling/assignments/publish",
        "POST /workspaces/{workspaceId}/scheduling/assignments/{assignmentId}/copy",
        "DELETE /workspaces/{workspaceId}/scheduling/assignments/recurring/{assignmentId}",
    ];

    // testProjectId (the first project discovered live) is archived --
    // confirmed live 2026-07-26 "You can not create entities for
    // archived project" -- so scheduling needs its own active throwaway
    // project rather than reusing it.
    let schedulingProjectId;
    try {
        const { data: schedulingProject } = await withResponse(
            client.projects.create({ workspaceId, name: name("schedproj") }),
        );
        schedulingProjectId = schedulingProject?.id;
    } catch (err) {
        console.warn(`[setup-failed] scheduling-project ${JSON.stringify(safeErrorSummary(err))}`);
    }
    if (!schedulingProjectId) {
        for (const key of [
            "POST /workspaces/{workspaceId}/scheduling/assignments/recurring",
            ...familyKeys,
        ])
            pushDocumented(key, operationIdFor(key));
        return;
    }
    registerCleanup(`scheduling project ${schedulingProjectId}`, async () => {
        await client.projects.update({
            workspaceId,
            projectId: schedulingProjectId,
            name: name("schedproj"),
            archived: true,
        });
        await client.projects.delete({ workspaceId, projectId: schedulingProjectId });
    });

    // createRecurring's 201 returns an ARRAY of SchedulingAssignment (even
    // for one-off creates) per prior evidence.
    const created = await liveMutation(
        "POST /workspaces/{workspaceId}/scheduling/assignments/recurring",
        "createRecurringAssignment",
        {
            workspaceId,
            userId: testUserId,
            projectId: schedulingProjectId,
            start: FAR_FUTURE_DATE,
            end: SCHED_END,
            hoursPerDay: 1,
        },
        () =>
            withResponse(
                client.scheduling.createRecurring({
                    workspaceId,
                    userId: testUserId,
                    projectId: schedulingProjectId,
                    start: FAR_FUTURE_DATE,
                    end: SCHED_END,
                    hoursPerDay: 1,
                }),
            ),
    );
    const assignmentId = Array.isArray(created) ? created[0]?.id : created?.id;
    if (!assignmentId) {
        for (const key of familyKeys) pushDocumented(key, operationIdFor(key));
        try {
            await withResponse(
                client.projects.update({
                    workspaceId,
                    projectId: schedulingProjectId,
                    name: name("schedproj"),
                    archived: true,
                }),
            );
            await withResponse(
                client.projects.delete({ workspaceId, projectId: schedulingProjectId }),
            );
            retireCleanup(`scheduling project ${schedulingProjectId}`);
        } catch (err) {
            registerCleanup(`scheduling project ${schedulingProjectId}`, () =>
                client.projects.delete({ workspaceId, projectId: schedulingProjectId }),
            );
        }
        return;
    }
    registerCleanup(`recurring assignment ${assignmentId}`, () =>
        client.scheduling.deleteRecurring({ workspaceId, assignmentId }),
    );

    await liveMutation(
        "PATCH /workspaces/{workspaceId}/scheduling/assignments/recurring/{assignmentId}",
        "updateRecurringAssignment",
        { workspaceId, assignmentId, start: FAR_FUTURE_DATE, end: SCHED_END, hoursPerDay: 2 },
        () =>
            withResponse(
                client.scheduling.updateRecurring({
                    workspaceId,
                    assignmentId,
                    start: FAR_FUTURE_DATE,
                    end: SCHED_END,
                    hoursPerDay: 2,
                }),
            ),
    );
    // changeRecurringPeriod's real body is {repeat, weeks} (a different
    // shape from what its SDK method name implies) per the generated
    // request whitelist, confirmed against wrapper/src directly.
    await liveMutation(
        "PUT /workspaces/{workspaceId}/scheduling/assignments/series/{assignmentId}",
        "changeRecurringPeriod",
        { workspaceId, assignmentId, repeat: true, weeks: 1 },
        () =>
            withResponse(
                client.scheduling.changeRecurringPeriod({
                    workspaceId,
                    assignmentId,
                    repeat: true,
                    weeks: 1,
                }),
            ),
    );
    // Publishing is user-and-range scoped, not assignment scoped. Even with
    // notifications disabled it could publish a pre-existing assignment for
    // the sacrificial user, and there is no symmetric unpublish operation.
    pushProbeDocumented(
        "PUT /workspaces/{workspaceId}/scheduling/assignments/publish",
        "publishAssignments",
    );
    const copied = await liveMutation(
        "POST /workspaces/{workspaceId}/scheduling/assignments/{assignmentId}/copy",
        "copyScheduledAssignment",
        { workspaceId, assignmentId, userId: testUserId },
        () =>
            withResponse(client.scheduling.copy({ workspaceId, assignmentId, userId: testUserId })),
    );
    const copiedId = Array.isArray(copied) ? copied[0]?.id : copied?.id;
    if (copiedId && copiedId !== assignmentId) {
        registerCleanup(`recurring assignment ${copiedId}`, () =>
            client.scheduling.deleteRecurring({ workspaceId, assignmentId: copiedId }),
        );
        try {
            await withResponse(
                client.scheduling.deleteRecurring({ workspaceId, assignmentId: copiedId }),
            );
            retireCleanup(`recurring assignment ${copiedId}`);
        } catch (err) {
            console.warn(
                `[cleanup-failed] copied-scheduling-assignment ${JSON.stringify(safeErrorSummary(err))}`,
            );
            registerCleanup(`recurring assignment ${copiedId}`, () =>
                client.scheduling.deleteRecurring({ workspaceId, assignmentId: copiedId }),
            );
        }
    }

    await liveMutation(
        "DELETE /workspaces/{workspaceId}/scheduling/assignments/recurring/{assignmentId}",
        "deleteRecurringAssignment",
        { workspaceId, assignmentId },
        () => withResponse(client.scheduling.deleteRecurring({ workspaceId, assignmentId })),
    );
    if (
        wasLiveSuccess(
            "DELETE /workspaces/{workspaceId}/scheduling/assignments/recurring/{assignmentId}",
        )
    ) {
        retireCleanup(`recurring assignment ${assignmentId}`);
    } else {
        residual = true;
        registerCleanup(`recurring assignment ${assignmentId}`, () =>
            client.scheduling.deleteRecurring({ workspaceId, assignmentId }),
        );
    }

    try {
        await withResponse(
            client.projects.update({
                workspaceId,
                projectId: schedulingProjectId,
                name: name("schedproj"),
                archived: true,
            }),
        );
        await withResponse(client.projects.delete({ workspaceId, projectId: schedulingProjectId }));
        retireCleanup(`scheduling project ${schedulingProjectId}`);
    } catch (err) {
        console.warn(
            `[cleanup-failed] scheduling-project ${JSON.stringify(safeErrorSummary(err))}`,
        );
        registerCleanup(`scheduling project ${schedulingProjectId}`, () =>
            client.projects.delete({ workspaceId, projectId: schedulingProjectId }),
        );
    }

    if (residual)
        downgradeFamilyCleanup([
            "POST /workspaces/{workspaceId}/scheduling/assignments/recurring",
            ...familyKeys,
        ]);
}

async function tierBSharedReports() {
    let residual = false;
    const familyKeys = [
        "GET /shared-reports/{sharedReportId}",
        "PUT /workspaces/{workspaceId}/shared-reports/{sharedReportId}",
        "DELETE /workspaces/{workspaceId}/shared-reports/{sharedReportId}",
    ];
    const reportName = name("sharedreport");
    // Field names are `type` (not reportType) and `filter` singular
    // (not filters) per prior evidence.
    const report = await liveMutation(
        "POST /workspaces/{workspaceId}/shared-reports",
        "postWorkspacesWorkspaceIdSharedReports",
        {
            workspaceId,
            name: reportName,
            type: "SUMMARY",
            isPublic: false,
            filter: {
                exportType: "JSON_V1",
                dateRangeStart: FAR_FUTURE_DATE,
                dateRangeEnd: FAR_FUTURE_DATE_END,
                summaryFilter: { groups: ["USER"] },
            },
        },
        () =>
            withResponse(
                client.sharedReports.create({
                    workspaceId,
                    name: reportName,
                    type: "SUMMARY",
                    isPublic: false,
                    filter: {
                        exportType: "JSON_V1",
                        dateRangeStart: FAR_FUTURE_DATE,
                        dateRangeEnd: FAR_FUTURE_DATE_END,
                        summaryFilter: { groups: ["USER"] },
                    },
                }),
            ),
    );
    if (!report?.id) {
        for (const key of familyKeys) pushDocumented(key, operationIdFor(key));
        return;
    }
    const sharedReportId = report.id;
    registerCleanup(`shared report ${sharedReportId}`, () =>
        client.sharedReports.delete({ workspaceId, sharedReportId }),
    );

    // Bare-id GET (no /workspaces/{id} prefix) is the real single-report
    // read route per prior evidence -- the workspace-prefixed GET is 405.
    await liveMutation(
        "GET /shared-reports/{sharedReportId}",
        "getSharedReportsSharedReportId",
        { sharedReportId, exportType: "JSON_V1" },
        () => withResponse(client.sharedReports.view({ sharedReportId, exportType: "JSON_V1" })),
    );

    // Merge semantics per prior evidence -- a name-only PUT keeps filter.
    await liveMutation(
        "PUT /workspaces/{workspaceId}/shared-reports/{sharedReportId}",
        "putWorkspacesWorkspaceIdSharedReportsSharedReportId",
        { workspaceId, sharedReportId, name: `${reportName}-updated` },
        () =>
            withResponse(
                client.sharedReports.update({
                    workspaceId,
                    sharedReportId,
                    name: `${reportName}-updated`,
                }),
            ),
    );
    await liveMutation(
        "DELETE /workspaces/{workspaceId}/shared-reports/{sharedReportId}",
        "deleteWorkspacesWorkspaceIdSharedReportsSharedReportId",
        { workspaceId, sharedReportId },
        () => withResponse(client.sharedReports.delete({ workspaceId, sharedReportId })),
    );
    if (wasLiveSuccess("DELETE /workspaces/{workspaceId}/shared-reports/{sharedReportId}")) {
        retireCleanup(`shared report ${sharedReportId}`);
    } else {
        residual = true;
        registerCleanup(`shared report ${sharedReportId}`, () =>
            client.sharedReports.delete({ workspaceId, sharedReportId }),
        );
    }
    if (residual)
        downgradeFamilyCleanup(["POST /workspaces/{workspaceId}/shared-reports", ...familyKeys]);

    // Bare-id GET/export -- read-only, safe against the entity that just
    // existed above; probe it before delete would be ideal but the
    // schema/list route already gives broad read coverage, so this
    // dedicated single-report GET stays documented if not separately
    // exercised (no canonical op depends on it beyond what's covered).
}

async function tierBUserGroups() {
    if (!testUserId) {
        for (const key of [
            "PUT /workspaces/{workspaceId}/user-groups/{groupId}",
            "DELETE /workspaces/{workspaceId}/user-groups/{groupId}",
            "POST /workspaces/{workspaceId}/user-groups/{groupId}/users",
            "DELETE /workspaces/{workspaceId}/user-groups/{groupId}/users/{userId}",
        ]) {
            pushDocumented(key, operationIdFor(key));
        }
        return;
    }
    let residual = false;
    const familyKeys = [
        "PUT /workspaces/{workspaceId}/user-groups/{groupId}",
        "POST /workspaces/{workspaceId}/user-groups/{groupId}/users",
        "DELETE /workspaces/{workspaceId}/user-groups/{groupId}/users/{userId}",
        "DELETE /workspaces/{workspaceId}/user-groups/{groupId}",
    ];
    const groupName = name("group");
    const group = await liveMutation(
        "POST /workspaces/{workspaceId}/user-groups",
        "addNewGroup",
        { workspaceId, name: groupName },
        () => withResponse(client.userGroups.create({ workspaceId, name: groupName })),
    );
    if (!group?.id) {
        for (const key of familyKeys) pushDocumented(key, operationIdFor(key));
        return;
    }
    const groupId = group.id;
    registerCleanup(`user group ${groupId}`, () =>
        client.userGroups.delete({ workspaceId, groupId }),
    );

    await liveMutation(
        "PUT /workspaces/{workspaceId}/user-groups/{groupId}",
        "updateGroup",
        { workspaceId, groupId, name: `${groupName}-updated` },
        () =>
            withResponse(
                client.userGroups.update({ workspaceId, groupId, name: `${groupName}-updated` }),
            ),
    );
    await liveMutation(
        "POST /workspaces/{workspaceId}/user-groups/{groupId}/users",
        "addUsersToGroup",
        { workspaceId, groupId, userId: testUserId },
        () =>
            withResponse(
                client.userGroups.addMembers({ workspaceId, groupId, userId: testUserId }),
            ),
    );
    await liveMutation(
        "DELETE /workspaces/{workspaceId}/user-groups/{groupId}/users/{userId}",
        "removeUserFromGroup",
        { workspaceId, groupId, userId: testUserId },
        () =>
            withResponse(
                client.userGroups.removeMember({ workspaceId, groupId, userId: testUserId }),
            ),
    );

    await liveMutation(
        "DELETE /workspaces/{workspaceId}/user-groups/{groupId}",
        "deleteGroup",
        { workspaceId, groupId },
        () => withResponse(client.userGroups.delete({ workspaceId, groupId })),
    );
    if (wasLiveSuccess("DELETE /workspaces/{workspaceId}/user-groups/{groupId}")) {
        retireCleanup(`user group ${groupId}`);
    } else {
        residual = true;
        registerCleanup(`user group ${groupId}`, () =>
            client.userGroups.delete({ workspaceId, groupId }),
        );
    }
    if (residual)
        downgradeFamilyCleanup(["POST /workspaces/{workspaceId}/user-groups", ...familyKeys]);
}

async function tierBHolidays() {
    if (!testUserId) {
        for (const key of [
            "PUT /workspaces/{workspaceId}/holidays/{holidayId}",
            "DELETE /workspaces/{workspaceId}/holidays/{holidayId}",
        ]) {
            pushDocumented(key, operationIdFor(key));
        }
        return;
    }
    let residual = false;
    const familyKeys = [
        "PUT /workspaces/{workspaceId}/holidays/{holidayId}",
        "DELETE /workspaces/{workspaceId}/holidays/{holidayId}",
    ];
    // Live boundary, re-confirmed 2026-08-04: update accepts 50 characters
    // and rejects 51, even though create accepts longer names. Keep both
    // uniquely-prefixed campaign names below that undocumented PUT limit.
    const holidayName = name("h");
    const updatedHolidayName = name("u");
    const datePeriod = { startDate: "2099-06-01", endDate: "2099-06-01" };
    const holiday = await liveMutation(
        "POST /workspaces/{workspaceId}/holidays",
        "createHoliday",
        {
            workspaceId,
            name: holidayName,
            datePeriod,
            occursAnnually: false,
            everyoneIncludingNew: true,
        },
        () =>
            withResponse(
                client.holidays.create({
                    workspaceId,
                    name: holidayName,
                    datePeriod,
                    occursAnnually: false,
                    everyoneIncludingNew: true,
                }),
            ),
    );
    if (!holiday?.id) {
        for (const key of familyKeys) pushDocumented(key, operationIdFor(key));
        return;
    }
    const holidayId = holiday.id;
    registerCleanup(`holiday ${holidayId}`, () =>
        client.holidays.delete({ workspaceId, holidayId }),
    );

    // Full-replace PUT per prior evidence -- omitted fields 400.
    await liveMutation(
        "PUT /workspaces/{workspaceId}/holidays/{holidayId}",
        "updateHoliday",
        {
            workspaceId,
            holidayId,
            name: updatedHolidayName,
            datePeriod,
            occursAnnually: false,
            everyoneIncludingNew: true,
        },
        () =>
            withResponse(
                client.holidays.update({
                    workspaceId,
                    holidayId,
                    name: updatedHolidayName,
                    datePeriod,
                    occursAnnually: false,
                    everyoneIncludingNew: true,
                }),
            ),
    );
    await liveMutation(
        "DELETE /workspaces/{workspaceId}/holidays/{holidayId}",
        "deleteHoliday",
        { workspaceId, holidayId },
        () => withResponse(client.holidays.delete({ workspaceId, holidayId })),
    );
    if (wasLiveSuccess("DELETE /workspaces/{workspaceId}/holidays/{holidayId}")) {
        retireCleanup(`holiday ${holidayId}`);
    } else {
        residual = true;
        registerCleanup(`holiday ${holidayId}`, () =>
            client.holidays.delete({ workspaceId, holidayId }),
        );
    }
    if (residual)
        downgradeFamilyCleanup(["POST /workspaces/{workspaceId}/holidays", ...familyKeys]);
}

async function tierBApprovals() {
    // Approval submission/resubmission changes shared workflow state and an
    // ambiguous POST cannot be discovered reliably by the governed prefix
    // cleanup. Keep these operations explicitly unpromoted until an exact
    // absence query is available.
    for (const [operationKey, operationId] of [
        ["POST /workspaces/{workspaceId}/approval-requests", "submitApprovalRequest"],
        [
            "PATCH /workspaces/{workspaceId}/approval-requests/{approvalRequestId}",
            "updateApprovalRequest",
        ],
        [
            "POST /workspaces/{workspaceId}/approval-requests/resubmit-entries-for-approval",
            "resubmitEntriesForApproval",
        ],
        [
            "POST /workspaces/{workspaceId}/approval-requests/users/{userId}",
            "submitApprovalRequestForUser",
        ],
        [
            "POST /workspaces/{workspaceId}/approval-requests/users/{userId}/resubmit-entries-for-approval",
            "resubmitEntriesForApprovalForUser",
        ],
    ]) {
        pushProbeDocumented(operationKey, operationId);
    }
}

async function tierBFiles() {
    // The API exposes no delete or expiry contract for a successful upload.
    // A fresh campaign therefore must not create persistent file litter; the
    // prior live-success is an explicit safety demotion in the receipt.
    pushProbeDocumented("POST /file/image", "uploadImage");
}

async function tierBUserRoles() {
    if (!testUserId || !testProjectId) {
        for (const key of [
            "POST /workspaces/{workspaceId}/users/{userId}/roles",
            "DELETE /workspaces/{workspaceId}/users/{userId}/roles",
        ]) {
            pushDocumented(key, operationIdFor(key));
        }
        pushDocumented(
            "PUT /workspaces/{workspaceId}/users/{userId}/custom-field/{customFieldId}/value",
            "updateUserCustomFieldValue",
        );
        return;
    }
    // The role endpoints expose no direct read-back for this exact
    // user/entity/role tuple. A successful DELETE is not enough to distinguish
    // absence from idempotent acceptance, so the former live rows are
    // deliberately safety-demoted instead of repeating an unverifiable write.
    pushProbeDocumented(
        "POST /workspaces/{workspaceId}/users/{userId}/roles",
        "giveUserManagerRole",
    );
    pushProbeDocumented(
        "DELETE /workspaces/{workspaceId}/users/{userId}/roles",
        "removeUserManagerRole",
    );

    // updateUserCustomFieldValue -- prior evidence flags this as a
    // sandbox-data gap (no USER-entity field existed), not a dead route.
    // Create a throwaway USER-entity field, set its value on the pinned
    // test user, then delete the field entirely (fully reversible: the
    // value is metadata scoped to a field this run also destroys).
    let userFieldId;
    try {
        const { data: field } = await withResponse(
            client.customFields.createForWorkspace({
                workspaceId,
                name: name("userfield"),
                type: "TXT",
                entityType: "USER",
            }),
        );
        userFieldId = field?.id;
    } catch (err) {
        console.warn(`[setup-failed] user-custom-field ${JSON.stringify(safeErrorSummary(err))}`);
    }
    if (userFieldId) {
        registerCleanup(`user custom field ${userFieldId}`, () =>
            client.customFields.deleteForWorkspace({ workspaceId, customFieldId: userFieldId }),
        );
        await liveMutation(
            "PUT /workspaces/{workspaceId}/users/{userId}/custom-field/{customFieldId}/value",
            "updateUserCustomFieldValue",
            {
                workspaceId,
                userId: testUserId,
                customFieldId: userFieldId,
                value: "clockify115-live-evidence-probe",
            },
            () =>
                withResponse(
                    client.users.updateUserCustomFieldValue({
                        workspaceId,
                        userId: testUserId,
                        customFieldId: userFieldId,
                        value: "clockify115-live-evidence-probe",
                    }),
                ),
        );
        try {
            await withResponse(
                client.customFields.deleteForWorkspace({ workspaceId, customFieldId: userFieldId }),
            );
            retireCleanup(`user custom field ${userFieldId}`);
        } catch (err) {
            console.warn(
                `[cleanup-failed] user-custom-field ${JSON.stringify(safeErrorSummary(err))}`,
            );
            registerCleanup(`user custom field ${userFieldId}`, () =>
                client.customFields.deleteForWorkspace({ workspaceId, customFieldId: userFieldId }),
            );
        }
    } else {
        pushDocumented(
            "PUT /workspaces/{workspaceId}/users/{userId}/custom-field/{customFieldId}/value",
            "updateUserCustomFieldValue",
        );
    }
}

/**
 * Operations deliberately left at "documented"/"probe-documented" rather
 * than freshly live-verified: irreversible or high-blast-radius
 * (new-workspace creation, real user invites, one-way webhook token
 * rotation), or mutating persistent/shared state (the workspace itself,
 * or the pinned real test user's account-level settings) without a
 * proven-safe, field-symmetric revert. See docs/openapi-source-lock-
 * policy.md and this campaign's provenance note for the reasoning.
 */
function tierCDeliberatelyNotLive() {
    pushDocumented("POST /workspaces", "addWorkspace");
    pushDocumented("PUT /workspaces/{workspaceId}/cost-rate", "updateWorkspaceCostRate");
    pushDocumented("PUT /workspaces/{workspaceId}/hourly-rate", "updateWorkspaceBillableRate");
    pushDocumented("PUT /workspaces/{workspaceId}/invoices/settings", "updateInvoiceSettings");
    pushDocumented("POST /workspaces/{workspaceId}/limited-users", "addLimitedUsersWithInfo");
    pushDocumented(
        "PATCH /workspaces/{workspaceId}/member-profile/{userId}",
        "updateMemberProfile",
    );
    pushDocumented("POST /workspaces/{workspaceId}/users", "addUserToWorkspace");
    pushDocumented("PUT /workspaces/{workspaceId}/users/{userId}", "updateUserStatus");
    pushDocumented("PUT /workspaces/{workspaceId}/users/{userId}/cost-rate", "updateUserCostRate");
    pushDocumented(
        "PUT /workspaces/{workspaceId}/users/{userId}/hourly-rate",
        "updateUserHourlyRate",
    );
    pushDocumented(
        "PATCH /workspaces/{workspaceId}/webhooks/{webhookId}/token",
        "patchWorkspacesWorkspaceIdWebhooksWebhookIdToken",
    );
}

if (isDirectInvocation(process.argv[1], import.meta.filename)) {
    runCampaignWorker().then(
        () => process.exit(0),
        (error) => {
            console.error(`[campaign-failed] ${JSON.stringify(safeErrorSummary(error))}`);
            process.exit(1);
        },
    );
}

async function runCampaignWorker() {
    if (process.env.CLOCKIFY_LIVE_EVIDENCE_WORKER !== "1") {
        throw Object.assign(new Error("run the governed live-evidence campaign launcher instead"), {
            code: "live_campaign_launcher_required",
        });
    }
    const handleSignal = (signal) => {
        cancellation.request(signal);
        console.warn(`[campaign-cancellation-requested] signal=${signal}`);
    };
    const handleSigint = () => handleSignal("SIGINT");
    const handleSigterm = () => handleSignal("SIGTERM");
    process.on("SIGINT", handleSigint);
    process.on("SIGTERM", handleSigterm);

    const liveCredentials = validateLiveEnvironment(process.env);
    workspaceId = liveCredentials.workspaceId;
    client = guardLiveClientForCancellation(
        createBoundedLiveClient(createClockifyClient, liveCredentials.apiKey),
        cancellation,
    );
    console.log(
        `[generate-live-evidence-manifest] runId=${runId} workspace-scoped, sacrificial sandbox only`,
    );
    const startedAt = new Date().toISOString();
    const baseCommit = process.env.CLOCKIFY_LIVE_BASE_COMMIT ?? "";
    if (!/^[0-9a-f]{40}$/.test(baseCommit)) {
        throw Object.assign(new Error("launcher base commit unavailable"), {
            code: "live_base_commit_invalid",
        });
    }
    const previousManifestPath = path.join(root, contract.manifestPath);
    if (!fs.existsSync(previousManifestPath)) {
        throw Object.assign(new Error("previous live manifest unavailable"), {
            code: "live_previous_manifest_unavailable",
        });
    }
    const previousManifestBytes = fs.readFileSync(previousManifestPath);
    const previousManifest = JSON.parse(previousManifestBytes.toString("utf8"));
    const lock = acquireLiveLock();
    let inputBefore;
    let inputAfter;
    let artifactBefore;
    let artifactAfter;
    let sourceLock;
    let campaignError;
    let registeredCleanup = { attempted: 0, succeeded: 0, failed: 0 };
    let cleanupReceipt = {
        status: "failed",
        prefixCount: null,
        actions: [],
        leftovers: null,
        error: "cleanup_not_run",
    };
    let lockReleased = false;

    try {
        inputBefore = hashRelativeFiles(contract.campaignInputs, (relativePath) =>
            fs.readFileSync(path.join(root, relativePath)),
        );
        artifactBefore = hashArtifactTree(path.join(root, "wrapper", "dist"));
        sourceLock = JSON.parse(
            fs.readFileSync(path.join(root, "docs", "openapi-source-lock.json"), "utf8"),
        );

        cancellation.throwIfRequested();
        await resolveRealIds();
        cancellation.throwIfRequested();
        await tierAReadOnly();
        cancellation.throwIfRequested();
        console.log(`\n-- tier A done: ${rows.length} rows --\n`);

        for (const [label, fn] of [
            ["tags", tierBTags],
            ["projects", tierBProjects],
            ["clients", tierBClients],
            ["tasks", tierBTasks],
            ["customFields", tierBCustomFieldsWorkspace],
            ["timeEntries", tierBTimeEntries],
            ["expenses", tierBExpenses],
            ["invoices", tierBInvoices],
            ["webhooks", tierBWebhooks],
            ["timeOff", tierBTimeOff],
            ["scheduling", tierBScheduling],
            ["sharedReports", tierBSharedReports],
            ["userGroups", tierBUserGroups],
            ["holidays", tierBHolidays],
            ["approvals", tierBApprovals],
            ["files", tierBFiles],
            ["userRoles", tierBUserRoles],
        ]) {
            cancellation.throwIfRequested();
            try {
                await fn();
            } catch (err) {
                if (cancellation.isCancellation(err) || cancellation.requested) throw err;
                probeFailures.push({ operationKey: `family:${label}` });
                console.warn(`[family-failed] ${label} ${JSON.stringify(safeErrorSummary(err))}`);
            }
            cancellation.throwIfRequested();
            console.log(`-- tier B family "${label}" done: ${rows.length} rows so far --`);
        }

        cancellation.throwIfRequested();
        tierCDeliberatelyNotLive();
        console.log(`-- tier C done: ${rows.length} rows so far --`);
    } catch (error) {
        campaignError = error;
    } finally {
        cancellation.beginCleanup();
        const cleanupDeadlineMs = Date.now() + LIVE_CLEANUP_BUDGET_MS;
        try {
            // Reassignment is deliberate: registered callbacks close over this
            // binding, so every aggregate and exact-id cleanup request shares
            // one deadline instead of receiving a fresh budget per phase.
            client = guardCleanupClientForDeadline(client, { deadlineMs: cleanupDeadlineMs });
            const prefixes = [livePrefix, webhookPrefix, ...GOVERNED_LEGACY_PREFIXES];
            const cleanupOptions = {
                client,
                workspaceId,
                userId: testUserId,
                prefixes,
                rangeStart: LIVE_CLEANUP_RANGE_START,
                rangeEnd: LIVE_CLEANUP_RANGE_END,
                deadlineMs: cleanupDeadlineMs,
            };
            registeredCleanup = await runRegisteredCleanup(cleanupDeadlineMs);
            // Exact-id callbacks handle known creates first. One exhaustive,
            // dependency-ordered pass then catches ambiguous creates and
            // proves zero prefixed entities remain.
            const rawCleanup = await cleanupLivePrefixes(cleanupOptions);
            cleanupReceipt = normalizeCleanup(rawCleanup, prefixes.length);
            cleanupReceipt.actions.push({
                entityType: "registered_fallbacks",
                sanitizedIdCount: registeredCleanup.attempted,
                deletedCount: registeredCleanup.succeeded,
                failedCount: registeredCleanup.failed,
                remainingCount: registeredCleanup.failed === 0 ? 0 : null,
                complete: registeredCleanup.failed === 0,
            });
            if (registeredCleanup.failed > 0) {
                cleanupReceipt = {
                    ...cleanupReceipt,
                    status: "failed",
                    leftovers:
                        cleanupReceipt.leftovers === null
                            ? null
                            : cleanupReceipt.leftovers + registeredCleanup.failed,
                    error: "registered_cleanup_failed",
                };
            }
        } catch (error) {
            cleanupReceipt = {
                status: "failed",
                prefixCount: null,
                actions: [],
                leftovers: null,
                error: "cleanup_failed",
            };
            console.warn(`[cleanup-failed] aggregate ${JSON.stringify(safeErrorSummary(error))}`);
        }
        try {
            inputAfter = hashRelativeFiles(contract.campaignInputs, (relativePath) =>
                fs.readFileSync(path.join(root, relativePath)),
            );
            artifactAfter = hashArtifactTree(path.join(root, "wrapper", "dist"));
        } catch (error) {
            campaignError ??= error;
        }
        lockReleased = releaseLiveLock(lock);
        process.off("SIGINT", handleSigint);
        process.off("SIGTERM", handleSigterm);
    }

    if (campaignError) throw campaignError;
    if (
        cleanupReceipt.status === "passed" &&
        cleanupReceipt.leftovers === 0 &&
        registeredCleanup.failed === 0
    ) {
        for (const row of rows) {
            if (row.proofKind === "sandbox-mutation") row.cleanup = "passed";
        }
    }
    const completedAt = new Date().toISOString();
    const manifest = {
        schemaVersion: 1,
        canonicalCommit: sourceLock.commit,
        canonicalOpenApiSha256: sourceLock.sourceSha256,
        redactionVersion: 1,
        generatedAt: completedAt,
        operations: [...rows].sort((left, right) =>
            left.operationKey.localeCompare(right.operationKey),
        ),
    };
    const artifacts = createCampaignArtifacts({
        manifest,
        previousManifest,
        previousManifestBytes,
        baseCommit,
        startedAt,
        completedAt,
        inputBefore,
        inputAfter,
        artifactBefore,
        artifactAfter,
        probeFailures,
        safetyDemotions: CAMPAIGN_SAFETY_DEMOTIONS,
        cleanup: cleanupReceipt,
        lockReleased,
        nodeVersion: process.version,
        validateManifest: (candidate) =>
            validateLiveEvidenceManifest(candidate, {
                sourceLock,
                operationInventory: CANONICAL_OPERATIONS,
            }),
        baseCommitExists: (commit) => commit === baseCommit,
    });
    if (!artifacts.ok) {
        for (const failure of artifacts.errors) console.error(`[candidate-rejected] ${failure}`);
        const error = Object.assign(new Error("candidate invariants failed"), {
            code: "live_candidate_invariants_failed",
        });
        error.failures = artifacts.errors;
        throw error;
    }

    const outDir = path.join(root, "scripts", "live", ".manifest-work");
    const outPath = path.join(outDir, "live-evidence-manifest.candidate.json");
    const receiptPath = path.join(outDir, "live-evidence-campaign-receipt.candidate.json");
    writeFileAtomic(receiptPath, artifacts.campaignReceiptBytes);
    writeFileAtomic(outPath, artifacts.manifestBytes);
    console.log(`\n${rows.length} validated rows recorded.`);
    console.log(`Wrote import candidate to ${path.relative(root, outPath)}`);
    console.log(`Manifest candidate SHA-256: ${artifacts.manifestSha256}`);
    console.log(`Campaign receipt SHA-256: ${artifacts.campaignReceiptSha256}`);
}

export {
    shapeHash,
    shapeOf,
    stableStringify,
    httpClassOf,
    rows,
    seenKeys,
    client,
    workspaceId,
    testUserId,
    testProjectId,
    name,
    runId,
    pushDocumented,
    pushProbeDocumented,
    pushLiveSuccess,
    liveReadOnly,
};
