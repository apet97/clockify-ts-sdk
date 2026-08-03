#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const REGISTRY_PACKAGES = Object.freeze({
    sdk: "clockify-sdk-ts-115",
    cli: "@apet97/clockify-cli-115",
    mcp: "@apet97/clockify-mcp-115",
});

export const SDK_REQUIRED_EXPORTS = Object.freeze([
    "ClockifyApiClient",
    "createClockifyClient",
    "composedFetch",
    "iterAll",
    "iterPages",
    "paginate",
    "verifyClockifyWebhook",
    "constructEvent",
]);

export class RegistrySmokeError extends Error {
    constructor(message, { code = "registry_smoke_failed", result } = {}) {
        super(message);
        this.name = "RegistrySmokeError";
        this.code = code;
        this.result = result;
    }
}

function now() {
    return Date.now();
}

function remaining(deadline) {
    return deadline - now();
}

function requireTime(deadline, operation) {
    const left = remaining(deadline);
    if (left <= 0) throw new RegistrySmokeError(`registry smoke timed out before ${operation}`, { code: "timeout" });
    return left;
}

function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function spawnCommand(command, args, { cwd, env, timeoutMs, input } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            env,
            stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        let settled = false;
        let timedOut = false;
        let timer;
        const finish = (value, error) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            if (error) reject(error);
            else resolve({ ...value, stdout, stderr, timedOut });
        };
        child.stdout?.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
        child.stderr?.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
        child.on("error", (error) => finish(undefined, error));
        child.on("close", (code, signal) => finish({ code, signal }));
        if (input !== undefined) {
            child.stdin.write(input);
            child.stdin.end();
        }
        timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
            setTimeout(() => {
                if (!settled) child.kill("SIGKILL");
            }, Math.min(500, Math.max(50, Math.floor(timeoutMs / 4))));
        }, Math.max(1, timeoutMs));
    });
}

function commandSucceeded(result) {
    return result && result.code === 0 && result.signal == null && result.timedOut !== true;
}

function binPath(consumerRoot, packageName, name) {
    const packageDir = path.join(consumerRoot, "node_modules", ...packageName.split("/"));
    const bin = name === undefined
        ? Object.values({ sdk: "", cli: "", mcp: "" })[0]
        : name;
    if (bin) return path.join(consumerRoot, "node_modules", ".bin", bin);
    return path.join(packageDir, "dist", "index.js");
}

function exactVersion(output, expected, label) {
    const actual = String(output ?? "").trim();
    if (actual !== expected) {
        throw new RegistrySmokeError(`${label} returned ${JSON.stringify(actual)}; expected exact version ${JSON.stringify(expected)}`, {
            code: "version_mismatch",
        });
    }
}

async function runCommandChecked(runCommand, command, args, options, label, deadline, commandLog) {
    const result = await runCommand(command, args, { ...options, timeoutMs: requireTime(deadline, label) });
    commandLog.push({ label, command, args, code: result.code ?? null, signal: result.signal ?? null, timedOut: result.timedOut === true, stdout: result.stdout ?? "", stderr: result.stderr ?? "" });
    if (!commandSucceeded(result)) {
        throw new RegistrySmokeError(`${label} failed (exit ${result.code ?? "unknown"}${result.signal ? `, ${result.signal}` : ""})`, {
            code: result.timedOut ? "timeout" : "command_failed",
        });
    }
    return result;
}

async function installExact({ root, packageName, version, runCommand, deadline, retries, commandLog }) {
    const attempts = [];
    const specifier = `${packageName}@${version}`;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        requireTime(deadline, "registry install");
        const result = await runCommand(
            "npm",
            ["install", "--no-audit", "--no-fund", "--ignore-scripts", "--save-exact", specifier],
            {
                cwd: root,
                env: { ...process.env, npm_config_loglevel: "error" },
                timeoutMs: requireTime(deadline, "registry install"),
            },
        );
        attempts.push({ attempt: attempt + 1, code: result.code ?? null, signal: result.signal ?? null, timedOut: result.timedOut === true, stdout: result.stdout ?? "", stderr: result.stderr ?? "" });
        if (commandSucceeded(result)) return { attempts };
        if (result.timedOut === true) throw new RegistrySmokeError("registry install timed out", { code: "timeout", result: { attempts } });
        if (attempt < retries) await sleep(Math.min(1000, 100 * (2 ** attempt)));
    }
    throw new RegistrySmokeError(`could not install exact registry artifact ${specifier}`, { code: "install_failed", result: { attempts } });
}

