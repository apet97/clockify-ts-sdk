const CLOCKIFY_ID = /^[0-9a-fA-F]{24}$/;
const SAFE_PREFIX = /^[A-Za-z0-9][A-Za-z0-9._-]{3,126}-$/;
const SCHEDULING_WINDOW_YEARS = 10;
const MAX_SCHEDULING_WINDOWS = 100;

export const CLEANUP_ENTITY_ORDER = Object.freeze([
    "time_entries",
    "scheduling_assignments",
    "time_off_requests",
    "expenses",
    "invoices",
    "shared_reports",
    "webhooks",
    "tasks",
    "projects",
    "clients",
    "tags",
]);

class MalformedCleanupState extends Error {
    constructor() {
        super("Clockify returned malformed cleanup state.");
        this.name = "MalformedCleanupState";
    }
}

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireClockifyId(value) {
    if (typeof value !== "string" || !CLOCKIFY_ID.test(value)) {
        throw new MalformedCleanupState();
    }
    return value;
}

function requireMethod(client, resource, method) {
    const owner = client[resource];
    const fn = owner?.[method];
    if (typeof fn !== "function") throw new MalformedCleanupState();
    return fn.bind(owner);
}

function validIsoInstant(value) {
    return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function schedulingDateWindows(rangeStart, rangeEnd) {
    const finalTime = Date.parse(rangeEnd);
    let currentTime = Date.parse(rangeStart);
    let currentLabel = rangeStart;
    const windows = [];
    while (currentTime < finalTime) {
        if (windows.length >= MAX_SCHEDULING_WINDOWS) throw new MalformedCleanupState();
        const next = new Date(currentTime);
        next.setUTCFullYear(next.getUTCFullYear() + SCHEDULING_WINDOW_YEARS);
        const nextTime = Math.min(next.getTime(), finalTime);
        if (!Number.isFinite(nextTime) || nextTime <= currentTime) {
            throw new MalformedCleanupState();
        }
        const nextLabel = nextTime === finalTime ? rangeEnd : new Date(nextTime).toISOString();
        windows.push({ start: currentLabel, end: nextLabel });
        currentTime = nextTime;
        currentLabel = nextLabel;
    }
    return windows;
}

export function validateCleanupOptions(options) {
    if (!isRecord(options)) throw new TypeError("cleanup options must be an object");
    if (!isRecord(options.client)) throw new TypeError("client must be an object");
    if (typeof options.workspaceId !== "string" || !CLOCKIFY_ID.test(options.workspaceId)) {
        throw new TypeError("workspaceId must be a 24-hex Clockify ID");
    }
    if (typeof options.userId !== "string" || !CLOCKIFY_ID.test(options.userId)) {
        throw new TypeError("userId must be a 24-hex Clockify ID");
    }
    if (!Array.isArray(options.prefixes) || options.prefixes.length === 0) {
        throw new TypeError("prefixes must be a non-empty array");
    }
    const prefixes = [...new Set(options.prefixes)];
    if (prefixes.some((entry) => typeof entry !== "string" || !SAFE_PREFIX.test(entry))) {
        throw new TypeError("each cleanup prefix must be a safe, trailing-hyphen prefix");
    }
    if (!validIsoInstant(options.rangeStart) || !validIsoInstant(options.rangeEnd)) {
        throw new TypeError("rangeStart and rangeEnd must be ISO-8601 instants");
    }
    if (Date.parse(options.rangeStart) >= Date.parse(options.rangeEnd)) {
        throw new TypeError("rangeStart must be earlier than rangeEnd");
    }
    const pageSize = options.pageSize ?? 200;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) {
        throw new TypeError("pageSize must be an integer from 1 through 200");
    }
    const maxPages = options.maxPages ?? 50;
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) {
        throw new TypeError("maxPages must be an integer from 1 through 100");
    }
    return Object.freeze({
        client: options.client,
        workspaceId: options.workspaceId,
        userId: options.userId,
        prefixes: Object.freeze(prefixes),
        rangeStart: options.rangeStart,
        rangeEnd: options.rangeEnd,
        pageSize,
        maxPages,
    });
}

