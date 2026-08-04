import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const MCP_ENTRY = path.resolve(import.meta.dirname, "../src/index.ts");

function runNode(args: string[]): Promise<{ code: number | null; stderr: string; stdout: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, args, {
            cwd: path.resolve(import.meta.dirname, "../.."),
            env: {
                ...process.env,
                CLOCKIFY_API_KEY: "",
                CLOCKIFY_WORKSPACE_ID: "",
            },
        });
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
            stdout += chunk;
        });
        child.stderr.on("data", (chunk: string) => {
            stderr += chunk;
        });
        child.once("error", reject);
        child.once("close", (code) => resolve({ code, stderr, stdout }));
    });
}

describe("MCP process entrypoint", () => {
    it("has no side effects when a consumer named index.js imports the package root", async () => {
        const directory = mkdtempSync(path.join(tmpdir(), "clockify-mcp-import-"));
        const consumer = path.join(directory, "index.js");
        writeFileSync(path.join(directory, "package.json"), '{"type":"module"}\n');
        writeFileSync(
            consumer,
            [
                `await import(${JSON.stringify(pathToFileURL(MCP_ENTRY).href)});`,
                "await new Promise((resolve) => setTimeout(resolve, 50));",
                "process.stdin.destroy();",
                'process.stdout.write("consumer-ok\\n", () => process.exit(0));',
            ].join("\n"),
        );

        try {
            const { code, stdout, stderr } = await runNode(["--import", "tsx", consumer]);

            expect(code, stderr).toBe(0);
            expect(stdout).toBe("consumer-ok\n");
            expect(stderr).toBe("");
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
});
