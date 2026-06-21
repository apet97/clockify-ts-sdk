import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { COMMANDS, parseCompletionShell, renderCompletion } from "../src/completions.js";

describe("shell completions", () => {
    it("renders zsh completion for both binaries", () => {
        const script = renderCompletion("zsh");
        expect(script).toContain("compdef _clk115 clk115");
        expect(script).toContain("compdef _clk115 clockify115");
        expect(script).toContain("completion");
        expect(script).toContain("doctor");
    });

    it("renders bash completion for both binaries", () => {
        const script = renderCompletion("bash");
        expect(script).toContain("complete -F _clk115_completion clk115");
        expect(script).toContain("complete -F _clk115_completion clockify115");
    });

    it("renders fish completion for both binaries", () => {
        const script = renderCompletion("fish");
        expect(script).toContain("complete -c clk115 -f -a status");
        expect(script).toContain("complete -c clockify115 -f -a completion");
    });

    it("defaults to zsh and rejects unknown shells", () => {
        expect(parseCompletionShell(undefined)).toBe("zsh");
        expect(() => parseCompletionShell("powershell")).toThrow(/bash, zsh, fish/);
    });

    it("completes every top-level group documented in docs/cli-commands.json", () => {
        // Read-only contract: never edit the generated json from a test.
        const docsPath = fileURLToPath(new URL("../../docs/cli-commands.json", import.meta.url));
        const doc = JSON.parse(readFileSync(docsPath, "utf8")) as {
            commands: { command: string }[];
        };
        // Each command string is "clk115 <group> …"; the documented top-level
        // groups are the second token (skipping flag-only entries like
        // `clk115 --version`).
        const documentedGroups = new Set<string>();
        for (const { command } of doc.commands) {
            const group = command.trim().split(/\s+/)[1];
            if (group && !group.startsWith("-")) documentedGroups.add(group);
        }
        const completed = new Set<string>(COMMANDS);
        const missing = [...documentedGroups].filter((group) => !completed.has(group));
        expect(missing).toEqual([]);
        // Spot-check the three groups this fix restored.
        expect(completed.has("reports")).toBe(true);
        expect(completed.has("shared-reports")).toBe(true);
        expect(completed.has("users")).toBe(true);
    });
});
