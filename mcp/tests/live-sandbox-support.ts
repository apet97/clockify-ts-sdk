import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

export type LiveEnvelope =
    | {
          ok: true;
          action: string;
          data: unknown;
          meta?: Record<string, unknown>;
          ids?: Record<string, string>;
          changed?: Record<string, unknown>;
      }
    | {
          ok: false;
          action: string;
          error: { code?: string; message: string };
      };

export type GuardedWriteCheckpoint = "bare_rejected" | "previewed";

export type GuardedLiveWriteOptions = {
    /** Count exact-name target objects after each non-executing guard stage. */
    countExactMatches: () => Promise<number>;
    checkpoint?: (stage: GuardedWriteCheckpoint) => void;
};

export type GuardedLiveWriteResult =
    | {
          outcome: "executed";
          bare: Extract<LiveEnvelope, { ok: false }>;
          preview: Extract<LiveEnvelope, { ok: true }>;
          executed: Extract<LiveEnvelope, { ok: true }>;
      }
    | {
          outcome: "entitlement_limited";
          stage: "preview" | "execute";
          error: Extract<LiveEnvelope, { ok: false }>;
          marker: LiveEntitlementMarker;
      };

export type LiveEntitlementMarker =
    | "CLOCKIFY_LIVE_ENTITLEMENT:http_402"
    | "CLOCKIFY_LIVE_ENTITLEMENT:feature_unavailable";

export type LiveCleanupEntityType =
    | "time_entry"
    | "scheduling_assignment"
    | "time_off_request"
    | "expense"
    | "invoice"
    | "shared_report"
    | "webhook"
    | "task"
    | "project"
    | "client"
    | "tag";

export type LiveCleanupStep = {
    entityType: LiveCleanupEntityType;
    idCount: number;
    cleanup: () => Promise<void>;
};

export type LiveCleanupResourceReceipt = {
    entityType: LiveCleanupEntityType;
    idCount: number;
    deleted: number;
    failed: number;
    remaining: number;
};

export type LiveCleanupReceipt = {
    surface: "mcp";
    resources: LiveCleanupResourceReceipt[];
    idCount: number;
    deleted: number;
    failed: number;
    remaining: number;
};

function recordValue(value: unknown, entity: string): Record<string, unknown> {
    if (value == null || typeof value !== "object") {
        throw new TypeError(`${entity} cleanup requires current server state`);
    }
    return value as Record<string, unknown>;
}

function requiredName(value: Record<string, unknown>, entity: string): string {
    if (typeof value.name !== "string" || value.name.length === 0) {
        throw new TypeError(`${entity} cleanup requires the current name`);
    }
    return value.name;
}

/** Reconstruct the client's full editable state, then overlay only archived. */
export function buildClientArchiveBody(current: unknown): Record<string, unknown> {
    const value = recordValue(current, "client");
    const body: Record<string, unknown> = { name: requiredName(value, "client") };
    for (const field of ["address", "email", "note", "currencyCode"] as const) {
        const fieldValue = value[field];
        if (fieldValue === undefined || fieldValue === null) continue;
        if (typeof fieldValue !== "string") {
            throw new TypeError(`client cleanup found invalid ${field}`);
        }
        body[field] = fieldValue;
    }
    if (value.archived !== undefined && typeof value.archived !== "boolean") {
        throw new TypeError("client cleanup found invalid archived state");
    }
    body.archived = true;
    return body;
}

function rateRequest(value: unknown, field: string): { amount: number } | undefined {
    if (value === undefined || value === null) return undefined;
    if (
        typeof value !== "object" ||
        !Number.isFinite((value as Record<string, unknown>).amount)
    ) {
        throw new TypeError(`project cleanup found invalid ${field}`);
    }
    return { amount: (value as { amount: number }).amount };
}

