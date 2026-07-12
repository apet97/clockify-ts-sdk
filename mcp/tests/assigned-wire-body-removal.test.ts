import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const ASSIGNED_MODULES = [
    "clients.ts",
    "tasks.ts",
    "customFields.ts",
    "expenses.ts",
    "webhooks.ts",
    "invoices.ts",
    "timeOff.ts",
    "workflows/demo.ts",
] as const;
const FORBIDDEN_IDENTIFIER = ["wire", "Body"].join("");

describe("assigned Phase 2 typed request migration", () => {
    it.each(ASSIGNED_MODULES)(
        "contains no untyped request escape in src/tools/%s",
        async (modulePath) => {
            const source = await readFile(
                new URL(`../src/tools/${modulePath}`, import.meta.url),
                "utf8",
            );
            expect(source).not.toMatch(new RegExp(`\\b${FORBIDDEN_IDENTIFIER}\\b`));
        },
    );
});