async function runSdkSmoke({ root, packageName, runCommand, deadline, commandLog }) {
    const required = JSON.stringify(SDK_REQUIRED_EXPORTS);
    const esm = await runCommandChecked(
        runCommand,
        process.execPath,
        ["--input-type=module", "-e", `const mod = await import(${JSON.stringify(packageName)}); const required = ${required}; const missing = required.filter((name) => !(name in mod)); if (missing.length) throw new Error('missing ESM exports: ' + missing.join(','));`],
        { cwd: root, env: { ...process.env } },
        "SDK ESM import",
        deadline,
        commandLog,
    );
    const cjs = await runCommandChecked(
        runCommand,
        process.execPath,
        ["--input-type=module", "-e", `import { createRequire } from 'node:module'; const mod = createRequire(import.meta.url)(${JSON.stringify(packageName)}); const required = ${required}; const missing = required.filter((name) => !(name in mod)); if (missing.length) throw new Error('missing CJS exports: ' + missing.join(','));`],
        { cwd: root, env: { ...process.env } },
        "SDK CJS require",
        deadline,
        commandLog,
    );
    return { esm: { exitCode: esm.code }, cjs: { exitCode: cjs.code }, requiredExports: [...SDK_REQUIRED_EXPORTS] };
}

async function runCliSmoke({ root, packageName, version, runCommand, deadline, commandLog }) {
    const checks = [];
    for (const name of ["clockify115", "clk115"]) {
        const bin = binPath(root, packageName, name);
        const versionResult = await runCommandChecked(runCommand, process.execPath, [bin, "--version"], { cwd: root, env: { ...process.env } }, `${name} --version`, deadline, commandLog);
        exactVersion(versionResult.stdout, version, name);
        const helpResult = await runCommandChecked(runCommand, process.execPath, [bin, "--help"], { cwd: root, env: { ...process.env } }, `${name} --help`, deadline, commandLog);
        checks.push({ name, version: versionResult.stdout.trim(), helpExitCode: helpResult.code });
    }
    return { bins: checks };
}

function defaultSpawnServer(binary, cwd, env) {
    return spawn(process.execPath, [binary], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
}

function waitForMessage(responses, child, id, deadline, parseError) {
    return new Promise((resolve, reject) => {
        let timer;
        let settled = false;
        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            callback(value);
        };
        const poll = () => {
            if (parseError.error) return finish(reject, parseError.error);
            if (responses.has(id)) return finish(resolve, responses.get(id));
            if (child.exitCode != null || child.signalCode != null) {
                return finish(reject, new RegistrySmokeError(`MCP server exited before JSON-RPC response ${id}`, { code: "child_exit" }));
            }
            const left = remaining(deadline);
            if (left <= 0) return finish(reject, new RegistrySmokeError(`timed out waiting for MCP JSON-RPC response ${id}`, { code: "timeout" }));
            timer = setTimeout(poll, Math.min(50, left));
        };
        poll();
        child.once?.("close", () => {
            if (responses.has(id)) finish(resolve, responses.get(id));
            else finish(reject, new RegistrySmokeError(`MCP server exited before JSON-RPC response ${id}`, { code: "child_exit" }));
        });
        child.once?.("error", (error) => finish(reject, new RegistrySmokeError(`MCP server emitted an error: ${error.message}`, { code: "child_exit" })));
    });
}

async function terminateChild(child) {
    if (!child || child.exitCode != null || child.signalCode != null) return;
    child.kill?.("SIGTERM");
    await new Promise((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; clearTimeout(timer); resolve(); } };
        const timer = setTimeout(() => {
            child.kill?.("SIGKILL");
            finish();
        }, 750);
        child.once?.("close", finish);
        child.once?.("exit", finish);
    });
}

export async function runMcpProtocol({ binary, root, deadline, spawnServer = defaultSpawnServer }) {
    const env = { ...process.env, CLOCKIFY_API_KEY: "", CLOCKIFY_WORKSPACE_ID: "", CLOCKIFY_BASE_URL: "" };
    const child = spawnServer(binary, root, env);
    const responses = new Map();
    const parseError = { error: null };
    let buffer = "";
    let stderr = "";
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.stdout?.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (!line) continue;
            try {
                const message = JSON.parse(line);
                if (message && message.id !== undefined) responses.set(message.id, message);
            } catch (error) {
                parseError.error = new RegistrySmokeError(`MCP emitted malformed JSON-RPC: ${error.message}`, { code: "malformed_jsonrpc" });
            }
        }
    });
    try {
        const send = (message) => {
            if (!child.stdin?.writable) throw new RegistrySmokeError("MCP stdin is not writable", { code: "child_exit" });
            child.stdin.write(`${JSON.stringify(message)}\n`);
        };
        send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "registry-smoke", version: "0.0.0" } } });
        const initialized = await waitForMessage(responses, child, 1, deadline, parseError);
        if (!initialized.result || typeof initialized.result.serverInfo?.name !== "string") {
            throw new RegistrySmokeError("MCP initialize response was not a success result", { code: "protocol_failed" });
        }
        send({ jsonrpc: "2.0", method: "notifications/initialized" });
        send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
        const toolsList = await waitForMessage(responses, child, 2, deadline, parseError);
        const tools = toolsList.result?.tools;
        if (!Array.isArray(tools) || tools.length === 0) {
            throw new RegistrySmokeError("MCP tools/list returned no tools", { code: "protocol_failed" });
        }
        return { toolCount: tools.length, stderr };
    } finally {
        await terminateChild(child);
    }
}