/** Reconstruct the project's editable state, then overlay only archived. */
export function buildProjectArchiveBody(current: unknown): Record<string, unknown> {
    const value = recordValue(current, "project");
    if (typeof value.billable !== "boolean") {
        throw new TypeError("project cleanup found invalid billable state");
    }
    if (typeof value.archived !== "boolean") {
        throw new TypeError("project cleanup found invalid archived state");
    }
    if (typeof value.color !== "string") {
        throw new TypeError("project cleanup found invalid color");
    }
    if (typeof value.public !== "boolean") {
        throw new TypeError("project cleanup found invalid public state");
    }
    const body: Record<string, unknown> = {
        name: requiredName(value, "project"),
        archived: true,
        billable: value.billable,
        color: value.color,
        isPublic: value.public,
    };
    for (const field of ["clientId", "note"] as const) {
        const fieldValue = value[field];
        if (fieldValue === undefined || fieldValue === null) continue;
        if (typeof fieldValue !== "string") {
            throw new TypeError(`project cleanup found invalid ${field}`);
        }
        body[field] = fieldValue;
    }
    for (const field of ["costRate", "hourlyRate"] as const) {
        const fieldValue = rateRequest(value[field], field);
        if (fieldValue !== undefined) body[field] = fieldValue;
    }
    return body;
}

/** Reconstruct the task's editable state, then mark it DONE before deletion. */
export function buildTaskDoneBody(current: unknown): Record<string, unknown> {
    const value = recordValue(current, "task");
    if (typeof value.billable !== "boolean") {
        throw new TypeError("task cleanup found invalid billable state");
    }
    if (value.status !== "ACTIVE" && value.status !== "DONE") {
        throw new TypeError("task cleanup found invalid status");
    }
    const body: Record<string, unknown> = {
        name: requiredName(value, "task"),
        billable: value.billable,
        status: "DONE",
    };
    for (const field of ["assigneeId", "estimate"] as const) {
        const fieldValue = value[field];
        if (fieldValue === undefined || fieldValue === null) continue;
        if (typeof fieldValue !== "string") {
            throw new TypeError(`task cleanup found invalid ${field}`);
        }
        body[field] = fieldValue;
    }
    for (const field of ["assigneeIds", "userGroupIds"] as const) {
        const fieldValue = value[field];
        if (fieldValue === undefined || fieldValue === null) continue;
        if (!Array.isArray(fieldValue) || fieldValue.some((item) => typeof item !== "string")) {
            throw new TypeError(`task cleanup found invalid ${field}`);
        }
        body[field] = [...fieldValue];
    }
    if (value.budgetEstimate !== undefined && value.budgetEstimate !== null) {
        if (typeof value.budgetEstimate !== "number" || !Number.isFinite(value.budgetEstimate)) {
            throw new TypeError("task cleanup found invalid budgetEstimate");
        }
        body.budgetEstimate = value.budgetEstimate;
    }
    return body;
}

export function parseLiveEnvelope(result: unknown): LiveEnvelope {
    const content = (result as { content?: unknown }).content;
    const text = (content as Array<{ type?: string; text?: string }> | undefined)?.find(
        (item) => item.type === "text" && typeof item.text === "string",
    )?.text;
    if (!text) throw new TypeError("MCP tool result did not contain a text envelope");
    const parsed = JSON.parse(text) as Partial<LiveEnvelope>;
    if (parsed.ok !== true && parsed.ok !== false) {
        throw new TypeError("MCP tool result did not contain a canonical envelope");
    }
    return parsed as LiveEnvelope;
}

/** Require the root live orchestrator's governed, run-unique object prefix. */
export function requireLivePrefix(
    env: Readonly<Record<string, string | undefined>> = process.env,
): string {
    const prefix = env.CLOCKIFY_LIVE_PREFIX?.trim();
    if (!prefix) {
        throw new Error(
            "CLOCKIFY_LIVE_PREFIX is required when MCP live credentials are configured",
        );
    }
    if (!/^clockify115-live-[A-Za-z0-9][A-Za-z0-9._:-]*-[A-Za-z0-9]+-$/.test(prefix)) {
        throw new Error(
            "CLOCKIFY_LIVE_PREFIX must match clockify115-live-<timestamp>-<random>-",
        );
    }
    const workspaceId = env.CLOCKIFY_WORKSPACE_ID?.trim();
    const workspaceConfirm = env.CLOCKIFY_LIVE_WORKSPACE_CONFIRM?.trim();
    if (!workspaceId || workspaceConfirm !== workspaceId) {
        throw new Error("MCP live mutation workspace is unconfirmed");
    }
    return prefix;
}

