/**
 * Live sandbox tests for @apet97/clockify-cli-115. Each test invokes `main()`
 * (the same entrypoint the `clockify115` / `clk115` bin uses) with --json
 * mode, captures stdout, and parses the result against the real
 * Clockify API at the workspace pinned by CLOCKIFY_WORKSPACE_ID.
 *
 * Gated on `CLOCKIFY_API_KEY` + `CLOCKIFY_WORKSPACE_ID`; without
 * them the entire suite skips cleanly (`describe.skip`). Mirrors
 * `wrapper/tests/sandbox.test.ts` so CI machines without credentials
 * (the default for GitHub-hosted runners) keep passing.
 *
 * Read smokes are paired with prefixed mutation round-trips. Every created
 * resource is tracked immediately and has an SDK-backed `finally` cleanup,
 * so a failed assertion cannot strand test data.
 */
import { createClockifyClient, getStableErrorCode } from "clockify-sdk-ts-115";
import { archiveThenDeleteClient, archiveThenDeleteProject } from "clockify-sdk-ts-115/ensure";
import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { main } from "../src/index.js";

import {
    cleanupCliLiveResources,
    entitlementMarker,
    requireReceiptId,
    resolveLiveMutationPrefix,
    type CliLiveResources,
} from "./live-sandbox-support.js";

const apiKey = process.env.CLOCKIFY_API_KEY;
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
const livePrefix = resolveLiveMutationPrefix({
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(workspaceId !== undefined ? { workspaceId } : {}),
    ...(process.env.CLOCKIFY_LIVE_WORKSPACE_CONFIRM !== undefined
        ? { workspaceConfirm: process.env.CLOCKIFY_LIVE_WORKSPACE_CONFIRM }
        : {}),
    ...(process.env.CLOCKIFY_LIVE_PREFIX !== undefined
        ? { prefix: process.env.CLOCKIFY_LIVE_PREFIX }
        : {}),
});
const liveSandboxAvailable = livePrefix !== undefined;

const describeLive = liveSandboxAvailable ? describe : describe.skip;

if (!liveSandboxAvailable) {
    console.warn(
        "[sandbox.test] CLOCKIFY_API_KEY and/or CLOCKIFY_WORKSPACE_ID not set in env; CLI live tests skipped.",
    );
}