function unwrapArray(value) {
    if (!Array.isArray(value)) throw new MalformedCleanupState();
    return value;
}

function unwrapNamedArray(value, ...paths) {
    if (Array.isArray(value)) return value;
    if (!isRecord(value)) throw new MalformedCleanupState();
    for (const path of paths) {
        let current = value;
        for (const part of path) current = isRecord(current) ? current[part] : undefined;
        if (Array.isArray(current)) return current;
    }
    throw new MalformedCleanupState();
}

async function collectPages({ list, request, unwrap, maxPages }) {
    const collected = [];
    const seenIds = new Set();
    for (let page = 1; page <= maxPages; page += 1) {
        const items = unwrap(await list(request(page)));
        if (items.some((item) => !isRecord(item))) throw new MalformedCleanupState();
        if (items.length === 0) return collected;

        for (const item of items) {
            const itemId = requireClockifyId(item.id);
            if (seenIds.has(itemId)) continue;
            seenIds.add(itemId);
            collected.push(item);
        }
        // Clockify pages can overlap completely before a later page contributes
        // new IDs. Only an empty page proves exhaustion; a paging-blind endpoint
        // that repeats forever still fails closed at maxPages below.
    }
    throw new MalformedCleanupState();
}

function startsWithPrefix(value, prefixes) {
    return prefixes.some((prefix) => value.startsWith(prefix));
}

function matchingCandidate(item, fields, prefixes) {
    if (!isRecord(item)) throw new MalformedCleanupState();
    let matches = false;
    for (const field of fields) {
        const value = item[field];
        if (value === undefined || value === null) continue;
        if (typeof value !== "string") throw new MalformedCleanupState();
        matches ||= startsWithPrefix(value, prefixes);
    }
    if (!matches) return null;
    return { ...item, id: requireClockifyId(item.id) };
}

function selectCandidates(items, fields, prefixes) {
    const candidates = [];
    for (const item of items) {
        const candidate = matchingCandidate(item, fields, prefixes);
        if (candidate) candidates.push(candidate);
    }
    return dedupeCandidates(candidates);
}

function dedupeCandidates(candidates) {
    const byId = new Map();
    for (const candidate of candidates) {
        const key = candidate.projectId ? `${candidate.projectId}:${candidate.id}` : candidate.id;
        if (!byId.has(key)) byId.set(key, candidate);
    }
    return [...byId.values()];
}

function dedupeRowsById(rows) {
    const byId = new Map();
    for (const row of rows) {
        if (!isRecord(row)) throw new MalformedCleanupState();
        const rowId = requireClockifyId(row.id);
        if (!byId.has(rowId)) byId.set(rowId, row);
    }
    return [...byId.values()];
}

function taskUpdateBody(current) {
    if (!isRecord(current)) throw new MalformedCleanupState();
    if (typeof current.name !== "string" || current.name.length === 0) {
        throw new MalformedCleanupState();
    }
    if (typeof current.billable !== "boolean") throw new MalformedCleanupState();
    if (current.status !== "ACTIVE" && current.status !== "DONE") {
        throw new MalformedCleanupState();
    }
    const body = {
        name: current.name,
        billable: current.billable,
        status: current.status,
    };
    for (const field of ["assigneeId", "estimate"]) {
        const value = current[field];
        if (value === undefined || value === null) continue;
        if (typeof value !== "string") throw new MalformedCleanupState();
        body[field] = value;
    }
    for (const field of ["assigneeIds", "userGroupIds"]) {
        const value = current[field];
        if (value === undefined || value === null) continue;
        if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
            throw new MalformedCleanupState();
        }
        body[field] = [...value];
    }
    if (current.budgetEstimate !== undefined && current.budgetEstimate !== null) {
        if (!Number.isInteger(current.budgetEstimate)) throw new MalformedCleanupState();
        body.budgetEstimate = current.budgetEstimate;
    }
    return body;
}

function optionalString(value) {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "string") throw new MalformedCleanupState();
    return value;
}

function rateRequest(value) {
    if (value === undefined || value === null) return undefined;
    if (!isRecord(value) || !Number.isInteger(value.amount)) {
        throw new MalformedCleanupState();
    }
    return { amount: value.amount };
}