/** Build a live object name without adding an ungoverned timestamp or identifier. */
export function liveObjectName(prefix: string, label: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(label)) {
        throw new TypeError("live object label must be alphanumeric with optional _ or -");
    }
    return `${prefix}${label}`;
}

/** Count an exact invoice number across every bounded UNSENT invoice page. */
export async function countExactInvoiceNumber(
    loadPage: (page: number, pageSize: number) => Promise<unknown>,
    invoiceNumber: string,
    options: { pageSize?: number; maxPages?: number } = {},
): Promise<number> {
    if (!invoiceNumber) throw new TypeError("invoice number probe requires an exact number");
    const pageSize = options.pageSize ?? 200;
    const maxPages = options.maxPages ?? 50;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) {
        throw new RangeError("invoice probe pageSize must be from 1 through 200");
    }
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) {
        throw new RangeError("invoice probe maxPages must be from 1 through 100");
    }

    let count = 0;
    const seenPages = new Set<string>();
    for (let page = 1; page <= maxPages; page += 1) {
        const response = await loadPage(page, pageSize);
        const rows = Array.isArray(response)
            ? response
            : response != null &&
                typeof response === "object" &&
                Array.isArray((response as { invoices?: unknown }).invoices)
              ? (response as { invoices: unknown[] }).invoices
              : undefined;
        if (rows === undefined || rows.length > pageSize) {
            throw new TypeError("invoice exact-name probe received malformed pagination");
        }
        if (rows.length === 0) return count;
        const fingerprint = JSON.stringify(rows);
        if (seenPages.has(fingerprint)) {
            throw new TypeError("invoice exact-name probe received a repeated page");
        }
        seenPages.add(fingerprint);
        for (const row of rows) {
            if (row == null || typeof row !== "object") {
                throw new TypeError("invoice exact-name probe received a malformed invoice");
            }
            const number = (row as { number?: unknown }).number;
            if (number !== undefined && typeof number !== "string") {
                throw new TypeError("invoice exact-name probe received an invalid invoice number");
            }
            if (number === invoiceNumber) count += 1;
        }
    }
    throw new RangeError("invoice exact-name probe exceeded its page bound");
}

/**
 * The only allowed live-suite entitlement outcomes are the stable MCP code or
 * an explicit HTTP 402 carried by an SDK-style error object. Messages alone do
 * not qualify, and 403/404 are deliberately never treated as skips.
 */
