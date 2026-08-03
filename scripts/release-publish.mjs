#!/usr/bin/env node
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ReleaseBoundaryError, publishRelease } from "./lib/release-boundaries.mjs";

const REQUIRED = new Set(["file", "package-name", "version", "tarball", "local-integrity"]);

function usage() {
    return "Usage: node scripts/release-publish.mjs --file <receipt> --package-name <name> --version <version> --tarball <path> --local-integrity <sha512>";
}

function parseArgs(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (!arg.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(arg)}`);
        const name = arg.slice(2);
        const value = name.includes("=") ? name.slice(name.indexOf("=") + 1) : argv[++index];
        const key = name.includes("=") ? name.slice(0, name.indexOf("=")) : name;
        if (!REQUIRED.has(key)) throw new Error(`unknown option --${key}`);
        if (typeof value !== "string" || value.length === 0) throw new Error(`option --${key} requires a value`);
        if (options[key] !== undefined) throw new Error(`option --${key} was repeated`);
        options[key] = value;
    }
    for (const key of REQUIRED) {
        if (options[key] === undefined) throw new Error(`--${key} is required`);
    }
    return options;
}

export function main(argv = process.argv.slice(2)) {
    try {
        if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
            process.stdout.write(`${usage()}\n`);
            return 0;
        }
        const options = parseArgs(argv);
        const state = publishRelease({
            filePath: options.file,
            packageName: options["package-name"],
            version: options.version,
            tarball: options.tarball,
            localIntegrity: options["local-integrity"],
        });
        process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
        return 0;
    } catch (error) {
        const body = {
            error: error instanceof Error ? error.message : String(error),
            code: error?.code ?? "release_boundary_error",
        };
        if (error instanceof ReleaseBoundaryError && error.diagnostics !== null) {
            body.diagnostics = error.diagnostics;
        }
        process.stderr.write(`${JSON.stringify(body, null, 2)}\n`);
        return 1;
    }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
    process.exitCode = main();
}