function projectUpdateBody(current) {
    if (!isRecord(current)) throw new MalformedCleanupState();
    if (typeof current.name !== "string" || current.name.length === 0) {
        throw new MalformedCleanupState();
    }
    if (
        typeof current.archived !== "boolean" ||
        typeof current.billable !== "boolean" ||
        typeof current.color !== "string" ||
        typeof current.public !== "boolean"
    ) {
        throw new MalformedCleanupState();
    }
    const body = {
        name: current.name,
        archived: current.archived,
        billable: current.billable,
        color: current.color,
        isPublic: current.public,
    };
    for (const field of ["clientId", "note"]) {
        const value = optionalString(current[field]);
        if (value !== undefined) body[field] = value;
    }
    for (const field of ["costRate", "hourlyRate"]) {
        const value = rateRequest(current[field]);
        if (value !== undefined) body[field] = value;
    }
    return body;
}

function clientUpdateBody(current) {
    if (!isRecord(current)) throw new MalformedCleanupState();
    if (typeof current.name !== "string" || current.name.length === 0) {
        throw new MalformedCleanupState();
    }
    if (typeof current.archived !== "boolean") throw new MalformedCleanupState();
    const body = { name: current.name, archived: current.archived };
    for (const field of ["address", "currencyCode", "email", "note"]) {
        const value = optionalString(current[field]);
        if (value !== undefined) body[field] = value;
    }
    return body;
}

function failureCode(error) {
    if (error instanceof MalformedCleanupState) return "malformed_state";
    if (
        isRecord(error) &&
        (error.statusCode === 402 || error.status === 402 || error.code === "feature_unavailable")
    ) {
        return "feature_unavailable";
    }
    return "cleanup_failed";
}

function incompleteAction(entityType, error) {
    return {
        entityType,
        sanitizedIdCount: 0,
        deletedCount: 0,
        failedCount: 1,
        remainingCount: null,
        complete: false,
        failureCode: failureCode(error),
    };
}

async function runAction({
    entityType,
    discover,
    prepare = async (candidate) => candidate,
    remove,
}) {
    let candidates;
    try {
        candidates = await discover();
    } catch (error) {
        return incompleteAction(entityType, error);
    }

    const prepared = [];
    try {
        for (const candidate of candidates) prepared.push(await prepare(candidate));
    } catch (error) {
        let remainingCount = null;
        try {
            remainingCount = (await discover()).length;
        } catch {
            // Unknown remains fail-closed; the stable failure code below exposes no SDK detail.
        }
        return {
            entityType,
            sanitizedIdCount: candidates.length,
            deletedCount: 0,
            // No replacement write is allowed until every candidate validates;
            // a failed preflight leaves every candidate unprocessed.
            failedCount: candidates.length,
            remainingCount,
            complete: remainingCount !== null,
            failureCode: failureCode(error),
        };
    }

    let deletedCount = 0;
    let failedCount = 0;
    for (const candidate of prepared) {
        try {
            await remove(candidate);
            deletedCount += 1;
        } catch {
            failedCount += 1;
        }
    }

    try {
        const remaining = await discover();
        return {
            entityType,
            sanitizedIdCount: candidates.length,
            deletedCount,
            failedCount,
            remainingCount: remaining.length,
            complete: true,
        };
    } catch (error) {
        return {
            entityType,
            sanitizedIdCount: candidates.length,
            deletedCount,
            failedCount: failedCount + 1,
            remainingCount: null,
            complete: false,
            failureCode: failureCode(error),
        };
    }
}

function pagedRequest(ctx, extra = {}) {
    return (page) => ({
        workspaceId: ctx.workspaceId,
        ...extra,
        page,
        "page-size": ctx.pageSize,
    });
}

