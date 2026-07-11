import { describe, expect, it } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerProjectsCommand } from "../src/commands/projects.js";
import { registerTasksCommand } from "../src/commands/tasks.js";

import { lastJson, makeProgram } from "./read-commands.helpers.js";

describe("project and task read command branches", () => {
    it("projects list applies filters, clamps the page size, and maps empty fallbacks", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            projects: {
                list: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return [
                        {
                            id: "p-1",
                            name: "Website",
                            clientId: "c-1",
                            archived: true,
                            billable: true,
                        },
                        {},
                    ];
                },
            },
        };
        await makeProgram(registerProjectsCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "projects",
            "list",
            "--limit",
            "999",
            "--name",
            "Web",
            "--archived",
            "--client",
            "c-1",
        ]);
        expect(calls[0]).toMatchObject({
            workspaceId: "ws-1",
            "page-size": 200,
            name: "Web",
            archived: true,
            clients: ["c-1"],
        });
        const rows = lastJson() as Array<Record<string, unknown>>;
        expect(rows[0]).toMatchObject({ id: "p-1", archived: true, billable: true });
        expect(rows[1]).toMatchObject({ id: "", name: "", archived: false, billable: false });
    });

    it("projects create carries optional client/color/billable fields", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            projects: {
                create: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    const body = req.body as Record<string, unknown>;
                    return { id: "p-2", name: body.name, clientId: body.clientId, color: body.color };
                },
            },
        };
        await makeProgram(registerProjectsCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "projects",
            "create",
            "Website",
            "--client",
            "c-1",
            "--color",
            "#123456",
            "--billable",
        ]);
        expect(calls[0]!.body).toMatchObject({
            name: "Website",
            clientId: "c-1",
            color: "#123456",
            billable: true,
        });
        expect((lastJson() as Record<string, unknown>).action).toBe("projects.create");
    });

    it("projects create and update cover omitted option branches", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            projects: {
                create: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    const body = req.body as Record<string, unknown>;
                    return { id: "p-3", name: body.name };
                },
                update: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return { id: req.projectId, name: (req.body as { name?: string }).name ?? "" };
                },
            },
        };
        await makeProgram(registerProjectsCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "projects",
            "create",
            "Minimal",
        ]);
        expect(calls[0]!.body).toEqual({ name: "Minimal" });

        await makeProgram(registerProjectsCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "projects",
            "update",
            "p-3",
            "--client",
            "c-1",
            "--color",
            "#abcdef",
            "--note",
            "",
            "--no-billable",
            "--no-archived",
        ]);
        expect(calls[1]!.body).toMatchObject({
            clientId: "c-1",
            color: "#abcdef",
            note: "",
            billable: false,
            archived: false,
        });
    });

    it("tasks list applies filters and maps billable/status fields", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            tasks: {
                list: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return [
                        { id: "tk-1", name: "QA", status: "ACTIVE", billable: true },
                        {},
                    ];
                },
            },
        };
        await makeProgram(registerTasksCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "tasks",
            "list",
            "p-1",
            "--limit",
            "10",
            "--name",
            "QA",
        ]);
        expect(calls[0]).toMatchObject({
            workspaceId: "ws-1",
            projectId: "p-1",
            "page-size": 10,
            name: "QA",
        });
        const rows = lastJson() as Array<Record<string, unknown>>;
        expect(rows[0]).toMatchObject({ id: "tk-1", status: "ACTIVE", billable: true });
        expect(rows[1]).toMatchObject({ id: "", name: "", status: "", billable: false });
    });

    it("tasks create carries estimate, billable, and assignee ids", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            tasks: {
                create: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    const body = req.body as Record<string, unknown>;
                    return { id: "tk-2", name: body.name };
                },
            },
        };
        await makeProgram(registerTasksCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "tasks",
            "create",
            "p-1",
            "QA",
            "--estimate",
            "PT8H",
            "--billable",
            "--assignee",
            "u-1",
            "u-2",
        ]);
        expect(calls[0]!.body).toMatchObject({
            name: "QA",
            estimate: "PT8H",
            billable: true,
            assigneeIds: ["u-1", "u-2"],
        });
    });
});
