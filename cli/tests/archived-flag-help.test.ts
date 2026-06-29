import { describe, expect, it } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerClientsCommand } from "../src/commands/clients.js";
import { registerProjectsCommand } from "../src/commands/projects.js";
import { registerTagsCommand } from "../src/commands/tags.js";
import type { Registrar } from "../src/commands/types.js";

import { makeProgram } from "./read-commands.helpers.js";

function listArchivedHelp(register: Registrar, group: string): string {
    const program = makeProgram(register, {} as unknown as ClockifyClient);
    const groupCmd = program.commands.find((c) => c.name() === group);
    if (!groupCmd) throw new Error(`missing ${group} command`);
    const listCmd = groupCmd.commands.find((c) => c.name() === "list");
    if (!listCmd) throw new Error(`missing ${group} list command`);
    const option = listCmd.options.find((o) => o.long === "--archived");
    if (!option) throw new Error(`missing --archived on ${group} list`);
    return option.description;
}

describe("--archived list flag help reflects the restrictive wire filter", () => {
    it("projects list --archived help says it shows only archived", () => {
        expect(listArchivedHelp(registerProjectsCommand, "projects")).toBe(
            "Show only archived projects (default lists both archived and active).",
        );
    });

    it("clients list --archived help says it shows only archived", () => {
        expect(listArchivedHelp(registerClientsCommand, "clients")).toBe(
            "Show only archived clients (default lists both archived and active).",
        );
    });

    it("tags list --archived help says it shows only archived", () => {
        expect(listArchivedHelp(registerTagsCommand, "tags")).toBe(
            "Show only archived tags (default lists both archived and active).",
        );
    });
});
