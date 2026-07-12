import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const realManifestPath = path.resolve(repoRoot, "docs", "mcp-tool-manifest.json");

// Repo-relative so the checker's safeRelativePath() guard accepts it; unique name
// so it never collides with a parallel vitest worker.
const tmpRel = path.join("mcp", "tests", ".tmp-write-safety-manifest.json");
const tmpAbs = path.resolve(repoRoot, tmpRel);

function runChecker(): { code: number; stderr: string; stdout: string } {
    try {
        const stdout = execFileSync("node", ["scripts/check-mcp-write-safety.mjs"], {
            cwd: repoRoot,
            encoding: "utf8",
            env: { ...process.env, MCP_WRITE_SAFETY_MANIFEST: tmpRel },
        });
        return { code: 0, stdout, stderr: "" };
    } catch (error) {
        const e = error as { status?: number; stdout?: string; stderr?: string };
        return { code: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
    }
}

describe("mcp write-safety: missing destructiveHint on a delete-named tool", () => {
    const manifest = JSON.parse(readFileSync(realManifestPath, "utf8")) as {
        tools: Array<Record<string, unknown>>;
        [key: string]: unknown;
    };

    it("fails when a _delete-named tool is not annotated destructiveHint:true", () => {
        const doctored = {
            ...manifest,
            tools: [
                ...manifest.tools,
                {
                    name: "clockify_synthetic_delete",
                    title: "Synthetic unguarded delete",
                    group: "domain",
                    annotations: {
                        readOnlyHint: false,
                        destructiveHint: false,
                        idempotentHint: false,
                    },
                    destructiveHint: false,
                },
            ],
        };
        writeFileSync(tmpAbs, JSON.stringify(doctored, null, 2));
        try {
            const result = runChecker();
            expect(result.code).not.toBe(0);
            expect(result.stderr).toContain("clockify_synthetic_delete");
            expect(result.stderr).toContain("destructiveHint:true");
        } finally {
            rmSync(tmpAbs, { force: true });
        }
    });

    it("passes for an unmodified manifest copy (no false positive)", () => {
        writeFileSync(tmpAbs, JSON.stringify(manifest, null, 2));
        try {
            const result = runChecker();
            expect(result.code).toBe(0);
            expect(result.stdout).toContain("140 tools, 56 guarded, 18 destructive");
        } finally {
            rmSync(tmpAbs, { force: true });
        }
    });
});