async function runMcpSmoke({ root, packageName, runCommand, deadline, commandLog, spawnServer }) {
    const binary = binPath(root, packageName, "clockify115-mcp");
    const result = await runMcpProtocol({ binary, root, deadline, spawnServer });
    commandLog.push({ label: "clockify115-mcp JSON-RPC", command: process.execPath, args: [binary], code: 0, signal: null, timedOut: false, stdout: "", stderr: result.stderr });
    return result;
}

function safePackageKind(kind) {
    if (!Object.hasOwn(REGISTRY_PACKAGES, kind)) throw new RegistrySmokeError(`unknown registry smoke subcommand ${JSON.stringify(kind)}`, { code: "usage" });
    return kind;
}

export async function runRegistrySmoke({
    kind,
    packageName = REGISTRY_PACKAGES[kind],
    version,
    timeoutMs = 120000,
    retries = 2,
    runCommand = spawnCommand,
    spawnServer = defaultSpawnServer,
    tempRootFactory = () => fs.mkdtempSync(path.join(os.tmpdir(), "clockify-registry-smoke-")),
} = {}) {
    safePackageKind(kind);
    if (typeof packageName !== "string" || packageName.length === 0) throw new RegistrySmokeError("packageName is required", { code: "usage" });
    if (typeof version !== "string" || version.length === 0) throw new RegistrySmokeError("exact version is required", { code: "usage" });
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new RegistrySmokeError("timeoutMs must be a positive integer", { code: "usage" });
    if (!Number.isInteger(retries) || retries < 0 || retries > 5) throw new RegistrySmokeError("retries must be an integer from 0 to 5", { code: "usage" });
    const deadline = now() + timeoutMs;
    const root = tempRootFactory();
    const commandLog = [];
    try {
        fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "clockify-registry-smoke-consumer", private: true }, null, 2) + "\n");
        const install = await installExact({ root, packageName, version, runCommand, deadline, retries, commandLog });
        const checks = kind === "sdk"
            ? await runSdkSmoke({ root, packageName, runCommand, deadline, commandLog })
            : kind === "cli"
                ? await runCliSmoke({ root, packageName, version, runCommand, deadline, commandLog })
                : await runMcpSmoke({ root, packageName, runCommand, deadline, commandLog, spawnServer });
        return { kind, packageName, version, install, checks, commands: commandLog };
    } catch (error) {
        if (error instanceof RegistrySmokeError) {
            error.result = { kind, packageName, version, commands: commandLog, ...(error.result ?? {}) };
        }
        throw error;
    } finally {
        try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
    }
}

function parseCliArgs(argv) {
    const [kind, ...rest] = argv;
    if (kind === undefined || kind === "--help" || kind === "-h") {
        process.stdout.write("Usage: node scripts/registry-smoke.mjs <sdk|cli|mcp> --version <exact-version> [--package-name <name>] [--timeout-ms <ms>] [--retries <count>]\n");
        return null;
    }
    const options = { kind };
    for (let index = 0; index < rest.length; index += 1) {
        const arg = rest[index];
        if (!arg.startsWith("--")) throw new RegistrySmokeError(`unexpected argument ${JSON.stringify(arg)}`, { code: "usage" });
        const name = arg.slice(2);
        if (!["version", "package-name", "timeout-ms", "retries"].includes(name)) throw new RegistrySmokeError(`unknown option --${name}`, { code: "usage" });
        const value = rest[++index];
        if (typeof value !== "string" || value.startsWith("--")) throw new RegistrySmokeError(`option --${name} requires a value`, { code: "usage" });
        options[name] = value;
    }
    if (!options.version) throw new RegistrySmokeError("--version is required", { code: "usage" });
    options.packageName = options["package-name"];
    options.timeoutMs = options["timeout-ms"] === undefined ? 120000 : Number(options["timeout-ms"]);
    options.retries = options.retries === undefined ? 2 : Number(options.retries);
    return options;
}

export async function main(argv = process.argv.slice(2)) {
    try {
        const options = parseCliArgs(argv);
        if (options === null) return 0;
        const result = await runRegistrySmoke(options);
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return 0;
    } catch (error) {
        process.stderr.write(`${JSON.stringify({ error: error.message, code: error.code ?? "registry_smoke_failed", result: error.result }, null, 2)}\n`);
        return error.code === "usage" ? 2 : 1;
    }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
    process.exitCode = await main();
}
