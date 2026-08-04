import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const CLI_ENTRY = path.resolve(import.meta.dirname, "../src/index.ts");
const temporaryDirectories: string[] = [];
const servers: Server[] = [];

function runNode(
    args: string[],
    env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stderr: string; stdout: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, args, {
            cwd: path.resolve(import.meta.dirname, "../.."),
            env,
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

afterEach(async () => {
    await Promise.all(
        servers.splice(0).map(
            (server) =>
                new Promise<void>((resolve, reject) => {
                    server.close((error) => (error ? reject(error) : resolve()));
                }),
        ),
    );
    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

describe("CLI process entrypoint", () => {
    it("has no side effects when a consumer named index.js imports the package root", async () => {
        const directory = mkdtempSync(path.join(tmpdir(), "clockify-cli-import-"));
        temporaryDirectories.push(directory);
        const consumer = path.join(directory, "index.js");
        writeFileSync(path.join(directory, "package.json"), '{"type":"module"}\n');
        writeFileSync(
            consumer,
            [
                `await import(${JSON.stringify(pathToFileURL(CLI_ENTRY).href)});`,
                "await new Promise((resolve) => setTimeout(resolve, 50));",
                'process.stdout.write("consumer-ok\\n");',
            ].join("\n"),
        );

        const { code, stdout, stderr } = await runNode(["--import", "tsx", consumer], {
            ...process.env,
            CLOCKIFY_API_KEY: "",
            CLOCKIFY_WORKSPACE_ID: "",
        });

        expect(code, stderr).toBe(0);
        expect(stdout).toBe("consumer-ok\n");
        expect(stderr).toBe("");
    });

    it("lets a large JSON response drain completely before the process exits", async () => {
        const rows = Array.from({ length: 20_000 }, (_, index) => ({
            id: index,
            value: "x".repeat(128),
        }));
        const server = createServer((_request, response) => {
            response.writeHead(200, { "content-type": "application/json" });
            response.end(JSON.stringify(rows));
        });
        servers.push(server);
        const port = await new Promise<number>((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", () => {
                const address = server.address();
                if (address === null || typeof address === "string") {
                    reject(new Error("Mock server did not bind a TCP port."));
                    return;
                }
                resolve(address.port);
            });
        });

        const { code, stdout, stderr } = await runNode(
            [
                "--import",
                "tsx",
                CLI_ENTRY,
                "--json",
                "--compact",
                "--base-url",
                `http://127.0.0.1:${port}/api/v1`,
                "api",
                "GET",
                "/large",
            ],
            {
                ...process.env,
                CLOCKIFY_API_KEY: "test-key",
                CLOCKIFY_WORKSPACE_ID: "test-workspace",
            },
        );

        expect(code).toBe(0);
        expect(stdout.length).toBeGreaterThan(2 * 1024 * 1024);
        const parsed = JSON.parse(stdout) as Array<{ id: number; value: string }>;
        expect(parsed).toHaveLength(rows.length);
        expect(parsed.at(-1)).toEqual(rows.at(-1));
        expect(stderr).toBe("");
    });
});