function actionDefinitions(ctx) {
    const { client, prefixes } = ctx;

    const collectArchivedResource = async (resource) => {
        const rows = [];
        for (const archived of [false, true]) {
            rows.push(
                ...(await collectPages({
                    list: requireMethod(client, resource, "list"),
                    request: pagedRequest(ctx, { archived }),
                    unwrap: unwrapArray,
                    pageSize: ctx.pageSize,
                    maxPages: ctx.maxPages,
                })),
            );
        }
        return dedupeRowsById(rows);
    };

    const collectAllProjects = () => collectArchivedResource("projects");

    const discoverTimeEntries = async () => {
        const listInProgress = requireMethod(client, "timeEntries", "listInProgress");
        const listForUser = requireMethod(client, "timeEntries", "listForUser");
        const running = await collectPages({
            list: listInProgress,
            request: pagedRequest(ctx),
            unwrap: unwrapArray,
            pageSize: ctx.pageSize,
            maxPages: ctx.maxPages,
        });
        const finished = await collectPages({
            list: listForUser,
            request: pagedRequest(ctx, {
                userId: ctx.userId,
                start: ctx.rangeStart,
                end: ctx.rangeEnd,
            }),
            unwrap: unwrapArray,
            pageSize: ctx.pageSize,
            maxPages: ctx.maxPages,
        });
        return selectCandidates([...running, ...finished], ["description"], prefixes);
    };

    const discoverAssignments = async () => {
        const linkedProjectIds = new Set(
            selectCandidates(await collectAllProjects(), ["name"], prefixes).map(
                (project) => project.id,
            ),
        );
        const rows = [];
        for (const window of schedulingDateWindows(ctx.rangeStart, ctx.rangeEnd)) {
            rows.push(
                ...(await collectPages({
                    list: requireMethod(client, "scheduling", "list"),
                    request: pagedRequest(ctx, window),
                    unwrap: unwrapArray,
                    pageSize: ctx.pageSize,
                    maxPages: ctx.maxPages,
                })),
            );
        }
        const candidates = [];
        for (const row of dedupeRowsById(rows)) {
            const direct = matchingCandidate(
                row,
                ["note", "projectName", "taskName", "clientName"],
                prefixes,
            );
            if (direct) {
                candidates.push(direct);
                continue;
            }
            if (typeof row.projectId === "string" && linkedProjectIds.has(row.projectId)) {
                candidates.push({ ...row, id: requireClockifyId(row.id) });
            }
        }
        return dedupeCandidates(candidates);
    };

    const discoverTimeOffRequests = async () =>
        selectCandidates(
            await collectPages({
                list: requireMethod(client, "timeOff", "list"),
                request: (page) => ({
                    workspaceId: ctx.workspaceId,
                    statuses: ["PENDING"],
                    page,
                    pageSize: ctx.pageSize,
                }),
                unwrap: (value) => unwrapNamedArray(value, ["requests"]),
                pageSize: ctx.pageSize,
                maxPages: ctx.maxPages,
            }),
            ["note"],
            prefixes,
        ).map((candidate) => {
            if (!isRecord(candidate.status) || candidate.status.statusType !== "PENDING") {
                throw new MalformedCleanupState();
            }
            return { ...candidate, policyId: requireClockifyId(candidate.policyId) };
        });

    const discoverExpenses = async () =>
        selectCandidates(
            await collectPages({
                list: requireMethod(client, "expenses", "list"),
                request: pagedRequest(ctx),
                unwrap: (value) => unwrapNamedArray(value, ["expenses", "expenses"], ["expenses"]),
                pageSize: ctx.pageSize,
                maxPages: ctx.maxPages,
            }),
            ["notes"],
            prefixes,
        );

    const discoverInvoices = async () =>
        selectCandidates(
            await collectPages({
                list: requireMethod(client, "invoices", "list"),
                request: pagedRequest(ctx, { statuses: ["UNSENT"] }),
                unwrap: (value) => unwrapNamedArray(value, ["invoices"]),
                pageSize: ctx.pageSize,
                maxPages: ctx.maxPages,
            }),
            ["number"],
            prefixes,
        ).map((candidate) => {
            if (candidate.status !== "UNSENT") throw new MalformedCleanupState();
            return candidate;
        });

    const discoverSharedReports = async () =>
        selectCandidates(
            await collectPages({
                list: requireMethod(client, "sharedReports", "list"),
                request: (page) => ({
                    workspaceId: ctx.workspaceId,
                    page,
                    pageSize: ctx.pageSize,
                }),
                unwrap: (value) => unwrapNamedArray(value, ["reports"]),
                pageSize: ctx.pageSize,
                maxPages: ctx.maxPages,
            }),
            ["name"],
            prefixes,
        );

    const discoverWebhooks = async () =>
        selectCandidates(
            unwrapNamedArray(
                await requireMethod(client, "webhooks", "list")({ workspaceId: ctx.workspaceId }),
                ["webhooks"],
            ),
            ["name"],
            prefixes,
        );

    const discoverProjects = async () =>
        selectCandidates(await collectAllProjects(), ["name"], prefixes).map((candidate) => {
            if (typeof candidate.archived !== "boolean") throw new MalformedCleanupState();
            return candidate;
        });

    const discoverTasks = async () => {
        const projects = await collectAllProjects();
        const tasks = [];
        for (const project of projects) {
            for (const isActive of [true, false]) {
                const rows = await collectPages({
                    list: requireMethod(client, "tasks", "list"),
                    request: pagedRequest(ctx, {
                        projectId: project.id,
                        "is-active": isActive,
                    }),
                    unwrap: unwrapArray,
                    pageSize: ctx.pageSize,
                    maxPages: ctx.maxPages,
                });
                for (const row of rows) tasks.push({ ...row, projectId: project.id });
            }
        }
        return selectCandidates(tasks, ["name"], prefixes).map((candidate) => ({
            ...candidate,
            projectId: requireClockifyId(candidate.projectId),
        }));
    };

    const discoverClients = async () =>
        selectCandidates(await collectArchivedResource("clients"), ["name"], prefixes).map(
            (candidate) => {
                if (typeof candidate.archived !== "boolean") throw new MalformedCleanupState();
                return candidate;
            },
        );

    const discoverTags = async () =>
        selectCandidates(await collectArchivedResource("tags"), ["name"], prefixes);

    return [
        {
            entityType: "time_entries",
            discover: discoverTimeEntries,
            remove: (candidate) =>
                requireMethod(
                    client,
                    "timeEntries",
                    "delete",
                )({
                    workspaceId: ctx.workspaceId,
                    timeEntryId: candidate.id,
                }),
        },
        {
            entityType: "scheduling_assignments",
            discover: discoverAssignments,
            remove: (candidate) =>
                requireMethod(
                    client,
                    "scheduling",
                    "deleteRecurring",
                )({
                    workspaceId: ctx.workspaceId,
                    assignmentId: candidate.id,
                    seriesUpdateOption: "ALL",
                }),
        },
        {
            entityType: "time_off_requests",
            discover: discoverTimeOffRequests,
            remove: (candidate) =>
                requireMethod(
                    client,
                    "timeOff",
                    "withdraw",
                )({
                    workspaceId: ctx.workspaceId,
                    policyId: candidate.policyId,
                    requestId: candidate.id,
                }),
        },
        {
            entityType: "expenses",
            discover: discoverExpenses,
            remove: (candidate) =>
                requireMethod(
                    client,
                    "expenses",
                    "delete",
                )({
                    workspaceId: ctx.workspaceId,
                    expenseId: candidate.id,
                }),
        },
        {
            entityType: "invoices",
            discover: discoverInvoices,
            remove: (candidate) =>
                requireMethod(
                    client,
                    "invoices",
                    "delete",
                )({
                    workspaceId: ctx.workspaceId,
                    invoiceId: candidate.id,
                }),
        },
        {
            entityType: "shared_reports",
            discover: discoverSharedReports,
            remove: (candidate) =>
                requireMethod(
                    client,
                    "sharedReports",
                    "delete",
                )({
                    workspaceId: ctx.workspaceId,
                    sharedReportId: candidate.id,
                }),
        },
        {
            entityType: "webhooks",
            discover: discoverWebhooks,
            remove: (candidate) =>
                requireMethod(
                    client,
                    "webhooks",
                    "delete",
                )({
                    workspaceId: ctx.workspaceId,
                    webhookId: candidate.id,
                }),
        },
        {
            entityType: "tasks",
            discover: discoverTasks,
            prepare: async (candidate) => {
                const request = {
                    workspaceId: ctx.workspaceId,
                    projectId: candidate.projectId,
                    taskId: candidate.id,
                };
                const current = await requireMethod(client, "tasks", "get")(request);
                const originalBody = taskUpdateBody(current);
                return { request, originalBody, changedStatus: originalBody.status !== "DONE" };
            },
            remove: async ({ request, originalBody, changedStatus }) => {
                if (changedStatus) {
                    await requireMethod(
                        client,
                        "tasks",
                        "update",
                    )({
                        ...request,
                        body: { ...originalBody, status: "DONE" },
                    });
                }
                try {
                    await requireMethod(client, "tasks", "delete")(request);
                } catch (error) {
                    if (changedStatus) {
                        try {
                            await requireMethod(
                                client,
                                "tasks",
                                "update",
                            )({
                                ...request,
                                body: originalBody,
                            });
                        } catch {
                            // The count-only receipt records the failed cleanup; it never exposes either error.
                        }
                    }
                    throw error;
                }
            },
        },
        {
            entityType: "projects",
            discover: discoverProjects,
            prepare: async (candidate) => {
                const request = { workspaceId: ctx.workspaceId, projectId: candidate.id };
                let originalBody;
                let changedArchive = false;
                if (candidate.archived !== true) {
                    originalBody = projectUpdateBody(
                        await requireMethod(client, "projects", "get")(request),
                    );
                    changedArchive = originalBody.archived !== true;
                }
                return { request, originalBody, changedArchive };
            },
            remove: async ({ request, originalBody, changedArchive }) => {
                if (changedArchive) {
                    await requireMethod(
                        client,
                        "projects",
                        "update",
                    )({
                        ...request,
                        body: { ...originalBody, archived: true },
                    });
                }
                try {
                    await requireMethod(client, "projects", "delete")(request);
                } catch (error) {
                    if (changedArchive) {
                        try {
                            await requireMethod(
                                client,
                                "projects",
                                "update",
                            )({
                                ...request,
                                body: originalBody,
                            });
                        } catch {
                            // The rescan below retains the leftover and the receipt remains failed.
                        }
                    }
                    throw error;
                }
            },
        },
        {
            entityType: "clients",
            discover: discoverClients,
            prepare: async (candidate) => {
                const request = { workspaceId: ctx.workspaceId, clientId: candidate.id };
                let originalBody;
                let changedArchive = false;
                if (candidate.archived !== true) {
                    originalBody = clientUpdateBody(
                        await requireMethod(client, "clients", "get")(request),
                    );
                    changedArchive = originalBody.archived !== true;
                }
                return { request, originalBody, changedArchive };
            },
            remove: async ({ request, originalBody, changedArchive }) => {
                if (changedArchive) {
                    await requireMethod(
                        client,
                        "clients",
                        "update",
                    )({
                        ...request,
                        body: { ...originalBody, archived: true },
                    });
                }
                try {
                    await requireMethod(client, "clients", "delete")(request);
                } catch (error) {
                    if (changedArchive) {
                        try {
                            await requireMethod(
                                client,
                                "clients",
                                "update",
                            )({
                                ...request,
                                body: originalBody,
                            });
                        } catch {
                            // The rescan below retains the leftover and the receipt remains failed.
                        }
                    }
                    throw error;
                }
            },
        },
        {
            entityType: "tags",
            discover: discoverTags,
            remove: (candidate) =>
                requireMethod(
                    client,
                    "tags",
                    "delete",
                )({
                    workspaceId: ctx.workspaceId,
                    tagId: candidate.id,
                }),
        },
    ];
}

export async function cleanupLivePrefixes(options) {
    const ctx = validateCleanupOptions(options);
    const definitions = actionDefinitions(ctx);
    const actions = [];
    for (const definition of definitions) actions.push(await runAction(definition));

    const complete = actions.every((action) => action.complete);
    const leftovers = complete
        ? actions.reduce((total, action) => total + action.remainingCount, 0)
        : null;
    const ok = complete && leftovers === 0 && actions.every((action) => action.failedCount === 0);
    return {
        ok,
        prefixCount: ctx.prefixes.length,
        actions,
        leftovers,
    };
}
