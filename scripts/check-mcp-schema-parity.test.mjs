#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runChecker() {
    return spawnSync(process.execPath, ["scripts/check-mcp-schema-parity.mjs"], {
        cwd: root,
        encoding: "utf8",
    });
}

test("MCP schema parity check passes against the real repo", () => {
    const result = runChecker();
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /MCP schema parity check passed/);
});

test("MCP schema parity check reds when a new z.preprocess coercion helper is added without a license", async () => {
    // Mirrors the card's own redFirst wording: "unlicensed extra param ->
    // red naming symbol" -- here, an unlicensed coercion helper naming
    // itself in the failure. Mutates real files on disk, runs the real
    // checker, and restores in `finally` no matter what.
    const argShapesPath = path.join(root, "mcp", "src", "arg-shapes.ts");
    const clientsPath = path.join(root, "mcp", "src", "tools", "clients.ts");
    const originalArgShapes = await readFile(argShapesPath, "utf8");
    const originalClients = await readFile(clientsPath, "utf8");

    const needle = "export function zStringList<S extends z.ZodType = z.ZodArray<z.ZodString>>(";
    assert.ok(originalArgShapes.includes(needle));
    const newHelper = [
        "export function zBooleanLike<S extends z.ZodType = z.ZodBoolean>(schema?: S): z.ZodType<z.output<S>> {",
        "    const inner = (schema ?? z.boolean()) as S;",
        "    return z.preprocess((value) => value, inner);",
        "}",
        "",
        needle,
    ].join("\n");
    const mutatedArgShapes = originalArgShapes.replace(needle, newHelper);
    assert.notEqual(mutatedArgShapes, originalArgShapes);

    const mutatedClients = originalClients
        .replace(
            'import { zNumberLike } from "../arg-shapes.js";',
            'import { zBooleanLike, zNumberLike } from "../arg-shapes.js";',
        )
        .replace("archived: z.boolean().optional(),", "archived: zBooleanLike(z.boolean()).optional(),");
    assert.notEqual(mutatedClients, originalClients);

    try {
        await writeFile(argShapesPath, mutatedArgShapes);
        await writeFile(clientsPath, mutatedClients);
        const result = runChecker();
        assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.match(result.stdout + result.stderr, /zBooleanLike, but no widened-type license covers it/);
    } finally {
        await writeFile(argShapesPath, originalArgShapes);
        await writeFile(clientsPath, originalClients);
    }
});

test("MCP schema parity check reds (rot) when a licensed helper's definition is deleted", async () => {
    const argShapesPath = path.join(root, "mcp", "src", "arg-shapes.ts");
    const original = await readFile(argShapesPath, "utf8");
    const match = /export function zNumberLike[\s\S]*?\n\}\n/.exec(original);
    assert.ok(match, "zNumberLike definition must be present to mutate");
    const mutated = original.replace(match[0], "");
    assert.notEqual(mutated, original);

    try {
        await writeFile(argShapesPath, mutated);
        const result = runChecker();
        assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.match(result.stdout + result.stderr, /claims zNumberLike is exported .* but it is not -- delete the entry or fix the anchor \(rot\)/);
    } finally {
        await writeFile(argShapesPath, original);
    }
});

test("MCP schema parity check reds when docs/mcp-tool-schemas.json is stale", async () => {
    const schemasPath = path.join(root, "docs", "mcp-tool-schemas.json");
    const original = await readFile(schemasPath, "utf8");
    const mutated = original.replace('"toolCount":', '"toolCount_STALE_MARKER":');
    assert.notEqual(mutated, original);
    try {
        await writeFile(schemasPath, mutated);
        const result = runChecker();
        assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.match(result.stdout + result.stderr, /docs\/mcp-tool-schemas\.json is stale/);
    } finally {
        await writeFile(schemasPath, original);
    }
});
