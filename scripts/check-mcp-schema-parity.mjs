#!/usr/bin/env node
// check-mcp-schema-parity (W2a scope): docs/mcp-tool-schemas.json stays
// fresh against the real, built MCP server, and every widened-type
// coercion-family license in docs/surface-divergence-licenses.json stays
// source-anchored in both directions -- the license's helper is still
// defined where it claims, AND still has at least one real call site (so a
// license cannot outlive the code it excuses, and cannot be written for
// code that was never really there).
//
// W2b (the full per-operation extra/omitted-param diff against
// docs/operation-parity.json + docs/openapi-operations.json) is
// deliberately NOT implemented here -- see this file's contract's purpose
// and docs/surface-divergence-licenses.json's purpose for why a naive diff
// is not tractable as a per-instance license surface.
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
    failures.push(message);
}

async function readRoot(relativePath) {
    return readFile(path.join(root, relativePath), "utf8");
}

function runNode(args, cwd) {
    return spawnSync(process.execPath, args, { cwd, encoding: "utf8" });
}

// --- docs/mcp-tool-schemas.json freshness -------------------------------
const schemasResult = runNode(
    ["--import", "tsx", "scripts/generate-mcp-tool-schemas.mjs", "--check"],
    path.join(root, "mcp"),
);
if (schemasResult.status !== 0) {
    fail(
        `docs/mcp-tool-schemas.json is stale or the generator failed: ${schemasResult.stdout}${schemasResult.stderr}`,
    );
}

// docs/mcp-tool-manifest.json is generated from the SAME live
// buildServer(ctx) registration this checker's schema emitter reads. Its own
// drift check passing is proof the advertised tools/list surface (name,
// annotations, risk, confirmation) is unchanged from what this read-only
// introspection observed -- scopeStop: NEVER changes model-visible schemas.
const manifestResult = runNode(
    ["--import", "tsx", "scripts/generate-tool-manifest.mjs", "--check"],
    path.join(root, "mcp"),
);
if (manifestResult.status !== 0) {
    fail(
        `docs/mcp-tool-manifest.json is stale (tools/list surface changed?): ${manifestResult.stdout}${manifestResult.stderr}`,
    );
}

// --- widened-type coercion family: source-anchored both directions -----
const licenses = JSON.parse(await readRoot("docs/surface-divergence-licenses.json"));
if (!Array.isArray(licenses.entries)) {
    fail("docs/surface-divergence-licenses.json entries must be an array");
} else {
    const widenedTypeEntries = licenses.entries.filter((entry) => entry.kind === "widened-type");
    if (widenedTypeEntries.length === 0) {
        fail("docs/surface-divergence-licenses.json has no widened-type entry for the coercion family");
    }
    const argShapesSource = await readRoot("mcp/src/arg-shapes.ts").catch(() => null);
    // Discover EVERY z.preprocess-based widening helper structurally (not a
    // hardcoded ["zStringList", "zNumberLike"] list) so a brand new
    // coercion helper is caught as unlicensed the moment it is added, not
    // only when someone happens to update a name list too. Matches "export
    // function <name>" and confirms the function's own body (up to the
    // next "export function" or EOF) contains "z.preprocess".
    const discoveredHelpers = new Set();
    if (argShapesSource == null) {
        fail("mcp/src/arg-shapes.ts does not exist");
    } else {
        const exportedFunctionNames = [...argShapesSource.matchAll(/export function (\w+)/g)].map((m) => m[1]);
        for (let i = 0; i < exportedFunctionNames.length; i += 1) {
            const name = exportedFunctionNames[i];
            const startIndex = argShapesSource.indexOf(`export function ${name}`);
            const nextName = exportedFunctionNames[i + 1];
            const endIndex = nextName
                ? argShapesSource.indexOf(`export function ${nextName}`, startIndex)
                : argShapesSource.length;
            if (argShapesSource.slice(startIndex, endIndex).includes("z.preprocess")) {
                discoveredHelpers.add(name);
            }
        }
    }

    for (const entry of widenedTypeEntries) {
        if (typeof entry.evidenceAnchor !== "string" || !entry.evidenceAnchor.includes(":")) {
            fail(`widened-type entry "${entry.operationOrFamily}" needs an evidenceAnchor of the form path:symbol[,symbol...]`);
            continue;
        }
        const [anchorPath, symbolList] = entry.evidenceAnchor.split(":");
        const anchorSource = await readRoot(anchorPath).catch(() => null);
        if (anchorSource == null) {
            fail(`widened-type entry "${entry.operationOrFamily}" evidenceAnchor names missing file ${anchorPath}`);
            continue;
        }
        const symbols = symbolList.split(",").map((symbol) => symbol.trim()).filter(Boolean);
        if (symbols.length === 0) {
            fail(`widened-type entry "${entry.operationOrFamily}" evidenceAnchor names no symbols`);
        }
        for (const symbol of symbols) {
            // Direction 1: the license's claimed helper must still be
            // exported from its claimed definition site.
            const exportPattern = new RegExp(`export function ${symbol}\\b`);
            if (!exportPattern.test(anchorSource)) {
                fail(
                    `widened-type entry "${entry.operationOrFamily}" claims ${symbol} is exported from ${anchorPath}, but it is not -- delete the entry or fix the anchor (rot)`,
                );
            }
        }
    }

    const licensedHelpers = new Set(
        widenedTypeEntries.flatMap((entry) => (entry.evidenceAnchor ?? "").split(":")[1]?.split(",").map((s) => s.trim()) ?? []),
    );

    // Direction 2 (structural, not a hardcoded name list): every discovered
    // z.preprocess helper must be licensed, and every licensed helper must
    // still have at least one real call site in mcp/src/tools/**, or the
    // license is for code that no longer exists (rot).
    const unlicensedHelpers = [...discoveredHelpers].filter((helper) => !licensedHelpers.has(helper));
    for (const helper of unlicensedHelpers) {
        fail(
            `mcp/src/arg-shapes.ts exports z.preprocess-based helper ${helper}, but no widened-type license covers it -- add a license entry or remove the coercion`,
        );
    }

    const toolsFiles = await collectToolsFiles(path.join(root, "mcp", "src", "tools"));
    const callSiteCounts = new Map();
    for (const file of toolsFiles) {
        const text = await readFile(file, "utf8");
        for (const helper of licensedHelpers) {
            const matches = text.match(new RegExp(`\\b${helper}\\(`, "g"));
            if (matches) callSiteCounts.set(helper, (callSiteCounts.get(helper) ?? 0) + matches.length);
        }
    }
    for (const helper of licensedHelpers) {
        if ((callSiteCounts.get(helper) ?? 0) === 0) {
            fail(
                `widened-type license claims ${helper} is used in mcp/src/tools/**, but no call site was found (rot -- helper usage deleted)`,
            );
        }
    }
}

async function collectToolsFiles(dir) {
    const { readdir } = await import("node:fs/promises");
    const results = [];
    const walk = async (current) => {
        const entries = await readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) await walk(full);
            else if (entry.isFile() && entry.name.endsWith(".ts")) results.push(full);
        }
    };
    await walk(dir);
    return results;
}

if (failures.length > 0) {
    console.error("MCP schema parity check failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("MCP schema parity check passed (schema artifact fresh, widened-type coercion family source-anchored).");
