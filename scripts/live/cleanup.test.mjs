import assert from "node:assert/strict";
import test from "node:test";

import { CLEANUP_ENTITY_ORDER, cleanupLivePrefixes, validateCleanupOptions } from "./cleanup.mjs";

const workspaceId = "a".repeat(24);
const userId = "b".repeat(24);
const prefix = "clockify115-live-20260712-abc-";
const rangeStart = "2020-01-01T00:00:00.000Z";
const rangeEnd = "2030-01-01T00:00:00.000Z";
const id = (value) => value.toString(16).padStart(24, "0");

function page(items, request) {
    const pageNumber = request.page ?? 1;
    const pageSize = request["page-size"] ?? request.pageSize ?? 200;
    return items.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
}

function makeFakeClient({ failDelete, malformedList, mutateState, wideSchedulingOverflow } = {}) {
    const state = {
        runningEntries: [
            { id: id(1), description: `${prefix}running` },
            { id: id(91), description: "unrelated running entry" },
        ],
        finishedEntries: [
            { id: id(1), description: `${prefix}running` },
            { id: id(2), description: `${prefix}finished` },
            { id: id(92), description: "unrelated finished entry" },
        ],
        assignments: [
            {
                id: id(3),
                note: `${prefix}assignment`,
                projectId: id(10),
                projectName: `${prefix}project`,
            },
            {
                id: id(93),
                note: "unrelated assignment",
                projectId: id(99),
                projectName: "Operations",
            },
        ],
        timeOffRequests: [
            {
                id: id(4),
                policyId: id(44),
                note: `${prefix}time-off`,
                status: { statusType: "PENDING" },
            },
            {
                id: id(94),
                policyId: id(45),
                note: "unrelated request",
                status: { statusType: "PENDING" },
            },
        ],
        expenses: [
            { id: id(5), notes: `${prefix}expense` },
            { id: id(95), notes: "unrelated expense" },
        ],
        invoices: [
            { id: id(6), number: `${prefix}invoice`, status: "UNSENT" },
            { id: id(96), number: "INV-96", status: "UNSENT" },
        ],
        sharedReports: [
            { id: id(7), name: `${prefix}report` },
            { id: id(97), name: "Unrelated report" },
        ],
        webhooks: [
            { id: id(8), name: `${prefix}webhook` },
            { id: id(98), name: "Unrelated webhook" },
        ],
        projects: [
            {
                id: id(10),
                name: `${prefix}project`,
                archived: false,
                billable: false,
                clientId: id(11),
                color: "#123456",
                costRate: { amount: 0, currency: "USD" },
                hourlyRate: { amount: 0, currency: "USD" },
                note: "",
                public: false,
            },
            {
                id: id(99),
                name: "Unrelated project",
                archived: false,
                billable: true,
                color: "#654321",
                public: true,
            },
        ],
        tasks: new Map([
            [
                id(10),
                [
                    {
                        id: id(9),
                        projectId: id(10),
                        name: `${prefix}task`,
                        status: "ACTIVE",
                        billable: false,
                        budgetEstimate: 0,
                        estimate: "",
                        assigneeIds: [],
                        userGroupIds: [],
                    },
                    {
                        id: id(90),
                        projectId: id(10),
                        name: "Unrelated task",
                        status: "ACTIVE",
                        billable: true,
                    },
                ],
            ],
            [id(99), []],
        ]),
        clients: [
            {
                id: id(11),
                name: `${prefix}client`,
                archived: false,
                address: "",
                currencyCode: "USD",
                email: "",
                note: "",
            },
            { id: id(89), name: "Unrelated client", archived: false },
        ],
        tags: [
            { id: id(12), name: `${prefix}tag`, archived: false },
            { id: id(88), name: "Unrelated tag", archived: false },
        ],
    };
    mutateState?.(state);
    const calls = [];

    function record(name, request) {
        calls.push({ name, request: structuredClone(request) });
        if (name === failDelete) throw new Error("secret SDK failure");
    }

    const client = {
        timeEntries: {
            async listInProgress(request) {
                record("timeEntries.listInProgress", request);
                return page(state.runningEntries, request);
            },
            async listForUser(request) {
                record("timeEntries.listForUser", request);
                return page(state.finishedEntries, request);
            },
            async delete(request) {
                record("timeEntries.delete", request);
                state.runningEntries = state.runningEntries.filter(
                    (item) => item.id !== request.timeEntryId,
                );
                state.finishedEntries = state.finishedEntries.filter(
                    (item) => item.id !== request.timeEntryId,
                );
            },
        },
        scheduling: {
            async list(request) {
                record("scheduling.list", request);
                if (malformedList === "scheduling") return { assignments: "not-an-array" };
                const span = Date.parse(request.end) - Date.parse(request.start);
                if (wideSchedulingOverflow && span > 10 * 366 * 24 * 60 * 60 * 1000) {
                    return Array.from({ length: request["page-size"] }, (_, index) => ({
                        id: id(500 + (request.page - 1) * request["page-size"] + index),
                        note: "unrelated wide-range assignment",
                        projectId: id(99),
                        projectName: "Operations",
                    }));
                }
                return page(state.assignments, request);
            },
            async deleteRecurring(request) {
                record("scheduling.deleteRecurring", request);
                state.assignments = state.assignments.filter(
                    (item) => item.id !== request.assignmentId,
                );
            },
        },
        timeOff: {
            async list(request) {
                record("timeOff.list", request);
                const requests = page(state.timeOffRequests, request);
                return { count: state.timeOffRequests.length, requests };
            },
            async withdraw(request) {
                record("timeOff.withdraw", request);
                state.timeOffRequests = state.timeOffRequests.filter(
                    (item) => item.id !== request.requestId,
                );
            },
            async delete(request) {
                record("timeOff.delete.dead-route", request);
                throw Object.assign(new Error("dead flat route"), { statusCode: 404 });
            },
        },
        expenses: {
            async list(request) {
                record("expenses.list", request);
                const expenses = page(state.expenses, request);
                return { expenses: { count: state.expenses.length, expenses } };
            },
            async delete(request) {
                record("expenses.delete", request);
                state.expenses = state.expenses.filter((item) => item.id !== request.expenseId);
            },
        },
        invoices: {
            async list(request) {
                record("invoices.list", request);
                return { total: state.invoices.length, invoices: page(state.invoices, request) };
            },
            async delete(request) {
                record("invoices.delete", request);
                state.invoices = state.invoices.filter((item) => item.id !== request.invoiceId);
            },
        },
        sharedReports: {
            async list(request) {
                record("sharedReports.list", request);
                return {
                    count: state.sharedReports.length,
                    reports: page(state.sharedReports, request),
                };
            },
            async delete(request) {
                record("sharedReports.delete", request);
                state.sharedReports = state.sharedReports.filter(
                    (item) => item.id !== request.sharedReportId,
                );
            },
        },
        webhooks: {
            async list(request) {
                record("webhooks.list", request);
                return { webhooks: state.webhooks, workspaceWebhookCount: state.webhooks.length };
            },
            async delete(request) {
                record("webhooks.delete", request);
                state.webhooks = state.webhooks.filter((item) => item.id !== request.webhookId);
            },
        },
        tasks: {
            async list(request) {
                record("tasks.list", request);
                const visible = (state.tasks.get(request.projectId) ?? []).filter((item) =>
                    typeof request["is-active"] === "boolean"
                        ? (item.status === "ACTIVE") === request["is-active"]
                        : item.status === "ACTIVE",
                );
                return page(visible, request);
            },
            async get(request) {
                record("tasks.get", request);
                return structuredClone(
                    (state.tasks.get(request.projectId) ?? []).find(
                        (item) => item.id === request.taskId,
                    ),
                );
            },
            async update(request) {
                record("tasks.update", request);
                const body = request.body ?? request;
                const tasks = state.tasks.get(request.projectId) ?? [];
                const index = tasks.findIndex((item) => item.id === request.taskId);
                tasks[index] = { ...tasks[index], ...body };
                return structuredClone(tasks[index]);
            },
            async delete(request) {
                record("tasks.delete", request);
                state.tasks.set(
                    request.projectId,
                    (state.tasks.get(request.projectId) ?? []).filter(
                        (item) => item.id !== request.taskId,
                    ),
                );
            },
        },
        projects: {
            async list(request) {
                record("projects.list", request);
                const visible = state.projects.filter((item) =>
                    typeof request.archived === "boolean"
                        ? item.archived === request.archived
                        : item.archived !== true,
                );
                return page(visible, request);
            },
            async get(request) {
                record("projects.get", request);
                return structuredClone(
                    state.projects.find((item) => item.id === request.projectId),
                );
            },
            async update(request) {
                record("projects.update", request);
                const body = request.body ?? request;
                const project = state.projects.find((item) => item.id === request.projectId);
                if (project) {
                    Object.assign(project, body);
                    if (body.isPublic !== undefined) project.public = body.isPublic;
                }
                return structuredClone(project);
            },
            async delete(request) {
                record("projects.delete", request);
                state.projects = state.projects.filter((item) => item.id !== request.projectId);
                state.tasks.delete(request.projectId);
            },
        },
        clients: {
            async list(request) {
                record("clients.list", request);
                const visible = state.clients.filter((item) =>
                    typeof request.archived === "boolean"
                        ? item.archived === request.archived
                        : item.archived !== true,
                );
                return page(visible, request);
            },
            async get(request) {
                record("clients.get", request);
                return structuredClone(state.clients.find((item) => item.id === request.clientId));
            },
            async update(request) {
                record("clients.update", request);
                const item = state.clients.find((candidate) => candidate.id === request.clientId);
                if (item) Object.assign(item, request.body ?? request);
                return structuredClone(item);
            },
            async delete(request) {
                record("clients.delete", request);
                state.clients = state.clients.filter((item) => item.id !== request.clientId);
            },
        },
        tags: {
            async list(request) {
                record("tags.list", request);
                const visible = state.tags.filter((item) =>
                    typeof request.archived === "boolean"
                        ? item.archived === request.archived
                        : item.archived !== true,
                );
                return page(visible, request);
            },
            async delete(request) {
                record("tags.delete", request);
                state.tags = state.tags.filter((item) => item.id !== request.tagId);
            },
        },
    };

    return { client, calls, state };
}

