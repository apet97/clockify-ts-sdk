#!/usr/bin/env node
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
    RELEASE_STATE_REPOSITORY,
    ReleaseStateError,
    createInitialState,
    initializeStateFile,
    readState,
    redactedState,
    updateStateFile,
    writeStateAtomic,
} from "./lib/release-state.mjs";

const COMMANDS = new Set([
    "init",
    "set-artifact",
    "proof-only",
    "publish",
    "registry-smoke",
    "attestation",
    "github-release",
    "fail",
    "show",
]);
const VALUE_OPTIONS = new Set([
    "file",
    "repository",
    "workflow",
    "run-id",
    "run-attempt",
    "event-name",
    "ref-name",
    "source-sha",
    "package-name",
    "version",
    "path",
    "integrity",
    "mode",
    "remote-integrity",
    "status",
]);

function usage() {
    return [
        "Usage: node scripts/release-state.mjs <command> --file <receipt.json> [options]",
        "Commands: init, set-artifact, proof-only, publish, registry-smoke, attestation, github-release, fail, show",
        "Init metadata defaults to the corresponding GITHUB_* / PACKAGE_NAME / VERSION environment variables.",
        "Publication modes are published_now and already_present_matching; publication is tag-push only.",
    ].join("\n");
}

function parseArgs(argv) {
    const [command, ...rest] = argv;
    if (command === "--help" || command === "-h" || command === undefined) {
        process.stdout.write(`${usage()}\n`);
        return null;
    }
    if (!COMMANDS.has(command)) throw new ReleaseStateError(`unknown release-state command ${JSON.stringify(command)}`, { code: "usage", exitCode: 2 });
    const options = {};
    for (let index = 0; index < rest.length; index += 1) {
        const arg = rest[index];
        if (!arg.startsWith("--")) throw new ReleaseStateError(`unexpected argument ${JSON.stringify(arg)}`, { code: "usage", exitCode: 2 });
        const equals = arg.indexOf("=");
        const rawName = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
        if (!VALUE_OPTIONS.has(rawName)) throw new ReleaseStateError(`unknown option --${rawName}`, { code: "usage", exitCode: 2 });
        let value = equals === -1 ? rest[++index] : arg.slice(equals + 1);
        if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
            throw new ReleaseStateError(`option --${rawName} requires a value`, { code: "usage", exitCode: 2 });
        }
        if (options[rawName] !== undefined) throw new ReleaseStateError(`option --${rawName} was repeated`, { code: "usage", exitCode: 2 });
        options[rawName] = value;
    }
    return { command, options };
}

function required(options, name) {
    const value = options[name];
    if (typeof value !== "string" || value.length === 0) {
        throw new ReleaseStateError(`--${name} is required`, { code: "usage", exitCode: 2 });
    }
    return value;
}

function envOr(options, optionName, envName, fallback = "") {
    return options[optionName] ?? process.env[envName] ?? fallback;
}

function initMetadata(options) {
    return {
        repository: envOr(options, "repository", "RELEASE_REPOSITORY", RELEASE_STATE_REPOSITORY),
        workflow: envOr(options, "workflow", "GITHUB_WORKFLOW"),
        runId: envOr(options, "run-id", "GITHUB_RUN_ID"),
        runAttempt: envOr(options, "run-attempt", "GITHUB_RUN_ATTEMPT"),
        eventName: envOr(options, "event-name", "GITHUB_EVENT_NAME"),
        refName: envOr(options, "ref-name", "GITHUB_REF_NAME"),
        sourceSha: envOr(options, "source-sha", "GITHUB_SHA"),
        packageName: envOr(options, "package-name", "PACKAGE_NAME"),
        version: envOr(options, "version", "VERSION"),
    };
}

function printState(state) {
    process.stdout.write(`${JSON.stringify(redactedState(state), null, 2)}\n`);
}

function writeError(error) {
    const body = {
        error: error instanceof Error ? error.message : String(error),
        code: error?.code ?? "release_state_error",
    };
    if (error?.nextState) body.state = redactedState(error.nextState);
    process.stderr.write(`${JSON.stringify(body, null, 2)}\n`);
}

export function execute(command, options, { clock, beforeRename } = {}) {
    const filePath = required(options, "file");
    if (command === "show") return readState(filePath);
    if (command === "init") {
        const metadata = initMetadata(options);
        if (!metadata.packageName) throw new ReleaseStateError("--package-name or PACKAGE_NAME is required", { code: "usage", exitCode: 2 });
        if (!metadata.version) throw new ReleaseStateError("--version or VERSION is required", { code: "usage", exitCode: 2 });
        return initializeStateFile(filePath, metadata, { clock, beforeRename });
    }

    const payload = {};
    switch (command) {
        case "set-artifact":
            payload.path = required(options, "path");
            payload.integrity = required(options, "integrity");
            break;
        case "publish":
            payload.mode = required(options, "mode");
            payload.remoteIntegrity = required(options, "remote-integrity");
            break;
        case "registry-smoke":
        case "attestation":
        case "github-release":
            payload.status = required(options, "status");
            break;
        case "proof-only":
        case "fail":
            break;
        default:
            throw new ReleaseStateError(`unsupported command ${command}`, { code: "usage", exitCode: 2 });
    }
    return updateStateFile(filePath, command, payload, { clock, beforeRename });
}

export function main(argv = process.argv.slice(2)) {
    try {
        const parsed = parseArgs(argv);
        if (parsed === null) return 0;
        const state = execute(parsed.command, parsed.options);
        printState(state);
        return 0;
    } catch (error) {
        writeError(error);
        return error instanceof ReleaseStateError ? error.exitCode : 1;
    }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
    process.exitCode = main();
}
