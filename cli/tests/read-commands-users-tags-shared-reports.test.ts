import { Command } from "commander";
import { describe, expect, it } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerSharedReportsCommand } from "../src/commands/sharedReports.js";
import { registerTagsCommand } from "../src/commands/tags.js";
import { registerUsersCommand } from "../src/commands/users.js";

import { lastJson, makeProgram } from "./read-commands.helpers.js";

describe("users, tags, and shared report read branches", () => {
    it("users list applies name and limit filters", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            users: {
                list: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return [{ id: "u-1", name: "Ana", email: "a@example.test", status: "ACTIVE" }];
                },
            },
        };
        await makeProgram(registerUsersCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "users",
            "list",
            "--limit",
            "999",
            "--name",
            "Ana",
        ]);
        expect(calls[0]).toMatchObject({
            workspaceId: "ws-1",
            "page-size": 200,
            name: "Ana",
            "include-roles": false,
        });
        expect((lastJson() as Array<Record<string, unknown>>)[0]).toMatchObject({
            id: "u-1",
            email: "a@example.test",
        });
    });

    it("users update-profile sends only supplied optional profile fields", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            memberProfiles: {
                update: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return { id: req.userId };
                },
            },
        };
        await makeProgram(registerUsersCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "users",
            "update-profile",
            "u-1",
            "--name",
            "Ana",
            "--image-url",
            "https://img",
            "--remove-image",
            "--week-start",
            "MONDAY",
            "--work-capacity",
            "PT8H",
            "--working-days",
            "MONDAY",
            "TUESDAY",
        ]);
        expect(calls[0].body).toMatchObject({
            name: "Ana",
            imageUrl: "https://img",
            removeProfileImage: true,
            weekStart: "MONDAY",
            workCapacity: "PT8H",
            workingDays: ["MONDAY", "TUESDAY"],
        });
    });

    it("users me works before a workspace is configured", async () => {
        const client = {
            users: { getCurrentUser: async () => ({ id: "u-me", email: "me@example.test" }) },
        };
        const program = new Command();
        program.exitOverride();
        program.option("--json", "Emit JSON.", false);
        registerUsersCommand(program, {
            loadConfig: () => ({ apiKey: "k" }),
            buildClient: () => client as unknown as ClockifyClient,
        });
        await program.parseAsync(["node", "clk115", "--json", "users", "me"]);
        expect(lastJson()).toMatchObject({ id: "u-me", email: "me@example.test" });
    });

    it("tags list applies filters and archived flag", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            tags: {
                list: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return [{ id: "t-1", name: "Deep", archived: true }, {}];
                },
            },
        };
        await makeProgram(registerTagsCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "tags",
            "list",
            "--limit",
            "10",
            "--name",
            "Deep",
            "--archived",
        ]);
        expect(calls[0]).toMatchObject({ "page-size": 10, name: "Deep", archived: true });
        const rows = lastJson() as Array<Record<string, unknown>>;
        expect(rows[0]).toMatchObject({ id: "t-1", archived: true });
        expect(rows[1]).toMatchObject({ id: "", name: "", archived: false });
    });

    it("shared-reports view parses JSON bodies and update validates JSON filters", async () => {
        const calls: Record<string, unknown>[] = [];
        const encoder = new TextEncoder();
        const client = {
            sharedReports: {
                view: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return {
                        arrayBuffer: async () =>
                            encoder.encode(JSON.stringify({ ok: true, rows: [1] })).buffer,
                    };
                },
                update: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return { id: req.sharedReportId, name: (req.body as { name?: string }).name };
                },
            },
        };
        await makeProgram(registerSharedReportsCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "shared-reports",
            "view",
            "sr-1",
            "--export-type",
            "json",
        ]);
        expect(calls[0]).toMatchObject({ sharedReportId: "sr-1", exportType: "JSON" });
        expect(lastJson()).toMatchObject({ ok: true });

        await makeProgram(registerSharedReportsCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "shared-reports",
            "update",
            "sr-1",
            "--name",
            "Public",
            "--type",
            "summary",
            "--filter",
            "{\"dateRangeStart\":\"2026-06-01\"}",
            "--public",
        ]);
        expect(calls[1].body).toMatchObject({
            name: "Public",
            type: "SUMMARY",
            isPublic: true,
        });
        expect(calls[1].body).not.toHaveProperty("public");
        expect((lastJson() as Record<string, unknown>).action).toBe("shared-reports.update");
    });

    it("shared-reports view falls back for text bodies and create rejects invalid filters", async () => {
        const encoder = new TextEncoder();
        const client = {
            sharedReports: {
                view: async () => ({
                    arrayBuffer: async () => encoder.encode("not-json").buffer,
                }),
                create: async () => ({ id: "unused" }),
            },
        };
        await makeProgram(registerSharedReportsCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "shared-reports",
            "view",
            "sr-2",
        ]);
        expect(lastJson()).toEqual({ body: "not-json" });

        await expect(
            makeProgram(registerSharedReportsCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "shared-reports",
                "create",
                "--name",
                "Bad",
                "--type",
                "summary",
                "--filter",
                "[]",
            ]),
        ).rejects.toThrow(/--filter must be a JSON object/);
    });

    it("shared-reports view handles an empty response body", async () => {
        const client = {
            sharedReports: {
                view: async () => ({
                    arrayBuffer: async () => new ArrayBuffer(0),
                }),
            },
        };
        await makeProgram(registerSharedReportsCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "shared-reports",
            "view",
            "sr-empty",
        ]);
        expect(lastJson()).toEqual({ body: "" });
    });

    it("shared-reports create accepts valid filters and rejects unknown types", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            sharedReports: {
                create: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return { id: "sr-3", name: (req.body as { name?: string }).name };
                },
            },
        };
        await makeProgram(registerSharedReportsCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "shared-reports",
            "create",
            "--name",
            "Visible",
            "--type",
            "weekly",
            "--filter",
            "{\"dateRangeStart\":\"2026-06-01\"}",
        ]);
        expect(calls[0].body).toMatchObject({ name: "Visible", type: "WEEKLY" });
        expect(calls[0].body).not.toHaveProperty("public");

        await expect(
            makeProgram(registerSharedReportsCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "shared-reports",
                "create",
                "--name",
                "Bad",
                "--type",
                "not-real",
                "--filter",
                "{}",
            ]),
        ).rejects.toThrow(/Unknown --type/);
    });
});
