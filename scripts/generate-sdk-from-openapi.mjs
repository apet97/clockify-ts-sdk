#!/usr/bin/env node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";

import { INPUT_OPENAPI, OUTPUT_DIR, RECEIPT_FILE } from "./sdk-codegen/constants.mjs";
import { compareTrees, writeReceipt } from "./sdk-codegen/fs-utils.mjs";
import { generate } from "./sdk-codegen/emitter.mjs";
import { buildModel, buildReceipt, collectDiagnostics } from "./sdk-codegen/model.mjs";
import { relativeToRoot, resolveFromRoot } from "./sdk-codegen/paths.mjs";

function usage() {
    return [
        "Usage: node scripts/generate-sdk-from-openapi.mjs [--write|--check] [--input <openapi.yaml>] [--out <dir>] [--receipt <file>]",
        "",
        `Reads ${INPUT_OPENAPI} and emits ${OUTPUT_DIR}.`,
    ].join("\n");
}

function parseArgs(argv) {
    const options = { mode: "write", input: INPUT_OPENAPI, out: OUTPUT_DIR, receipt: undefined };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--help" || arg === "-h") {
            console.log(usage());
            process.exit(0);
        }
        if (arg === "--write") {
            options.mode = "write";
            continue;
        }
        if (arg === "--check") {
            options.mode = "check";
            continue;
        }
        if (arg === "--input") {
            options.input = requireArg(argv, ++i, arg);
            continue;
        }
        if (arg === "--out") {
            options.out = requireArg(argv, ++i, arg);
            continue;
        }
        if (arg === "--receipt") {
            options.receipt = requireArg(argv, ++i, arg);
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const inputPath = resolveFromRoot(options.input);
    const outputPath = resolveFromRoot(options.out);
    const receiptPath = options.receipt ? resolveFromRoot(options.receipt) : path.join(outputPath, RECEIPT_FILE);
    const doc = YAML.parse(await readFile(inputPath, "utf8"));
    const model = buildModel(doc);
    const diagnostics = collectDiagnostics(doc);
    const receipt = buildReceipt(model, {
        input: relativeToRoot(inputPath),
        diagnostics,
        ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    });

    if (!receipt.ok) {
        await writeReceipt(receiptPath, receipt);
        for (const diagnostic of diagnostics) console.error(`${diagnostic.pointer}: ${diagnostic.message}`);
        process.exit(1);
    }

    if (options.mode === "check") {
        const tempRoot = await mkdtemp(path.join(os.tmpdir(), "clockify-ts-sdk-codegen-"));
        try {
            const tempOut = path.join(tempRoot, "ts-sdk");
            await generate(model, tempOut, {
                receipt,
                receiptPath: options.receipt ? undefined : path.join(tempOut, RECEIPT_FILE),
            });
            const diff = await compareTrees(tempOut, outputPath);
            if (options.receipt) await writeReceipt(receiptPath, { ...receipt, ok: diff.length === 0, drift: diff });
            if (diff.length > 0) {
                console.error("sdk-codegen-drift failed");
                for (const entry of diff.slice(0, 50)) console.error(`- ${entry}`);
                if (diff.length > 50) console.error(`- ... ${diff.length - 50} more`);
                process.exit(1);
            }
            console.log(`sdk-codegen-drift passed (${model.operations.length} operations)`);
        } finally {
            await rm(tempRoot, { recursive: true, force: true });
        }
        return;
    }

    await rm(outputPath, { recursive: true, force: true });
    await generate(model, outputPath, { receipt, receiptPath });
    console.log(
        `Generated ${model.operations.length} operations across ${model.resources.length} resources into ${relativeToRoot(outputPath)}`,
    );
}

function requireArg(argv, index, name) {
    if (index >= argv.length || argv[index]?.startsWith("--")) throw new Error(`${name} requires a value`);
    return argv[index];
}

await main();
