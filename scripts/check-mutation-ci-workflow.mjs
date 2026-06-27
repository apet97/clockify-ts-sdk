#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
    failures.push(message);
}

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function mustContain(label, text, marker) {
    if (!text.includes(marker)) fail(`${label} missing ${JSON.stringify(marker)}`);
}

const workflow = read(".github/workflows/mutation.yml");
const makefile = read("Makefile");
const wrapperStryker = read("wrapper/stryker.conf.json");
const mcpStryker = read("mcp/stryker.conf.json");

for (const marker of [
    "name: Mutation",
    "workflow_dispatch:",
    "target:",
    "type: choice",
    "- all",
    "- wrapper",
    "- mcp",
    "persist-credentials: false",
    "make sdk-codegen",
    "make mutation",
    "npm run mutation -w clockify-sdk-ts-115",
    "node scripts/check-mutation-score.mjs --package wrapper",
    "npm run mutation -w @clockify115/mcp-server",
    "node scripts/check-mutation-score.mjs --package mcp",
    "actions/upload-artifact@v4",
]) {
    mustContain(".github/workflows/mutation.yml", workflow, marker);
}

mustContain("Makefile", makefile, "mutation-ci:");
mustContain("Makefile", makefile, "node scripts/check-mutation-ci-workflow.mjs");

const perfectFullLine = makefile.split("\n").find((line) => line.startsWith("perfect-full:")) ?? "";
if (!perfectFullLine.includes("mutation-ci")) fail("perfect-full must include mutation-ci");
if (perfectFullLine.includes(" mutation ")) fail("perfect-full must not run local mutation");

for (const [label, text] of [
    ["wrapper/stryker.conf.json", wrapperStryker],
    ["mcp/stryker.conf.json", mcpStryker],
]) {
    mustContain(label, text, '"concurrency": 2');
}

if (failures.length > 0) {
    console.error("mutation CI workflow contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("mutation CI workflow contract passed");
