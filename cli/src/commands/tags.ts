/**
 * `clk115 tags {list,create,get,update,delete}`.
 */
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import type { Command } from "commander";

import { printObject, printRecords } from "../output.js";
import { printReceipt } from "../receipt.js";

import { clampPageSize, parseIntArg, resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerTagsCommand: Registrar = (program, services) => {
    const tags = program.command("tags").description("Manage tags.");

    tags.command("list")
        .description("List tags in the workspace.")
        .option(
            "--limit <n>",
            "Items per page (default 25, max 200).",
            parseIntArg,
            25,
        )
        .option("--page <n>", "Page number.", parseIntArg, 1)
        .option("--name <text>", "Filter by tag name substring.")
        .option("--archived", "Include archived tags.", false)
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const req: ClockifyApi.ListTagsRequest = {
                workspaceId,
                page: opts.page,
                "page-size": clampPageSize(opts.limit, 200),
            };
            if (opts.name) req.name = opts.name;
            if (opts.archived) req.archived = true;
            const items = await client.tags.list(req);
            const rows = items.map((raw) => {
                const t = raw as { id?: string; name?: string; archived?: boolean };
                return {
                    id: t.id ?? "",
                    name: t.name ?? "",
                    archived: t.archived === true,
                };
            });
            printRecords(rows, output);
        });

    tags.command("create")
        .argument("<name>", "Tag name.")
        .description("Create a tag in the workspace.")
        .action(async function (this: Command, name: string) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const req: ClockifyApi.TagCreate = { workspaceId, body: { name } };
            const created = (await client.tags.create(req)) as {
                id?: string;
                name?: string;
            };
            const data = { id: created.id ?? "", name: created.name ?? "" };
            printReceipt(
                {
                    ok: true,
                    action: "tags.create",
                    entity: "tag",
                    ids: { tagId: data.id },
                    data,
                    changed: { created: [{ type: "tag", id: data.id, name: data.name }] },
                    next: [
                        { command: "clk115 tags list --json", reason: "Verify the tag appears." },
                    ],
                },
                output,
            );
        });

    tags.command("get")
        .argument("<id>", "Tag ID.")
        .description("Get one tag by ID.")
        .action(async function (this: Command, id: string) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const tag = await client.tags.get({ workspaceId, tagId: id });
            printObject(tag, output);
        });

    tags.command("update")
        .argument("<id>", "Tag ID.")
        .option("--name <text>", "New tag name.")
        .option("--archived", "Archive the tag.")
        .option("--no-archived", "Unarchive the tag.")
        .description("Update a tag by ID.")
        .action(async function (this: Command, id: string, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const body: ClockifyRequestBody<ClockifyApi.UpdateTagsRequest> = {};
            if (opts.name) body.name = opts.name;
            if (opts.archived !== undefined) body.archived = opts.archived;
            const req: ClockifyApi.UpdateTagsRequest = { workspaceId, tagId: id, body };
            const updated = (await client.tags.update(req)) as { id?: string; name?: string };
            const data = { id: updated.id ?? id, name: updated.name ?? "" };
            printReceipt(
                {
                    ok: true,
                    action: "tags.update",
                    entity: "tag",
                    ids: { tagId: data.id },
                    data,
                    changed: { updated: [{ type: "tag", id: data.id, name: data.name }] },
                    next: [{ command: "clk115 tags list --json", reason: "Verify the update." }],
                },
                output,
            );
        });

    tags.command("delete")
        .argument("<id>", "Tag ID.")
        .description("Delete a tag by ID.")
        .action(async function (this: Command, id: string) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            await client.tags.delete({ workspaceId, tagId: id });
            printReceipt(
                {
                    ok: true,
                    action: "tags.delete",
                    entity: "tag",
                    ids: { tagId: id },
                    data: { id, deleted: true, message: `deleted tag ${id}` },
                    changed: { deleted: [{ type: "tag", id }] },
                    next: [
                        {
                            command: "clk115 tags list --json",
                            reason: "Verify the tag no longer appears.",
                        },
                    ],
                },
                output,
            );
        });
};
