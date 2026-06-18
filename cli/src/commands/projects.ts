/**
 * `clk115 projects {list,create,get,update,delete}`.
 */
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import type { Command } from "commander";

import { printObject, printRecords } from "../output.js";
import { printReceipt } from "../receipt.js";

import { resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerProjectsCommand: Registrar = (program, services) => {
    const projects = program.command("projects").description("Manage projects.");

    projects
        .command("list")
        .description("List projects in the workspace.")
        .option(
            "--limit <n>",
            "Items per page (default 25, max 200).",
            (v) => Number.parseInt(v, 10),
            25,
        )
        .option("--page <n>", "Page number.", (v) => Number.parseInt(v, 10), 1)
        .option("--name <text>", "Filter by project name substring.")
        .option("--archived", "Include archived projects.", false)
        .option("--client <id>", "Filter by client ID.")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const req: ClockifyApi.ListProjectsRequest = {
                workspaceId,
                page: opts.page,
                "page-size": Math.min(Math.max(1, opts.limit), 200),
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

    projects
        .command("create")
        .argument("<name>", "Project name.")
        .option("--client <id>", "Client ID.")
        .option("--color <hex>", "Hex color (e.g. #4caf50).")
        .option("--billable", "Mark as billable.", false)
        .description("Create a project in the workspace.")
        .action(async function (this: Command, name: string, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
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

    projects
        .command("get")
        .argument("<id>", "Project ID.")
        .description("Get one project by ID.")
        .action(async function (this: Command, id: string) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const project = await client.projects.get({ workspaceId, projectId: id });
            printObject(project as Record<string, unknown>, output);
        });

    projects
        .command("update")
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
        .action(async function (this: Command, id: string, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const body: ClockifyRequestBody<ClockifyApi.UpdateProjectsRequest> = {};
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

    projects
        .command("delete")
        .argument("<id>", "Project ID.")
        .description(
            "Delete a project by ID (archives first; an active project cannot be deleted).",
        )
        .action(async function (this: Command, id: string) {
            const { client, workspaceId, output } = resolveContext(this, services);
            // Clockify rejects DELETE of an ACTIVE project (400) and the
            // dedicated /archive route 404s — archive first via GET-then-PUT,
            // carrying the name the replace-PUT requires, mirroring the MCP tool.
            const current = (await client.projects.get({ workspaceId, projectId: id })) as {
                name?: string;
            };
            await client.projects.update({
                workspaceId,
                projectId: id,
                name: String(current.name ?? ""),
                archived: true,
            });
            await client.projects.delete({ workspaceId, projectId: id });
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
