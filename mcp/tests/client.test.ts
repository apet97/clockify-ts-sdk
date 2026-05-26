import { describe, expect, it } from "vitest";

import { loadContext } from "../src/client.js";
import { isDirectInvocation } from "../src/index.js";

describe("MCP package contract", () => {
    it("uses the renamed package and bin in missing-env guidance", () => {
        expect(() => loadContext({})).toThrow(/@clockify115\/mcp-server/);
        expect(() => loadContext({})).toThrow(/clockify115-mcp/);
    });

    it("recognizes the installed mcp bin name as direct invocation", () => {
        expect(isDirectInvocation("/usr/local/bin/clockify115-mcp")).toBe(true);
        expect(isDirectInvocation("/tmp/index.js")).toBe(true);
        expect(isDirectInvocation("/usr/local/bin/clockify-mcp")).toBe(false);
    });
});
