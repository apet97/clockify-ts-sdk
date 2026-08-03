import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";

import {
    REGISTRY_PACKAGES,
    RegistrySmokeError,
    runMcpProtocol,
    runRegistrySmoke,
} from "./registry-smoke.mjs";

const VERSION = "0.15.0";

function fakeRunner({ version = VERSION, failure = null } = {}) {
    const calls = [];
    const runCommand = async (command, args) => {
        calls.push({ command, args });
        if (failure) return { code: 1, signal: null, timedOut: false, stdout: "", stderr: failure };
        if (command === "npm") return { code: 0, signal: null, timedOut: false, stdout: "installed\n", stderr: "" };
        if (args.includes("--version")) return { code: 0, signal: null, timedOut: false, stdout: `${version}\n`, stderr: "" };
        return { code: 0, signal: null, timedOut: false, stdout: "help\n", stderr: "" };
    };
    return { calls, runCommand };
}

function tempRootTracker() {
    const roots = [];
    return {
        roots,
        factory: () => {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), "clockify-registry-test-"));
            roots.push(root);
            return root;
        },
    };
}

class FakeMcpChild extends EventEmitter {
    constructor(behavior = "success") {
        super();
        this.exitCode = null;
        this.signalCode = null;
        this.stdout = new PassThrough();
        this.stderr = new PassThrough();
        this.behavior = behavior;
        this.stdin = new Writable({
            write: (chunk, encoding, callback) => {
                const lines = chunk.toString("utf8").trim().split("\n").filter(Boolean);
                for (const line of lines) {
                    const message = JSON.parse(line);
                    setImmediate(() => {
                        if (this.behavior === "malformed") {
                            this.stdout.write("{not-json}\n");
                            return;
                        }
                        if (this.behavior === "exit") {
                            this.exitCode = 1;
                            this.emit("exit", 1, null);
                            this.emit("close", 1, null);
                            return;
                        }
                        if (message.id === 1) {
                            this.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "fake-mcp" } } }) + "\n");
                        } else if (message.id === 2) {
                            this.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [{ name: "clockify_projects_list" }] } }) + "\n");
                        }
                    });
                }
                callback();
            },
        });
    }

    kill(signal) {
        if (this.exitCode !== null || this.signalCode !== null) return true;
        this.signalCode = signal;
        setImmediate(() => {
            this.emit("exit", null, signal);
            this.emit("close", null, signal);
        });
        return true;
    }
}

test("SDK registry smoke runs exact install plus ESM and CJS checks", async () => {
    const tracker = tempRootTracker();
    const runner = fakeRunner();
    const result = await runRegistrySmoke({ kind: "sdk", version: VERSION, runCommand: runner.runCommand, tempRootFactory: tracker.factory, timeoutMs: 5000, retries: 0 });
    assert.equal(result.packageName, REGISTRY_PACKAGES.sdk);
    assert.deepEqual(result.checks.requiredExports, [
        "ClockifyApiClient", "createClockifyClient", "composedFetch", "iterAll", "iterPages", "paginate", "verifyClockifyWebhook", "constructEvent",
    ]);
    assert.equal(runner.calls[0].command, "npm");
    assert.deepEqual(runner.calls[0].args.slice(0, 5), ["install", "--no-audit", "--no-fund", "--ignore-scripts", "--save-exact"]);
    assert.equal(fs.existsSync(tracker.roots[0]), false);
});

test("CLI registry smoke executes both bins and requires exact version output", async () => {
    const tracker = tempRootTracker();
    const runner = fakeRunner();
    const result = await runRegistrySmoke({ kind: "cli", version: VERSION, runCommand: runner.runCommand, tempRootFactory: tracker.factory, timeoutMs: 5000, retries: 0 });
    assert.deepEqual(result.checks.bins.map((entry) => entry.name), ["clockify115", "clk115"]);
    assert.equal(result.checks.bins.every((entry) => entry.version === VERSION && entry.helpExitCode === 0), true);
    assert.equal(fs.existsSync(tracker.roots[0]), false);
});

test("MCP registry smoke completes initialize, initialized, tools/list, and cleanup", async () => {
    const tracker = tempRootTracker();
    const runner = fakeRunner();
    const result = await runRegistrySmoke({
        kind: "mcp",
        version: VERSION,
        runCommand: runner.runCommand,
        tempRootFactory: tracker.factory,
        spawnServer: () => new FakeMcpChild(),
        timeoutMs: 5000,
        retries: 0,
    });
    assert.equal(result.checks.toolCount, 1);
    assert.equal(fs.existsSync(tracker.roots[0]), false);
});

test("exact version mismatch fails rather than accepting a substring", async () => {
    const tracker = tempRootTracker();
    const runner = fakeRunner({ version: `clockify ${VERSION}` });
    await assert.rejects(
        () => runRegistrySmoke({ kind: "cli", version: VERSION, runCommand: runner.runCommand, tempRootFactory: tracker.factory, timeoutMs: 5000, retries: 0 }),
        (error) => error instanceof RegistrySmokeError && error.code === "version_mismatch",
    );
    assert.equal(fs.existsSync(tracker.roots[0]), false);
});

test("install timeout is bounded and cleanup still runs", async () => {
    const tracker = tempRootTracker();
    const runner = fakeRunner();
    runner.runCommand = async () => ({ code: null, signal: "SIGTERM", timedOut: true, stdout: "partial", stderr: "timed out" });
    await assert.rejects(
        () => runRegistrySmoke({ kind: "sdk", version: VERSION, runCommand: runner.runCommand, tempRootFactory: tracker.factory, timeoutMs: 20, retries: 0 }),
        (error) => error instanceof RegistrySmokeError && error.code === "timeout",
    );
    assert.equal(fs.existsSync(tracker.roots[0]), false);
});

test("MCP child exit and malformed JSON-RPC are explicit failures", async () => {
    const exitChild = new FakeMcpChild("exit");
    await assert.rejects(
        () => runMcpProtocol({ binary: "/tmp/fake-mcp", root: "/tmp", deadline: Date.now() + 1000, spawnServer: () => exitChild }),
        (error) => error instanceof RegistrySmokeError && error.code === "child_exit",
    );

    const malformedChild = new FakeMcpChild("malformed");
    await assert.rejects(
        () => runMcpProtocol({ binary: "/tmp/fake-mcp", root: "/tmp", deadline: Date.now() + 1000, spawnServer: () => malformedChild }),
        (error) => error instanceof RegistrySmokeError && error.code === "malformed_jsonrpc",
    );
});

test("command failures retain captured stdout and stderr in the failure result", async () => {
    const tracker = tempRootTracker();
    const runner = fakeRunner({ failure: "network denied" });
    await assert.rejects(
        () => runRegistrySmoke({ kind: "sdk", version: VERSION, runCommand: runner.runCommand, tempRootFactory: tracker.factory, timeoutMs: 5000, retries: 0 }),
        (error) => error instanceof RegistrySmokeError && error.code === "install_failed" && error.result.commands.length === 0,
    );
    assert.equal(fs.existsSync(tracker.roots[0]), false);
});
