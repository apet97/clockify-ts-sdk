import { describe, expect, it } from "vitest";

import { AGENT_DOC_CHUNKS } from "../src/agent-docs/catalog.js";
import { searchAgentDocs } from "../src/agent-docs/search.js";

describe("agent docs catalog", () => {
    it("has stable unique ids", () => {
        const ids = AGENT_DOC_CHUNKS.map((chunk) => chunk.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("references only real MCP tool names", () => {
        for (const chunk of AGENT_DOC_CHUNKS) {
            for (const tool of chunk.tools) {
                expect(tool).toMatch(/^clockify_[a-z_]+$/);
            }
        }
    });

    it("ranks safety guidance for dry_run/webhook queries", () => {
        const results = searchAgentDocs("dry_run webhook safety", 3);
        expect(results.length).toBeGreaterThan(0);
        expect(results.map((result) => result.chunk.id)).toContain("safe-writes");
    });

    it("returns no results for empty queries", () => {
        expect(searchAgentDocs("   ")).toEqual([]);
    });

    it("honors the max-results cap", () => {
        expect(searchAgentDocs("clockify", 2).length).toBeLessThanOrEqual(2);
    });
});
