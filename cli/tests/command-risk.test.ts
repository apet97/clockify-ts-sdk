import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import {
    collectClassifiedLeaves,
    leafCommand,
    type CliCommandRisk,
} from "../src/commands/leaf-command.js";
import type { Services } from "../src/commands/types.js";
import { buildProgram, main } from "../src/index.js";

const expectedCounts: Record<CliCommandRisk, number> = {
    read: 27,
    write: 21,
    destructive: 9,
};

describe("CLI command risk registry", () => {
    it("classifies every one of the 57 leaves exactly once", () => {
        const program = buildProgram();
        const leaves = collectClassifiedLeaves(program);
        const counts = { read: 0, write: 0, destructive: 0 } satisfies Record<
            CliCommandRisk,
            number
        >;

        for (const leaf of leaves) counts[leaf.risk] += 1;

        expect(leaves).toHaveLength(57);
        expect(counts).toEqual(expectedCounts);
        expect(new Set(leaves.map(({ path }) => path.join(" "))).size).toBe(57);
    });

    it("pins the previously missed and raw-command classifications", () => {
        const byPath = new Map(
            collectClassifiedLeaves(buildProgram()).map(({ path, risk }) => [
                path.join(" "),
                risk,
            ]),
        );

        expect(byPath.get("stop")).toBe("write");
        expect(byPath.get("expenses create")).toBe("write");
        expect(byPath.get("api")).toBe("destructive");
    });

    it("rejects duplicate classifications under one parent", () => {
        const program = new Command();
        leafCommand(program, "show", "read");

        expect(() => leafCommand(program, "show", "read")).toThrow(/already classified/i);
    });

    it("rejects turning a classified leaf into a grouping node", () => {
        const program = new Command();
        const classified = leafCommand(program, "group", "read");

        expect(() => leafCommand(classified, "child", "read")).toThrow(/grouping node/i);
    });

    it("fails closed when a terminal command bypasses leafCommand", () => {
        const program = new Command();
        program.command("unclassified");

        expect(() => collectClassifiedLeaves(program)).toThrow(/unclassified/i);
    });
});

describe("injectable CLI program services", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("passes injected services through buildProgram and main", async () => {
        const calls: string[] = [];
        const client = {
            users: {
                getCurrentUser: async () => {
                    calls.push("users.getCurrentUser");
                    return { id: "user-1", email: "user@example.test" };
                },
            },
            timeEntries: {
                listInProgress: async ({ workspaceId }: { workspaceId: string }) => {
                    calls.push(`timeEntries.listInProgress:${workspaceId}`);
                    return [];
                },
            },
        } as unknown as ClockifyClient;
        const services: Services = {
            loadConfig: () => ({ apiKey: "test", workspaceId: "workspace-1" }),
            buildClient: () => client,
        };
        const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

        const program = buildProgram(services);
        expect(program.commands.map((command) => command.name())).toContain("status");

        const code = await main(["node", "clockify115", "--json", "status"], services);

        expect(code).toBe(0);
        expect(calls).toEqual([
            "users.getCurrentUser",
            "timeEntries.listInProgress:workspace-1",
        ]);
        expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toMatchObject({
            workspaceId: "workspace-1",
            userId: "user-1",
        });
    });
});
