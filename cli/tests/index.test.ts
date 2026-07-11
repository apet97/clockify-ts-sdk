import { describe, expect, it } from "vitest";

import { buildProgram } from "../src/index.js";

describe("buildProgram", () => {
    it("advertises the renamed CLI contract", () => {
        const program = buildProgram();
        const commandNames = program.commands.map((command) => command.name()).sort();

        expect(program.name()).toBe("clockify115");
        expect(program.description()).toContain("@apet97/clockify-cli-115");
        expect(program.description()).toContain("clockify-sdk-ts-115");
        expect(program.version()).toBe("0.2.0");
        expect(commandNames).toEqual([
            "api",
            "audit-log",
            "clients",
            "completion",
            "doctor",
            "entries",
            "expenses",
            "invoices",
            "log",
            "projects",
            "reports",
            "scheduling",
            "shared-reports",
            "start",
            "status",
            "stop",
            "tags",
            "tasks",
            "timeoff",
            "users",
            "webhooks",
        ]);
        // 21 top-level command groups.
        expect(commandNames).toHaveLength(21);
    });
});
