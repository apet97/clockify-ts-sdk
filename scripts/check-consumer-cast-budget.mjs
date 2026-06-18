#!/usr/bin/env node
// Every `as never` in cli/src + mcp/src must be either eliminated or
// annotated with a `KEEP as never` comment on the same line or immediately
// above it. result.ts/output-schema.ts are forwarding seams and are exempt.
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const ROOTS = ["cli/src", "mcp/src"];

const contract = JSON.parse(
    await readFile(path.join(root, "docs/consumer-cast-budget-contract.json"), "utf8"),
);
if (contract.schemaVersion !== 1) failures.push("schemaVersion must be 1");
const budget = contract.allowedRequestCastBudget;
if (!Number.isInteger(budget) || budget < 0) {
    failures.push("allowedRequestCastBudget must be a non-negative integer");
}
const exemptSuffixes = contract.exemptPathSuffixes;
if (!Array.isArray(exemptSuffixes) || !exemptSuffixes.every((value) => typeof value === "string")) {
    failures.push("exemptPathSuffixes must be an array of strings");
}
const pathExemptions = Array.isArray(exemptSuffixes) ? exemptSuffixes : [];

const isAnnotated = (here, above) => /KEEP as never/.test(here) || /KEEP as never/.test(above);
if (!isAnnotated("foo as never; // KEEP as never: x", "") || isAnnotated("foo as never;", "const x = 1;")) {
    failures.push("annotation self-test regressed: must accept `KEEP as never` and reject a bare `as never`");
}

async function listTs(dir) {
    const out = [];
    const stack = [dir];
    while (stack.length) {
        const d = stack.pop();
        let entries;
        try {
            entries = await readdir(path.join(root, d), { withFileTypes: true });
        } catch {
            failures.push(`missing directory ${d}`);
            continue;
        }
        for (const e of entries) {
            const rel = path.join(d, e.name);
            if (e.isDirectory()) stack.push(rel);
            else if (e.name.endsWith(".ts")) out.push(rel);
        }
    }
    return out.sort();
}

let unannotated = 0;
const offenders = [];
for (const r of ROOTS) {
    for (const rel of await listTs(r)) {
        if (pathExemptions.some((s) => rel.endsWith(s))) continue;
        const lines = (await readFile(path.join(root, rel), "utf8")).split("\n");
        for (let i = 0; i < lines.length; i++) {
            if (!/\bas never\b/.test(lines[i])) continue;
            const above = i > 0 ? lines[i - 1] : "";
            if (!isAnnotated(lines[i], above)) {
                unannotated++;
                offenders.push(`${rel}:${i + 1}`);
            }
        }
    }
}

if (unannotated > budget) {
    failures.push(`unannotated \`as never\` count ${unannotated} exceeds budget ${budget}`);
    for (const o of offenders) failures.push(`  unannotated: ${o}`);
}

let eoptMessage;
if (contract.strictness?.wrapper?.eoptHandwrittenClean === true) {
    const result = spawnSync(
        "npx",
        ["tsc", "-p", "tsconfig.json", "--noEmit", "--exactOptionalPropertyTypes"],
        {
            cwd: path.join(root, "wrapper"),
            encoding: "utf8",
        },
    );
    if (result.error?.code === "ENOENT") {
        console.warn("Wrapper EOPT differential skipped (npx unavailable).");
    } else {
        const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
        const handwrittenErrors = output
            .split(/\r?\n/)
            .filter(
                (line) =>
                    /\berror TS\d+/.test(line) &&
                    !line.startsWith("src/") &&
                    !line.startsWith("tests/"),
            );
        if (handwrittenErrors.length > 0) {
            failures.push(
                `wrapper hand-written EOPT errors ${handwrittenErrors.length} exceed budget 0`,
            );
            for (const line of handwrittenErrors) failures.push(`  eopt: ${line}`);
        } else {
            const totalErrors = output.match(/\berror TS\d+/g)?.length ?? 0;
            eoptMessage = `Wrapper EOPT differential clean (0 hand-written errors, ${totalErrors} generated/test errors ignored).`;
        }
        if (result.status !== 0 && output.trim().length === 0) {
            failures.push(
                `wrapper EOPT differential failed without compiler output (exit ${result.status})`,
            );
        }
    }
}

if (failures.length > 0) {
    console.error("Consumer cast budget failed:");
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
}

if (eoptMessage) console.log(eoptMessage);
console.log(`Consumer cast budget passed (${unannotated} unannotated \`as never\`, budget ${budget}).`);