const options = (client, overrides = {}) => ({
    client,
    workspaceId,
    userId,
    prefixes: [prefix],
    rangeStart,
    rangeEnd,
    pageSize: 1,
    maxPages: 100,
    ...overrides,
});

test("cleans all eleven entity classes in dependency order and returns count-only receipts", async () => {
    const fake = makeFakeClient();

    const receipt = await cleanupLivePrefixes(options(fake.client));

    assert.deepEqual(CLEANUP_ENTITY_ORDER, [
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
    assert.equal(receipt.ok, true);
    assert.equal(receipt.prefixCount, 1);
    assert.equal(receipt.leftovers, 0);
    assert.deepEqual(
        receipt.actions.map((action) => action.entityType),
        CLEANUP_ENTITY_ORDER,
    );
    assert.deepEqual(
        receipt.actions.map((action) => [
            action.sanitizedIdCount,
            action.deletedCount,
            action.failedCount,
            action.remainingCount,
            action.complete,
        ]),
        [[2, 2, 0, 0, true], ...Array.from({ length: 10 }, () => [1, 1, 0, 0, true])],
    );

    const mutationOrder = fake.calls
        .map((call) => call.name)
        .filter((name) =>
            [
                "timeEntries.delete",
                "scheduling.deleteRecurring",
                "timeOff.withdraw",
                "expenses.delete",
                "invoices.delete",
                "sharedReports.delete",
                "webhooks.delete",
                "tasks.update",
                "tasks.delete",
                "projects.get",
                "projects.update",
                "projects.delete",
                "clients.get",
                "clients.update",
                "clients.delete",
                "tags.delete",
            ].includes(name),
        );
    assert.deepEqual(mutationOrder, [
        "timeEntries.delete",
        "timeEntries.delete",
        "scheduling.deleteRecurring",
        "timeOff.withdraw",
        "expenses.delete",
        "invoices.delete",
        "sharedReports.delete",
        "webhooks.delete",
        "tasks.update",
        "tasks.delete",
        "projects.get",
        "projects.update",
        "projects.delete",
        "clients.get",
        "clients.update",
        "clients.delete",
        "tags.delete",
    ]);
    assert.equal(
        fake.calls.find((call) => call.name === "scheduling.deleteRecurring").request
            .seriesUpdateOption,
        "ALL",
    );
    assert.deepEqual(fake.calls.find((call) => call.name === "invoices.list").request.statuses, [
        "UNSENT",
    ]);
    assert.deepEqual(fake.calls.find((call) => call.name === "timeOff.list").request.statuses, [
        "PENDING",
    ]);
    assert.deepEqual(fake.calls.find((call) => call.name === "timeOff.withdraw").request, {
        workspaceId,
        policyId: id(44),
        requestId: id(4),
    });
    assert.equal(
        fake.calls.some((call) => call.name === "timeOff.delete.dead-route"),
        false,
    );
    assert.deepEqual(fake.calls.find((call) => call.name === "projects.update").request, {
        workspaceId,
        projectId: id(10),
        body: {
            name: `${prefix}project`,
            archived: true,
            billable: false,
            clientId: id(11),
            color: "#123456",
            costRate: { amount: 0 },
            hourlyRate: { amount: 0 },
            isPublic: false,
            note: "",
        },
    });
    assert.deepEqual(fake.calls.find((call) => call.name === "clients.update").request, {
        workspaceId,
        clientId: id(11),
        body: {
            name: `${prefix}client`,
            archived: true,
            address: "",
            currencyCode: "USD",
            email: "",
            note: "",
        },
    });
    assert.equal(fake.state.runningEntries.length, 1);
    assert.equal(fake.state.finishedEntries.length, 1);
    assert.equal(fake.state.assignments.length, 1);
    assert.equal(fake.state.timeOffRequests.length, 1);
    assert.equal(fake.state.expenses.length, 1);
    assert.equal(fake.state.invoices.length, 1);
    assert.equal(fake.state.sharedReports.length, 1);
    assert.equal(fake.state.webhooks.length, 1);
    assert.equal(fake.state.projects.length, 1);
    assert.equal(fake.state.clients.length, 1);
    assert.equal(fake.state.tags.length, 1);

    const serialized = JSON.stringify(receipt);
    assert.equal(serialized.includes(workspaceId), false);
    assert.equal(serialized.includes(userId), false);
    assert.equal(serialized.includes(prefix), false);
    for (let value = 1; value <= 12; value += 1) {
        assert.equal(serialized.includes(id(value)), false);
    }
});

test("fails one malformed entity closed without mutating it and continues later cleanup", async () => {
    const fake = makeFakeClient({ malformedList: "scheduling" });

    const receipt = await cleanupLivePrefixes(options(fake.client));

    const scheduling = receipt.actions.find(
        (action) => action.entityType === "scheduling_assignments",
    );
    assert.deepEqual(scheduling, {
        entityType: "scheduling_assignments",
        sanitizedIdCount: 0,
        deletedCount: 0,
        failedCount: 1,
        remainingCount: null,
        complete: false,
        failureCode: "malformed_state",
    });
    assert.equal(receipt.ok, false);
    assert.equal(receipt.leftovers, null);
    assert.equal(
        fake.calls.some((call) => call.name === "scheduling.deleteRecurring"),
        false,
    );
    assert.equal(
        fake.calls.some((call) => call.name === "tags.delete"),
        true,
    );
});

test("records a delete failure, rescans leftovers, and continues with dependent cleanup", async () => {
    const fake = makeFakeClient({ failDelete: "webhooks.delete" });

    const receipt = await cleanupLivePrefixes(options(fake.client));

    assert.deepEqual(
        receipt.actions.find((action) => action.entityType === "webhooks"),
        {
            entityType: "webhooks",
            sanitizedIdCount: 1,
            deletedCount: 0,
            failedCount: 1,
            remainingCount: 1,
            complete: true,
        },
    );
    assert.equal(receipt.ok, false);
    assert.equal(receipt.leftovers, 1);
    assert.equal(
        fake.calls.some((call) => call.name === "tasks.delete"),
        true,
    );
    assert.equal(
        fake.calls.some((call) => call.name === "tags.delete"),
        true,
    );
    assert.equal(JSON.stringify(receipt).includes("secret SDK failure"), false);
});

test("preflights every replacement body before mutating any candidate in that entity class", async () => {
    const fake = makeFakeClient({
        mutateState(state) {
            state.tasks.get(id(10)).push({
                id: id(13),
                projectId: id(10),
                name: `${prefix}malformed-task`,
                status: "ACTIVE",
                // billable is deliberately absent: replacement state is incomplete.
            });
        },
    });

    const receipt = await cleanupLivePrefixes(options(fake.client));

    const tasks = receipt.actions.find((action) => action.entityType === "tasks");
    assert.equal(tasks.sanitizedIdCount, 2);
    assert.equal(tasks.deletedCount, 0);
    assert.equal(tasks.failedCount, 2);
    assert.equal(tasks.remainingCount, 2);
    assert.equal(tasks.complete, true);
    assert.equal(tasks.failureCode, "malformed_state");
    assert.equal(
        fake.calls.some((call) => call.name === "tasks.update"),
        false,
    );
    assert.equal(
        fake.calls.some((call) => call.name === "tasks.delete"),
        false,
    );
    assert.equal(
        fake.calls.some((call) => call.name === "projects.delete"),
        true,
    );
});

test("finds assignments through a prefixed project even when assignment labels are not prefixed", async () => {
    const fake = makeFakeClient({
        mutateState(state) {
            state.assignments[0] = {
                id: id(3),
                note: "",
                projectId: id(10),
                projectName: "ordinary assignment label",
            };
        },
    });

    const receipt = await cleanupLivePrefixes(options(fake.client));

    const assignments = receipt.actions.find(
        (action) => action.entityType === "scheduling_assignments",
    );
    assert.equal(assignments.sanitizedIdCount, 1);
    assert.equal(assignments.deletedCount, 1);
    assert.equal(
        fake.calls.some((call) => call.name === "scheduling.deleteRecurring"),
        true,
    );
    assert.equal(
        fake.state.assignments.some((item) => item.id === id(3)),
        false,
    );
});

test("scans archived parents, done tasks, and archived tags explicitly", async () => {
    const fake = makeFakeClient({
        mutateState(state) {
            state.projects.push({
                id: id(14),
                name: `${prefix}archived-project`,
                archived: true,
                billable: false,
                color: "#abcdef",
                public: false,
            });
            state.tasks.set(id(14), [
                {
                    id: id(15),
                    projectId: id(14),
                    name: `${prefix}done-task`,
                    status: "DONE",
                    billable: false,
                },
            ]);
            state.clients.push({
                id: id(16),
                name: `${prefix}archived-client`,
                archived: true,
            });
            state.tags.push({
                id: id(17),
                name: `${prefix}archived-tag`,
                archived: true,
            });
        },
    });

    const receipt = await cleanupLivePrefixes(options(fake.client));

    assert.equal(
        receipt.actions.find((action) => action.entityType === "tasks").sanitizedIdCount,
        2,
    );
    assert.equal(
        receipt.actions.find((action) => action.entityType === "projects").sanitizedIdCount,
        2,
    );
    assert.equal(
        receipt.actions.find((action) => action.entityType === "clients").sanitizedIdCount,
        2,
    );
    assert.equal(
        receipt.actions.find((action) => action.entityType === "tags").sanitizedIdCount,
        2,
    );
    assert.equal(
        fake.state.projects.some((item) => item.id === id(14)),
        false,
    );
    assert.equal(
        fake.state.clients.some((item) => item.id === id(16)),
        false,
    );
    assert.equal(
        fake.state.tags.some((item) => item.id === id(17)),
        false,
    );
    assert.equal(
        fake.calls.some((call) => call.name === "tasks.delete" && call.request.taskId === id(15)),
        true,
    );
    for (const resource of ["projects", "clients", "tags"]) {
        const archiveFilters = new Set(
            fake.calls
                .filter((call) => call.name === `${resource}.list`)
                .map((call) => call.request.archived),
        );
        assert.deepEqual(archiveFilters, new Set([false, true]));
    }
    assert.deepEqual(
        new Set(
            fake.calls
                .filter((call) => call.name === "tasks.list")
                .map((call) => call.request["is-active"]),
        ),
        new Set([true, false]),
    );
});

test("rescans and reports pre-archived project leftovers after delete failures", async () => {
    const fake = makeFakeClient({
        failDelete: "projects.delete",
        mutateState(state) {
            state.projects.push({
                id: id(14),
                name: `${prefix}archived-project`,
                archived: true,
                billable: false,
                color: "#abcdef",
                public: false,
            });
            state.tasks.set(id(14), []);
        },
    });

    const receipt = await cleanupLivePrefixes(options(fake.client));

    const projects = receipt.actions.find((action) => action.entityType === "projects");
    assert.equal(projects.sanitizedIdCount, 2);
    assert.equal(projects.deletedCount, 0);
    assert.equal(projects.failedCount, 2);
    assert.equal(projects.remainingCount, 2);
    assert.equal(receipt.ok, false);
    assert.equal(
        fake.state.projects.some((item) => item.id === id(14)),
        true,
    );
});

test("discovers scheduling assignments across bounded decade windows for the full 2000-2100 range", async () => {
    const fake = makeFakeClient({ wideSchedulingOverflow: true });
    const centuryStart = "2000-01-01T00:00:00.000Z";
    const centuryEnd = "2100-01-01T00:00:00.000Z";

    const receipt = await cleanupLivePrefixes(
        options(fake.client, {
            rangeStart: centuryStart,
            rangeEnd: centuryEnd,
            pageSize: 2,
            maxPages: 3,
        }),
    );

    const assignments = receipt.actions.find(
        (action) => action.entityType === "scheduling_assignments",
    );
    assert.deepEqual(assignments, {
        entityType: "scheduling_assignments",
        sanitizedIdCount: 1,
        deletedCount: 1,
        failedCount: 0,
        remainingCount: 0,
        complete: true,
    });
    const ranges = fake.calls
        .filter((call) => call.name === "scheduling.list" && call.request.page === 1)
        .map((call) => [call.request.start, call.request.end]);
    assert.equal(
        ranges.some(([start, end]) => start === centuryStart && end === centuryEnd),
        false,
    );
    assert.deepEqual(ranges.slice(0, 10), [
        ["2000-01-01T00:00:00.000Z", "2010-01-01T00:00:00.000Z"],
        ["2010-01-01T00:00:00.000Z", "2020-01-01T00:00:00.000Z"],
        ["2020-01-01T00:00:00.000Z", "2030-01-01T00:00:00.000Z"],
        ["2030-01-01T00:00:00.000Z", "2040-01-01T00:00:00.000Z"],
        ["2040-01-01T00:00:00.000Z", "2050-01-01T00:00:00.000Z"],
        ["2050-01-01T00:00:00.000Z", "2060-01-01T00:00:00.000Z"],
        ["2060-01-01T00:00:00.000Z", "2070-01-01T00:00:00.000Z"],
        ["2070-01-01T00:00:00.000Z", "2080-01-01T00:00:00.000Z"],
        ["2080-01-01T00:00:00.000Z", "2090-01-01T00:00:00.000Z"],
        ["2090-01-01T00:00:00.000Z", "2100-01-01T00:00:00.000Z"],
    ]);
    assert.equal(
        fake.state.assignments.some((item) => item.id === id(3)),
        false,
    );
});

test("continues scheduling pagination past a wholly repeated intermediate page", async () => {
    const fake = makeFakeClient();
    const repeated = {
        id: id(93),
        note: "unrelated repeated assignment",
        projectId: id(99),
        projectName: "Operations",
    };
    fake.client.scheduling.list = async (request) => {
        fake.calls.push({ name: "scheduling.list", request: structuredClone(request) });
        if (request.page === 1 || request.page === 2) return [repeated];
        if (
            request.page === 3 &&
            fake.state.assignments.some((assignment) => assignment.id === id(3))
        ) {
            return [fake.state.assignments.find((assignment) => assignment.id === id(3))];
        }
        return [];
    };

    const receipt = await cleanupLivePrefixes(options(fake.client, { pageSize: 200, maxPages: 5 }));

    assert.deepEqual(
        receipt.actions.find((action) => action.entityType === "scheduling_assignments"),
        {
            entityType: "scheduling_assignments",
            sanitizedIdCount: 1,
            deletedCount: 1,
            failedCount: 0,
            remainingCount: 0,
            complete: true,
        },
    );
    assert.equal(
        fake.calls.some((call) => call.name === "scheduling.list" && call.request.page === 3),
        true,
    );
    assert.equal(
        fake.state.assignments.some((assignment) => assignment.id === id(3)),
        false,
    );
});

test("rejects unsafe scope before the first SDK call", async () => {
    const fake = makeFakeClient();

    assert.throws(
        () => validateCleanupOptions(options(fake.client, { prefixes: ["x"] })),
        /prefix/i,
    );
    await assert.rejects(
        cleanupLivePrefixes(options(fake.client, { workspaceId: "not-an-id" })),
        /workspaceId/i,
    );
    assert.equal(fake.calls.length, 0);
});

test("continues paging until empty when the server clamps below requested page size", async () => {
    const fake = makeFakeClient({
        mutateState(state) {
            state.tags = [
                { id: id(201), name: `${prefix}tag-one`, archived: false },
                { id: id(202), name: `${prefix}tag-two`, archived: false },
            ];
        },
    });
    fake.client.tags.list = async (request) => {
        fake.calls.push({ name: "tags.list", request: structuredClone(request) });
        const visible = fake.state.tags.filter((item) => item.archived === request.archived);
        const index = (request.page ?? 1) - 1;
        return visible.slice(index, index + 1);
    };

    const receipt = await cleanupLivePrefixes(
        options(fake.client, { pageSize: 200, maxPages: 10 }),
    );
    const tags = receipt.actions.find((action) => action.entityType === "tags");
    assert.deepEqual(tags, {
        entityType: "tags",
        sanitizedIdCount: 2,
        deletedCount: 2,
        failedCount: 0,
        remainingCount: 0,
        complete: true,
    });
    assert.equal(receipt.ok, true);
});