export function entitlementMarker(value: unknown): LiveEntitlementMarker | undefined {
    if (value == null || typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    const error = record.error;
    const response = record.response;
    if (
        record.statusCode === 402 ||
        record.status === 402 ||
        (error != null &&
            typeof error === "object" &&
            ((error as Record<string, unknown>).status === 402 ||
                (error as Record<string, unknown>).statusCode === 402)) ||
        (response != null &&
            typeof response === "object" &&
            ((response as Record<string, unknown>).status === 402 ||
                (response as Record<string, unknown>).statusCode === 402))
    ) {
        return "CLOCKIFY_LIVE_ENTITLEMENT:http_402";
    }
    if (record.code === "feature_unavailable") {
        return "CLOCKIFY_LIVE_ENTITLEMENT:feature_unavailable";
    }
    if (
        error != null &&
        typeof error === "object" &&
        (error as Record<string, unknown>).code === "feature_unavailable"
    ) {
        return "CLOCKIFY_LIVE_ENTITLEMENT:feature_unavailable";
    }
    return undefined;
}

export function isAllowedEntitlementSkip(value: unknown): boolean {
    return entitlementMarker(value) !== undefined;
}

function failureMessage(stage: string, envelope: Extract<LiveEnvelope, { ok: false }>): Error {
    return new Error(
        `${stage} failed with ${envelope.error.code ?? "unknown"}: ${envelope.error.message}`,
    );
}

async function assertNoExactMutation(
    stage: "bare" | "preview",
    options: GuardedLiveWriteOptions,
): Promise<void> {
    const count = await options.countExactMatches();
    if (!Number.isSafeInteger(count) || count < 0) {
        throw new TypeError(`${stage} exact target probe returned an invalid count`);
    }
    if (count !== 0) {
        throw new Error(`${stage} exact target count ${count}; refusing guarded execution`);
    }
}

/**
 * Exercise a guarded live write exactly as an MCP caller must: prove a bare
 * invocation is refused, preview once, then execute using the issued one-use
 * token and the same business arguments.
 */
export async function exerciseGuardedLiveWrite(
    client: Pick<Client, "callTool">,
    tool: string,
    args: Record<string, unknown>,
    options: GuardedLiveWriteOptions,
): Promise<GuardedLiveWriteResult> {
    const bare = parseLiveEnvelope(await client.callTool({ name: tool, arguments: args }));
    await assertNoExactMutation("bare", options);
    if (bare.ok) throw new Error(`${tool} mutated without dry_run confirmation`);
    if (!/dry_run/i.test(`${bare.error.message} ${bare.error.code ?? ""}`)) {
        throw failureMessage("bare guarded invocation", bare);
    }
    options.checkpoint?.("bare_rejected");

    const preview = parseLiveEnvelope(
        await client.callTool({ name: tool, arguments: { ...args, dry_run: true } }),
    );
    await assertNoExactMutation("preview", options);
    if (!preview.ok) {
        const marker = entitlementMarker(preview);
        if (marker) {
            return { outcome: "entitlement_limited", stage: "preview", error: preview, marker };
        }
        throw failureMessage("guarded preview", preview);
    }
    const token = (preview.data as { confirm_token?: unknown } | null)?.confirm_token;
    if (typeof token !== "string" || token.length === 0) {
        throw new TypeError(`${tool} dry_run did not issue a confirm_token`);
    }
    options.checkpoint?.("previewed");

    const executed = parseLiveEnvelope(
        await client.callTool({ name: tool, arguments: { ...args, confirm_token: token } }),
    );
    if (!executed.ok) {
        const marker = entitlementMarker(executed);
        if (marker) {
            return { outcome: "entitlement_limited", stage: "execute", error: executed, marker };
        }
        throw failureMessage("guarded execution", executed);
    }
    return { outcome: "executed", bare, preview, executed };
}

/** Attempt all package-local cleanup steps and expose only sanitized counts. */
export async function runCleanupSteps(steps: readonly LiveCleanupStep[]): Promise<LiveCleanupReceipt> {
    const resources: LiveCleanupResourceReceipt[] = [];
    for (const step of steps) {
        if (!Number.isInteger(step.idCount) || step.idCount < 0) {
            throw new RangeError("cleanup idCount must be a non-negative integer");
        }
        try {
            await step.cleanup();
            resources.push({
                entityType: step.entityType,
                idCount: step.idCount,
                deleted: step.idCount,
                failed: 0,
                remaining: 0,
            });
        } catch {
            resources.push({
                entityType: step.entityType,
                idCount: step.idCount,
                deleted: 0,
                failed: step.idCount,
                remaining: step.idCount,
            });
        }
    }
    return {
        surface: "mcp",
        resources,
        idCount: resources.reduce((sum, row) => sum + row.idCount, 0),
        deleted: resources.reduce((sum, row) => sum + row.deleted, 0),
        failed: resources.reduce((sum, row) => sum + row.failed, 0),
        remaining: resources.reduce((sum, row) => sum + row.remaining, 0),
    };
}
