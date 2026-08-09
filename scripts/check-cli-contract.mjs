#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isWiringTargetReachable } from "./lib/gate-targets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/cli-contract.json", "contractPath");

function fail(message) {
    failures.push(message);
}

function safeRelativePath(label, relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
        fail(`${label} must be a non-empty string`);
        return null;
    }
    const normalized = path.normalize(relativePath);
    if (path.isAbsolute(relativePath) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
        fail(`${label} must be a repo-relative path without parent traversal`);
        return null;
    }
    return normalized;
}

function readRelative(relativePath, label = relativePath) {
    const safePath = safeRelativePath(label, relativePath);
    if (safePath == null) return "";

    const absolutePath = path.join(root, safePath);
    if (!fs.existsSync(absolutePath)) {
        fail(`${safePath} is missing`);
        return "";
    }
    return fs.readFileSync(absolutePath, "utf8");
}

function readJson(relativePath, label = relativePath) {
    const text = readRelative(relativePath, label);
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch (error) {
        fail(`${label} invalid JSON: ${error.message}`);
        return {};
    }
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        fail(`${label} must be a non-empty string`);
    }
}

function assertNonNegativeInteger(label, value) {
    if (!Number.isInteger(value) || value < 0) {
        fail(`${label} must be a non-negative integer`);
    }
}

function assertObject(label, value) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        fail(`${label} must be an object`);
        return false;
    }
    return true;
}

