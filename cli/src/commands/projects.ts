/**
 * `clk115 projects {list,create,get,update,delete}`.
 */
import { archiveThenDeleteProject } from "clockify-sdk-ts-115/ensure";
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import type { Command } from "commander";

import { printObject, printRecords } from "../output.js";
import { printReceipt } from "../receipt.js";

import { clampPageSize, parseIntArg, resolveContext } from "./helpers.js";
import { leafCommand } from "./leaf-command.js";
import type { Registrar } from "./types.js";

function projectUpdateCarryFields(current: { billable?: unknown; public?: unknown }): {
    billable: boolean;
    isPublic: boolean;
} {
    if (typeof current.billable !== "boolean" || typeof current.public !== "boolean") {
        throw new Error(
            "Cannot update project safely: the current project did not return boolean billable and public fields.",
        );
    }
    return { billable: current.billable, isPublic: current.public };
}

export const registerProjectsCommand: Registrar = (program, services) => {
    const projects = program.command("projects").description("Manage projects.");

    leafCommand(projects, "list", "read")
        .description("List projects in the workspace.")
        .addHelpText(
            "after",
            "\nExamples:\n" +
                "  $ clk115 projects list\n" +
                "  $ clk115 projects list --name Website --archived\n",
        )
        .option("--limit <n>", "Items per page (default 25, max 200).", parseIntArg, 25)
        .option("--page <n>", "Page number.", parseIntArg, 1)
        .option("--name <text>", "Filter by project name substring.")
        .option("--archived", "Show only archived projects (default lists both archived and active).", false)
        .option("--client <id>", "Filter by client ID.")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const req: ClockifyApi.ListProjectsRequest = {
                workspaceId,
                page: opts.page,
                "page-size": clampPageSize(opts.limit, 200),
            };
            if (opts.name) req.name = opts.name;
            if (opts.archived) req.archived = true;
            if (opts.client) req.clients = [opts.client];
            const items = await client.projects.list(req);
            const rows = items.map((raw) => {
                const p = raw as {
                    id?: string;
                    name?: string;
                    clientId?: string;
                    color?: string;
                    archived?: boolean;
                    billable?: boolean;
                };
                return {
                    id: p.id ?? "",
                    name: p.name ?? "",
                    clientId: p.clientId ?? "",
                    color: p.color ?? "",
                    archived: p.archived === true,
                    billable: p.billable === true,
                };
            });
            printRecords(rows, output);
        });

    leafCommand(projects, "create", "write")
        .argument("<name>", "Project name.")
        .option("--client <id>", "Client ID.")
        .option("--color <hex>", "Hex color (e.g. #4caf50).")
        .option("--billable", "Mark as billable.", false)
        .description("Create a project in the workspace.")
        .addHelpText(
            "after",
            "\nExamples:\n" +
                "  $ clk115 projects create Website\n" +
                "  $ clk115 projects create Website --client client_123 --billable\n",
        )
        .action(async function (this: Command, name: string, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const req: ClockifyApi.CreateProjectRequest = {
                workspaceId,
                body: {
                    name,
                    ...(opts.client ? { clientId: opts.client } : {}),
                    ...(opts.color ? { color: opts.color } : {}),
                    ...(opts.billable ? { billable: true } : {}),
                },
            };
            const created = (await client.projects.create(req)) as {
                id?: string;
                name?: string;
                clientId?: string;
                color?: string;
            };
            const data = {
                id: created.id ?? "",
                name: created.name ?? "",
                clientId: created.clientId ?? "",
                color: created.color ?? "",
            };
            printReceipt(
                {
                    ok: true,
                    action: "projects.create",
                    entity: "project",
                    ids: { projectId: data.id },
                    data,
                    changed: { created: [{ type: "project", id: data.id, name: data.name }] },
                    next: [
                        {
                            command: `clk115 tasks list ${data.id} --json`,
                            reason: "Review tasks for this project.",
                        },
                    ],
                },
                output,
            );
        });

    leafCommand(projects, "get", "read")
        .argument("<id>", "Project ID.")
        .description("Get one project by ID.")
        .addHelpText("after", "\nExamples:\n" + "  $ clk115 projects get project_123\n")
        .action(async function (this: Command, id: string) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const project = await client.projects.get({ workspaceId, projectId: id });
            printObject(project, output);
        });

    leafCommand(projects, "update", "write")
        .argument("<id>", "Project ID.")
        .option("--name <text>", "New project name.")
        .option("--client <id>", "Client ID.")
        .option("--color <hex>", "Hex color (e.g. #4caf50).")
        .option("--note <text>", "Project note.")
        .option("--billable", "Mark as billable.")
        .option("--no-billable", "Mark as non-billable.")
        .option("--archived", "Archive the project.")
        .option("--no-archived", "Unarchive the project.")
        .description("Update a project by ID.")
        .addHelpText(
            "after",
            "\nExamples:\n" +
                "  $ clk115 projects update project_123 --name \"New name\"\n" +
                "  $ clk115 projects update project_123 --archived\n",
        )
        .action(async function (this: Command, id: string, opts) {
            // Truthiness on name/client/color deliberately matches the
            // `if (opts.x)` body build below, so `--name ""` alone cannot still
            // send the empty replace-PUT this guard exists to prevent.
            const hasChanges =
                Boolean(opts.name) ||
                Boolean(opts.client) ||
                Boolean(opts.color) ||
                opts.note !== undefined ||
                opts.billable !== undefined ||
                opts.archived !== undefined;
            if (!hasChanges) {
                throw new Error("projects.update needs a change: provide at least one project field.");
            }
            const { client, workspaceId, output } = await resolveContext(this, services);
            const current = await client.projects.get({ workspaceId, projectId: id });
            const body: ClockifyRequestBody<ClockifyApi.UpdateProjectsRequest> =
                projectUpdateCarryFields(current);
            if (opts.name) body.name = opts.name;
            if (opts.client) body.clientId = opts.client;
            if (opts.color) body.color = opts.color;
            if (opts.note !== undefined) body.note = opts.note;
            if (opts.billable !== undefined) body.billable = opts.billable;
            if (opts.archived !== undefined) body.archived = opts.archived;
            const req: ClockifyApi.UpdateProjectsRequest = { workspaceId, projectId: id, body };
            const updated = (await client.projects.update(req)) as { id?: string; name?: string };
            const data = { id: updated.id ?? id, name: updated.name ?? "" };
            printReceipt(
                {
                    ok: true,
                    action: "projects.update",
                    entity: "project",
                    ids: { projectId: data.id },
                    data,
                    changed: { updated: [{ type: "project", id: data.id, name: data.name }] },
                    next: [
                        {
                            command: `clk115 projects get ${data.id} --json`,
                            reason: "Verify the update.",
                        },
                    ],
                },
                output,
            );
        });

    leafCommand(projects, "delete", "destructive")
        .argument("<id>", "Project ID.")
        .description(
            "Delete a project by ID (archives first; an active project cannot be deleted).",
        )
        .addHelpText("after", "\nExamples:\n" + "  $ clk115 projects delete project_123\n")
        .action(async function (this: Command, id: string) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            await archiveThenDeleteProject({
                workspaceId,
                id,
                adapter: {
                    getCurrent: ({ workspaceId: currentWorkspaceId, id: projectId }) =>
                        client.projects.get({ workspaceId: currentWorkspaceId, projectId }),
                    archive: async ({
                        workspaceId: currentWorkspaceId,
                        id: projectId,
                        current,
                    }) => {
                        const preserved = projectUpdateCarryFields(current);
                        await client.projects.update({
                            workspaceId: currentWorkspaceId,
                            projectId,
                            name: current.name,
                            ...preserved,
                            archived: true,
                        });
                    },
                    delete: async ({ workspaceId: currentWorkspaceId, id: projectId }) => {
                        await client.projects.delete({
                            workspaceId: currentWorkspaceId,
                            projectId,
                        });
                    },
                },
            });
            printReceipt(
                {
                    ok: true,
                    action: "projects.delete",
                    entity: "project",
                    ids: { projectId: id },
                    data: { id, deleted: true, message: `deleted project ${id}` },
                    changed: { deleted: [{ type: "project", id }] },
                    next: [
                        {
                            command: "clk115 projects list --json",
                            reason: "Verify the project no longer appears.",
                        },
                    ],
                },
                output,
            );
        });
};
