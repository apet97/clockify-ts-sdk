import { describe, expect, it } from "vitest";

import { parseCompletionShell, renderCompletion } from "../src/completions.js";

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
});