function assertStringArray(label, value, { allowEmpty = true } = {}) {
    if (!Array.isArray(value)) {
        fail(`${label} must be an array`);
        return [];
    }
    if (!allowEmpty && value.length === 0) {
        fail(`${label} must be a non-empty array`);
    }
    for (const entry of value) {
        if (typeof entry !== "string" || entry.trim().length === 0) {
            fail(`${label} contains a non-string or empty entry`);
        }
    }
    return value.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function assertUnique(label, values) {
    const seen = new Set();
    for (const value of values ?? []) {
        if (seen.has(value)) fail(`${label} contains duplicate ${value}`);
        seen.add(value);
    }
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    safeRelativePath("metadata", contract.metadata);
    if (assertObject("expected", contract.expected)) {
        assertNonNegativeInteger("expected.commandCount", contract.expected.commandCount);
        for (const field of ["binaries", "globalFlags", "completionShells"]) {
            const values = assertStringArray(`expected.${field}`, contract.expected[field], {
                allowEmpty: false,
            });
            assertUnique(`expected.${field}`, values);
        }
        if (assertObject("expected.exitCodes", contract.expected.exitCodes)) {
            for (const field of ["success", "runtimeOrApiError", "usageError"]) {
                assertNonNegativeInteger(`expected.exitCodes.${field}`, contract.expected.exitCodes[field]);
            }
        }
    }

    if (assertObject("sourceEvidence", contract.sourceEvidence)) {
        const requiredEvidence = [
            "entrypoint",
            "completions",
            "readme",
            "indexTest",
            "completionTest",
            "exitContractTest",
        ];
        for (const key of requiredEvidence) {
            safeRelativePath(`sourceEvidence.${key}`, contract.sourceEvidence[key]);
        }
        assertUnique("sourceEvidence", Object.values(contract.sourceEvidence).filter((value) => typeof value === "string"));
    }

    if (assertObject("wiring", contract.wiring)) {
        assertNonEmptyString("wiring.makeTarget", contract.wiring.makeTarget);
        safeRelativePath("wiring.checker", contract.wiring.checker);
        assertNonEmptyString("wiring.docsIndexContract", contract.wiring.docsIndexContract);
        assertNonEmptyString("wiring.qualityGate", contract.wiring.qualityGate);
        assertNonEmptyString("wiring.inventoryId", contract.wiring.inventoryId);
        assertNonEmptyString("wiring.auditId", contract.wiring.auditId);
    }
}

validateContractShape();
if (failures.length > 0) {
    console.error("CLI contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const metadata = readJson(contract.metadata, "metadata");

if ((metadata.commands ?? []).length !== contract.expected.commandCount) {
    fail(`expected ${contract.expected.commandCount} commands, got ${(metadata.commands ?? []).length}`);
}

checkCommandStructureDrift(metadata);

const makefile = readRelative("Makefile");
const wiring = contract.wiring ?? {};
if (!makefile.includes(`${wiring.makeTarget}:`)) fail(`Makefile missing ${wiring.makeTarget} target`);
if (!isWiringTargetReachable(makefile, "contract-gates", wiring)) {
    fail(`Makefile contract-gates cannot reach ${wiring.makeTarget}`);
}
for (const target of ["perfect-fast", "perfect-full"]) {
    if (!isWiringTargetReachable(makefile, target, wiring)) {
        fail(`Makefile ${target} cannot reach ${wiring.makeTarget}`);
    }
}
if (!makefile.includes(`node ${wiring.checker}`)) fail(`Makefile ${wiring.makeTarget} target does not run checker`);

const docsIndex = readRelative("docs/README.md");
if (!docsIndex.includes(`./${wiring.docsIndexContract}`)) fail(`docs/README.md missing ${wiring.docsIndexContract}`);

const qualityGates = readRelative("docs/quality-gates.md");
if (!qualityGates.includes(wiring.qualityGate)) fail(`docs/quality-gates.md missing ${wiring.qualityGate}`);

const inventory = readRelative("docs/contract-inventory.json");
if (!inventory.includes(`"id": "${wiring.inventoryId}"`)) {
    fail(`docs/contract-inventory.json missing ${wiring.inventoryId}`);
}

const audit = readRelative("docs/enterprise-hardening-audit.json");
if (!audit.includes(`"id": "${wiring.auditId}"`)) {
    fail(`docs/enterprise-hardening-audit.json missing ${wiring.auditId}`);
}

const readme = readEvidence("readme");
const entrypoint = readEvidence("entrypoint");
const completions = readEvidence("completions");
const indexTest = readEvidence("indexTest");
const completionTest = readEvidence("completionTest");
const exitContractTest = readEvidence("exitContractTest");

for (const command of metadata.commands ?? []) {
    if (!command.command?.startsWith("clk115 ")) {
        fail(`command does not use clk115 prefix: ${command.command}`);
    }
    const readmeCommand = command.command.replaceAll("|", "\\|");
    if (!readme.includes(readmeCommand)) {
        fail(`README command table missing ${command.command}`);
    }
}

for (const binary of contract.expected.binaries ?? []) {
    if (!readme.includes(binary)) fail(`README missing binary ${binary}`);
    if (!completionTest.includes(binary)) fail(`completion test missing binary ${binary}`);
}

for (const flag of contract.expected.globalFlags ?? []) {
    if (!entrypoint.includes(flag)) fail(`entrypoint missing global flag ${flag}`);
    if (!readme.includes(flag)) fail(`README missing global flag ${flag}`);
}

// CLI-9 reverse direction: every root-program option registered in the
// entrypoint must be LISTED in the contract. The forward loop above only
// proves listed flags exist, so an unlisted registration (--region and
// --subdomain sat unlisted for months) was invisible drift.
{
    const registered = new Set();
    for (const match of entrypoint.matchAll(/\.option\(\s*"(--[a-z][a-z-]*)[ <"]/g)) {
        registered.add(match[1]);
    }
    const listed = new Set(contract.expected.globalFlags ?? []);
    for (const flag of registered) {
        // Commander registers "--no-color" as the negation of color; the
        // contract lists the literal registered form, so compare directly.
        if (!listed.has(flag)) {
            fail(`entrypoint registers global flag ${flag} that docs/cli-contract.json does not list`);
        }
    }
}

for (const shell of contract.expected.completionShells ?? []) {
    if (!completions.includes(shell)) fail(`completion renderer missing shell ${shell}`);
    if (!completionTest.includes(shell)) fail(`completion test missing shell ${shell}`);
    if (!readme.includes(shell)) fail(`README missing shell ${shell}`);
}

if (!indexTest.includes("completion")) fail("index test does not include completion command");
if (!exitContractTest.includes("toBe(2)")) fail("exit contract test missing usage exit code 2");
if (!exitContractTest.includes("toBe(1)")) fail("exit contract test missing runtime/API exit code 1");
if (!exitContractTest.includes("toBe(0)")) fail("exit contract test missing success exit code 0");

if (failures.length > 0) {
    console.error("CLI contract check failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`CLI contract passed (${metadata.commands.length} commands)`);

/**
 * Cross-checks docs/cli-commands.json against the real Commander tree:
 * every documented command path must exist for real, every real leaf must
 * have a row, and every `--flag` a row documents (or omits) must match the
 * leaf's actually-registered long flags. This catches command/flag drift
 * (renamed, added, or removed) that a README-vs-JSON self-consistency check
 * cannot see.
 *
 * Deliberately does NOT regenerate descriptions or full usage strings from
 * `.description()`/option text: measured at execution time, 43 of 64 leaf
 * descriptions differ from the hand-curated JSON, several by real
 * documented caveats absent from the source (e.g. "the endpoint 400s
 * without them", "Window must be <= 31 days"). Mechanically overwriting
 * those would be a documentation-quality regression, not a fix — the
 * finding's actual concern (silent structural drift) is closed by this
 * narrower path+flag check instead.
 */
function checkCommandStructureDrift(metadata) {
    const source = [
        'import { buildProgram } from "./cli/src/index.ts";',
        'import { collectClassifiedLeaves } from "./cli/src/commands/leaf-command.ts";',
        "const leaves = collectClassifiedLeaves(buildProgram());",
        "const rows = leaves.map(({ command, path }) => ({",
        "  path: path.join(\" \"),",
        "  options: command.options.map((o) => ({ long: o.long, short: o.short ?? null })),",
        "}));",
        "console.log(JSON.stringify(rows));",
    ].join("\n");
    const inspected = spawnSync(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "--eval", source],
        { cwd: root, encoding: "utf8", env: { ...process.env, CLOCKIFY_API_KEY: "", CLOCKIFY_WORKSPACE_ID: "" } },
    );
    if (inspected.status !== 0) {
        fail(`Commander structure introspection failed: ${inspected.stderr.trim() || `exited ${inspected.status}`}`);
        return;
    }

    let realLeaves;
    try {
        realLeaves = JSON.parse(inspected.stdout);
    } catch (error) {
        fail(`Commander structure introspection: invalid JSON: ${error.message}`);
        return;
    }

    const realByPath = new Map(realLeaves.map((leaf) => [leaf.path, leaf]));
    const rowPaths = new Set();

    // Commander's implicit `help [command]` is real (verified: `clk115 help
    // status` works, and it appears in `--help`'s command list) but is
    // special-cased by Commander rather than registered as a `.command()`
    // entry, so `collectClassifiedLeaves` — which walks `program.commands`
    // — cannot see it. `--version` is a global flag, not a subcommand.
    const knownVirtualPaths = new Set(["help"]);

    for (const row of metadata.commands ?? []) {
        if (row.command === "clk115 --version") continue; // global flag, not a command row

        const commandPath = commandRowPath(row.command);
        if (commandPath === null) {
            fail(`docs/cli-commands.json row has an unparseable command: ${row.command}`);
            continue;
        }
        rowPaths.add(commandPath);
        if (knownVirtualPaths.has(commandPath)) continue;

        const leaf = realByPath.get(commandPath);
        if (leaf === undefined) {
            fail(`docs/cli-commands.json documents a command that does not exist: ${commandPath}`);
            continue;
        }

        const rowText = row.command;
        for (const option of leaf.options) {
            const documented =
                rowText.includes(option.long) || (option.short !== null && rowText.includes(option.short));
            if (!documented) fail(`docs/cli-commands.json row "${commandPath}" is missing real flag ${option.long}`);
        }
        const realLongFlags = new Set(leaf.options.map((o) => o.long));
        for (const match of rowText.matchAll(/--[a-zA-Z][a-zA-Z-]*/g)) {
            if (!realLongFlags.has(match[0])) {
                fail(`docs/cli-commands.json row "${commandPath}" documents nonexistent flag ${match[0]}`);
            }
        }
    }

    for (const realPath of realByPath.keys()) {
        if (!rowPaths.has(realPath)) fail(`docs/cli-commands.json is missing a row for real command: ${realPath}`);
    }
}

/** Strips "clk115 " and returns the leading bareword path tokens, stopping at the first `<`/`[`/`-` token. */
function commandRowPath(command) {
    if (typeof command !== "string" || !command.startsWith("clk115 ")) return null;
    const words = command.slice("clk115 ".length).split(/\s+/);
    const bareWords = [];
    for (const word of words) {
        if (/^[a-zA-Z][a-zA-Z0-9-]*$/.test(word)) {
            bareWords.push(word);
        } else {
            break;
        }
    }
    return bareWords.length > 0 ? bareWords.join(" ") : null;
}

function readEvidence(label) {
    const relativePath = contract.sourceEvidence?.[label];
    if (!relativePath) return "";
    return readRelative(relativePath, `sourceEvidence.${label}`);
}