describeLive("@apet97/clockify-cli-115 live sandbox", () => {
    type ClockifyClient = ReturnType<typeof createClockifyClient>;

    let sdkClient: ClockifyClient;
    let logged: string[] = [];
    let errored: string[] = [];
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeAll(() => {
        sdkClient = createClockifyClient({ apiKey: apiKey! });
    });

    beforeEach(() => {
        logged = [];
        errored = [];
        logSpy = vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
            logged.push(String(msg ?? ""));
        });
        errorSpy = vi.spyOn(console, "error").mockImplementation((msg?: unknown) => {
            errored.push(String(msg ?? ""));
        });
    });

    afterEach(() => {
        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    async function runCli(...args: string[]): Promise<{ code: number; json: unknown }> {
        // Prepend the conventional argv[0]/argv[1] entries so commander
        // parses everything after them as the command. --json is set on
        // every call so the test can JSON.parse stdout.
        const code = await main(["node", "clk115", "--json", ...args]);
        if (code !== 0) {
            throw new Error(
                `CLI exited with code ${code}; stderr=${errored.join("\n")}; stdout=${logged.join("\n")}`,
            );
        }
        const payload = logged[logged.length - 1] ?? "";
        return { code, json: JSON.parse(payload) };
    }

    async function ignoreAlreadyAbsent(action: () => Promise<unknown>): Promise<void> {
        try {
            await action();
        } catch (error) {
            if (getStableErrorCode(error) === "not_found") return;
            throw error;
        }
    }

    async function deleteTaskThroughSdk(task: {
        projectId: string;
        taskId: string;
    }): Promise<void> {
        const current = await sdkClient.tasks.get({
            workspaceId: workspaceId!,
            projectId: task.projectId,
            taskId: task.taskId,
        });
        if (current.status !== "DONE") {
            const body: ClockifyRequestBody<ClockifyApi.UpdateTasksRequest> = {
                name: current.name,
                billable: current.billable,
                status: "DONE",
            };
            const assigneeId: unknown = current.assigneeId;
            if (assigneeId !== undefined && assigneeId !== null) {
                if (typeof assigneeId !== "string") {
                    throw new Error(
                        "Current task has invalid assigneeId; refusing cleanup mutation.",
                    );
                }
                body.assigneeId = assigneeId;
            }
            if (current.assigneeIds !== undefined) body.assigneeIds = current.assigneeIds;
            if (current.budgetEstimate !== undefined) body.budgetEstimate = current.budgetEstimate;
            if (current.estimate !== undefined) body.estimate = current.estimate;
            if (current.userGroupIds !== undefined) body.userGroupIds = current.userGroupIds;
            await sdkClient.tasks.update({
                workspaceId: workspaceId!,
                projectId: task.projectId,
                taskId: task.taskId,
                body,
            });
        }
        await sdkClient.tasks.delete({
            workspaceId: workspaceId!,
            projectId: task.projectId,
            taskId: task.taskId,
        });
    }

    async function cleanup(resources: CliLiveResources): Promise<void> {
        await cleanupCliLiveResources(resources, {
            deleteEntry: (entryId) =>
                ignoreAlreadyAbsent(() =>
                    sdkClient.timeEntries.delete({
                        workspaceId: workspaceId!,
                        timeEntryId: entryId,
                    }),
                ),
            deleteInvoice: (invoiceId) =>
                ignoreAlreadyAbsent(() =>
                    sdkClient.invoices.delete({ workspaceId: workspaceId!, invoiceId }),
                ),
            deleteTask: (task) => ignoreAlreadyAbsent(() => deleteTaskThroughSdk(task)),
            deleteProject: (projectId) =>
                ignoreAlreadyAbsent(() =>
                    archiveThenDeleteProject({
                        workspaceId: workspaceId!,
                        id: projectId,
                        resource: sdkClient.projects,
                    }),
                ),
            deleteClient: (clientId) =>
                ignoreAlreadyAbsent(() =>
                    archiveThenDeleteClient({
                        workspaceId: workspaceId!,
                        id: clientId,
                        resource: sdkClient.clients,
                    }),
                ),
            deleteTag: (tagId) =>
                ignoreAlreadyAbsent(() =>
                    sdkClient.tags.delete({ workspaceId: workspaceId!, tagId }),
                ),
        });
    }

    it("clk115 status returns workspace + user info", async () => {
        const { json } = await runCli("status");
        const data = json as Record<string, unknown>;
        // status prints a flat object whose `workspaceId` echoes the
        // env we pinned; if this mismatches, the auth layer or
        // env-loading regressed.
        expect(data.workspaceId === workspaceId).toBe(true);
        expect(typeof data.userId === "string" || data.userId === undefined).toBe(true);
    }, 20_000);

    it("starts, stops, and deletes one project-bound prefixed time entry", async () => {
        const resources: CliLiveResources = {};
        try {
            const user = await sdkClient.users.getCurrentUser();
            const running = await sdkClient.timeEntries.listInProgress({
                workspaceId: workspaceId!,
            });
            const alreadyRunning = running.some((entry) => entry.userId === user.id);
            if (alreadyRunning) {
                throw new Error(
                    "The governed live user already has a running timer; refusing to replace it.",
                );
            }

            const createdProject = await runCli(
                "projects",
                "create",
                `${livePrefix!}cli-timer-project`,
            );
            resources.projectId = requireReceiptId(createdProject.json, "projectId");

            const started = await runCli(
                "start",
                `${livePrefix!}cli-timer`,
                "--project",
                resources.projectId,
            );
            resources.entryId = requireReceiptId(started.json, "entryId");
            expect((started.json as { description?: string }).description).toBe(
                `${livePrefix!}cli-timer`,
            );

            const stopped = await runCli("stop");
            expect(requireReceiptId(stopped.json, "entryId")).toBe(resources.entryId);

            const deleted = await runCli("entries", "delete", resources.entryId);
            expect(requireReceiptId(deleted.json, "entryId")).toBe(resources.entryId);
            delete resources.entryId;

            const deletedProject = await runCli("projects", "delete", resources.projectId);
            expect(requireReceiptId(deletedProject.json, "projectId")).toBe(resources.projectId);
            delete resources.projectId;
        } finally {
            await cleanup(resources);
        }
    }, 90_000);

    it("creates, gets, updates, and deletes one prefixed tag", async () => {
        const resources: CliLiveResources = {};
        const createdName = `${livePrefix!}cli-tag`;
        const updatedName = `${livePrefix!}cli-tag-updated`;
        try {
            const created = await runCli("tags", "create", createdName);
            resources.tagId = requireReceiptId(created.json, "tagId");

            const fetched = await runCli("tags", "get", resources.tagId);
            expect((fetched.json as { name?: string }).name).toBe(createdName);

            const updated = await runCli("tags", "update", resources.tagId, "--name", updatedName);
            expect((updated.json as { name?: string }).name).toBe(updatedName);

            const deleted = await runCli("tags", "delete", resources.tagId);
            expect(requireReceiptId(deleted.json, "tagId")).toBe(resources.tagId);
            delete resources.tagId;
        } finally {
            await cleanup(resources);
        }
    }, 60_000);

    it("creates and archive-deletes a prefixed client/project/task chain", async () => {
        const resources: CliLiveResources = {};
        try {
            const createdClient = await runCli("clients", "create", `${livePrefix!}cli-client`);
            resources.clientId = requireReceiptId(createdClient.json, "clientId");

            const createdProject = await runCli(
                "projects",
                "create",
                `${livePrefix!}cli-project`,
                "--client",
                resources.clientId,
            );
            resources.projectId = requireReceiptId(createdProject.json, "projectId");

            const createdTask = await runCli(
                "tasks",
                "create",
                resources.projectId,
                `${livePrefix!}cli-task`,
            );
            resources.task = {
                projectId: resources.projectId,
                taskId: requireReceiptId(createdTask.json, "taskId"),
            };

            const deletedTask = await runCli(
                "tasks",
                "delete",
                resources.task.projectId,
                resources.task.taskId,
            );
            expect(requireReceiptId(deletedTask.json, "taskId")).toBe(resources.task.taskId);
            delete resources.task;

            const deletedProject = await runCli("projects", "delete", resources.projectId);
            expect(requireReceiptId(deletedProject.json, "projectId")).toBe(resources.projectId);
            delete resources.projectId;

            const deletedClient = await runCli("clients", "delete", resources.clientId);
            expect(requireReceiptId(deletedClient.json, "clientId")).toBe(resources.clientId);
            delete resources.clientId;
        } finally {
            await cleanup(resources);
        }
    }, 90_000);

    it("round-trips an entitled prefixed invoice draft", async (context) => {
        const resources: CliLiveResources = {};
        try {
            const createdClient = await runCli(
                "clients",
                "create",
                `${livePrefix!}cli-invoice-client`,
            );
            resources.clientId = requireReceiptId(createdClient.json, "clientId");

            const issued = new Date();
            const due = new Date(issued.getTime() + 24 * 60 * 60 * 1000);
            const number = `${livePrefix!}cli-invoice`;
            const createdInvoice = await runCli(
                "invoices",
                "create",
                "--client",
                resources.clientId,
                "--number",
                number,
                "--currency",
                "USD",
                "--issued",
                issued.toISOString().slice(0, 10),
                "--due",
                due.toISOString().slice(0, 10),
            );
            resources.invoiceId = requireReceiptId(createdInvoice.json, "invoiceId");

            const fetched = await sdkClient.invoices.get({
                workspaceId: workspaceId!,
                invoiceId: resources.invoiceId,
            });
            expect(fetched.number).toBe(number);
            expect(fetched.status).toBe("UNSENT");
        } catch (error) {
            const marker = entitlementMarker(error);
            if (marker !== undefined) {
                console.warn(marker);
                context.skip("Invoice API is unavailable with feature_unavailable / HTTP 402.");
                return;
            }
            throw error;
        } finally {
            await cleanup(resources);
        }
    }, 90_000);

    it("clk115 tags list returns an array (existing surface smoke)", async () => {
        const { json } = await runCli("tags", "list", "--limit", "5");
        expect(Array.isArray(json)).toBe(true);
    }, 20_000);

    it("clk115 projects list returns an array (existing surface smoke)", async () => {
        const { json } = await runCli("projects", "list", "--limit", "5");
        expect(Array.isArray(json)).toBe(true);
    }, 20_000);

    it("clk115 clients list returns an array (existing surface smoke)", async () => {
        const { json } = await runCli("clients", "list", "--limit", "5");
        expect(Array.isArray(json)).toBe(true);
    }, 20_000);

    it("clk115 webhooks list returns an array", async () => {
        const { json } = await runCli("webhooks", "list");
        expect(Array.isArray(json)).toBe(true);
    }, 20_000);

    it("clk115 invoices list returns an array", async (context) => {
        try {
            const { json } = await runCli("invoices", "list");
            expect(Array.isArray(json)).toBe(true);
        } catch (error) {
            const marker = entitlementMarker(error);
            if (marker !== undefined) {
                console.warn(marker);
                context.skip("Invoice API is unavailable with feature_unavailable / HTTP 402.");
                return;
            }
            throw error;
        }
    }, 20_000);

    it("clk115 expenses list returns an array", async (context) => {
        try {
            const { json } = await runCli("expenses", "list", "--limit", "5");
            expect(Array.isArray(json)).toBe(true);
        } catch (error) {
            const marker = entitlementMarker(error);
            if (marker !== undefined) {
                console.warn(marker);
                context.skip("Expense API is unavailable with feature_unavailable / HTTP 402.");
                return;
            }
            throw error;
        }
    }, 20_000);

    it("clk115 audit-log search accepts canonical audit actions", async (context) => {
        // Use a tight 1-day window so we don't pull a lot of rows and
        // we exercise the Clockify ≤31-day window contract by staying
        // well within it. Both action names come from AuditLogAction;
        // CREATE_TIME_ENTRY is not a real Clockify audit action.
        const end = new Date();
        const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        try {
            const { json } = await runCli(
                "audit-log",
                "search",
                "--start",
                start.toISOString(),
                "--end",
                end.toISOString(),
                "--actions",
                "CREATE_PROJECT,CREATE_TIME_PERSONAL_TIMER",
                "--authors",
                "SYSTEM",
                "--limit",
                "5",
            );
            // Clockify returns either an array or a wrapped envelope;
            // both are valid because the live shape isn't documented.
            expect(json === null || Array.isArray(json) || typeof json === "object").toBe(true);
        } catch (err) {
            const marker = entitlementMarker(err);
            if (marker !== undefined) {
                console.warn(marker);
                context.skip("Audit log is unavailable with feature_unavailable / HTTP 402.");
                return;
            }
            throw err;
        }
    }, 20_000);
});
