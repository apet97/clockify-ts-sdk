#!/usr/bin/env node
// Generate the contributor proof matrix embedded in CONTRIBUTING.md.
//
// The row-to-scope mapping and command cells live in
// docs/change-impact-contract.json. CONTRIBUTING.md is only a rendered view;
// run `make contributing-matrix` after changing the canonical contract.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "CONTRIBUTING.md");
const contractPath = path.join(root, "docs", "change-impact-contract.json");
const args = new Set(process.argv.slice(2));
const START = "<!-- BEGIN GENERATED CONTRIBUTOR PROOF MATRIX -->";
const END = "<!-- END GENERATED CONTRIBUTOR PROOF MATRIX -->";
const BANNER = "<!-- Generated from docs/change-impact-contract.json by scripts/generate-contributing-matrix.mjs. Do not edit by hand. -->";

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fail(message) {
    console.error(`contributor matrix contract failed: ${message}`);
    process.exit(1);
}

function validateMatrix(contract) {
    const matrix = contract.contributorMatrix;
    if (!matrix || matrix.schemaVersion !== 1 || !Array.isArray(matrix.rows) || matrix.rows.length === 0) {
        fail("contributorMatrix must define schemaVersion 1 and a non-empty rows array");
    }

    const scopeIds = new Set((contract.scopes ?? []).map((scope) => scope.id));
    const seenScopes = new Map();
    const seenRows = new Set();
    for (const [rowIndex, row] of matrix.rows.entries()) {
        if (!row || typeof row !== "object") fail(`rows[${rowIndex}] must be an object`);
        if (!row.id || !row.title) fail(`rows[${rowIndex}] must have id and title`);
        if (seenRows.has(row.id)) fail(`duplicate row id ${row.id}`);
        seenRows.add(row.id);
        if (!Array.isArray(row.scopeIds) || row.scopeIds.length === 0) {
            fail(`${row.id} must name at least one canonical scope`);
        }
        if (!Array.isArray(row.commands) || row.commands.length === 0 || row.commands.some((command) => typeof command !== "string" || command.trim() === "")) {
            fail(`${row.id} must contain non-empty copy-paste command strings`);
        }
        for (const scopeId of row.scopeIds) {
            if (!scopeIds.has(scopeId)) fail(`${row.id} references unknown change-impact scope ${scopeId}`);
            if (seenScopes.has(scopeId)) fail(`change-impact scope ${scopeId} is assigned to both ${seenScopes.get(scopeId)} and ${row.id}`);
            seenScopes.set(scopeId, row.id);
        }
    }

    const missingScopes = [...scopeIds].filter((scopeId) => !seenScopes.has(scopeId));
    if (missingScopes.length > 0) fail(`matrix does not assign every canonical scope: ${missingScopes.join(", ")}`);
    return matrix;
}

function replaceSection(document, section) {
    const start = document.indexOf(START);
    const end = document.indexOf(END);
    if (start < 0 || end < 0 || end < start) {
        fail(`CONTRIBUTING.md must contain ${START} and ${END}`);
    }
    const endOffset = end + END.length;
    if (document.indexOf(START, start + START.length) >= 0 || document.indexOf(END, end + END.length) >= 0) {
        fail("CONTRIBUTING.md must contain exactly one generated matrix section");
    }
    return `${document.slice(0, start)}${section}${document.slice(endOffset)}`;
}

function inline(value) {
    return `\`${String(value).replaceAll("`", "\\`")}\``;
}

function render(matrix) {
    const lines = [
        START,
        BANNER,
        "",
        "## Contributor proof matrix",
        "",
        "Use the row whose canonical change-impact scopes match the files being changed. Each proof cell contains copy-paste commands; scope ownership is derived from `docs/change-impact-contract.json`.",
        "",
        "| Change surface | Canonical change-impact scopes | Copy-paste proof |",
        "|---|---|---|",
    ];

    for (const row of matrix.rows) {
        const scopes = row.scopeIds.map(inline).join("<br>");
        const commands = row.commands.map(inline).join("<br>");
        lines.push(`| ${row.title} | ${scopes} | ${commands} |`);
    }

    lines.push("", END);
    return lines.join("\n");
}

const contract = readJson(contractPath);
const matrix = validateMatrix(contract);
const current = fs.readFileSync(outputPath, "utf8");
const expected = replaceSection(current, render(matrix));

if (args.has("--write")) {
    fs.writeFileSync(outputPath, expected);
    console.log(`wrote CONTRIBUTING.md (${matrix.rows.length} generated proof rows)`);
} else if (args.has("--check")) {
    if (current !== expected) {
        console.error("CONTRIBUTING.md contributor proof matrix is stale. Run `make contributing-matrix`.");
        process.exit(1);
    }
    console.log(`contributor proof matrix is current (${matrix.rows.length} rows, ${(contract.scopes ?? []).length} scopes)`);
} else {
    console.error("usage: generate-contributing-matrix.mjs [--write|--check]");
    process.exit(2);
}
