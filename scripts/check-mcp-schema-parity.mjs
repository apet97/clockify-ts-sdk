#!/usr/bin/env node
// check-mcp-schema-parity (W2a + W2b): docs/mcp-tool-schemas.json stays
// fresh against the real, built MCP server; every widened-type coercion-
// family license in docs/surface-divergence-licenses.json stays source-
// anchored in both directions (W2a); and every MCP tool param NOT present
// in the underlying operation's SDK-side path/query/body param set is
// either licensed as extra-param or reds naming the operation, tool, and
// param (W2b). "Extra" direction only, per the card's own redFirst --
// an MCP tool exposing FEWER filters than the raw operation (omitted-param)
// is informational, not gated here.
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

import { buildModel } from "./sdk-codegen/model.mjs";
import { toCamel } from "./sdk-codegen/naming.mjs";
import { deref } from "./sdk-codegen/schema.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Universal MCP write-confirmation params on every preview_token-confirmed
// tool -- already licensed once, as a family, under the "risky write tools"
// behavior entry above. Never need a per-operation extra-param license.
const UNIVERSAL_MCP_PARAMS = new Set(["dry_run", "confirm_token"]);
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

// --- W2b: per-operation extra-param diff, extra direction only ---------
if (Array.isArray(licenses.entries)) {
    const extraParamEntries = licenses.entries.filter((entry) => entry.kind === "extra-param");

    // operationId -> the one entry licensing it, plus per-entry observed
    // (param, operationId) pairs actually seen divergent -- tracked
    // separately from entry.operationIds/extraParams so the rot check below
    // can tell "this specific member still diverges on this specific param"
    // from "SOME member somewhere still diverges on SOME licensed param",
    // which a family-wide union would silently paper over.
    const entryByOperation = new Map();
    for (const entry of extraParamEntries) {
        if (!Array.isArray(entry.operationIds) || entry.operationIds.length === 0) {
            fail(`extra-param entry "${entry.operationOrFamily}" needs a non-empty operationIds array`);
            continue;
        }
        if (!Array.isArray(entry.extraParams) || entry.extraParams.length === 0) {
            fail(`extra-param entry "${entry.operationOrFamily}" needs a non-empty extraParams array`);
            continue;
        }
        entry.extraParamsSet = new Set(entry.extraParams);
        entry.observedByOperation = new Map(entry.operationIds.map((operationId) => [operationId, new Set()]));
        for (const operationId of entry.operationIds) {
            if (entryByOperation.has(operationId)) {
                fail(`operationId "${operationId}" is licensed by more than one extra-param entry`);
                continue;
            }
            entryByOperation.set(operationId, entry);
        }
    }

    const specText = await readRoot("spec/corrected/clockify.corrected.openapi.yaml").catch(() => null);
    const parityText = await readRoot("docs/operation-parity.json").catch(() => null);
    const schemasText = await readRoot("docs/mcp-tool-schemas.json").catch(() => null);

    if (specText == null || parityText == null || schemasText == null) {
        fail("W2b extra-param diff: missing spec, operation-parity, or mcp-tool-schemas input");
    } else {
        const doc = YAML.parse(specText);
        const model = buildModel(doc);
        const parityByOperation = new Map(
            JSON.parse(parityText).operations.map((operation) => [operation.operationId, operation]),
        );
        const toolByName = new Map(JSON.parse(schemasText).tools.map((tool) => [tool.name, tool]));

        for (const operation of model.operations) {
            const toolName = parityByOperation.get(operation.operationId)?.tsMcp;
            if (!toolName) continue;
            const tool = toolByName.get(toolName);
            if (!tool) continue;

            const sdkParams = new Set([
                ...operation.pathParams.map((parameter) => toCamel(parameter.name)),
                ...operation.queryParams.map((parameter) => toCamel(parameter.name)),
                ...bodyParamNames(operation.requestBody, model.doc),
            ]);
            const mcpParams = new Set(Object.keys(tool.inputSchema?.properties ?? {}));
            for (const universal of UNIVERSAL_MCP_PARAMS) mcpParams.delete(universal);

            const entry = entryByOperation.get(operation.operationId);
            for (const param of mcpParams) {
                if (sdkParams.has(param)) continue;
                if (entry?.extraParamsSet.has(param)) {
                    entry.observedByOperation.get(operation.operationId).add(param);
                    continue;
                }
                fail(
                    `${operation.operationId} -> ${toolName}: MCP param "${param}" is not in the SDK ` +
                        `path/query/body param set and has no extra-param license -- add one to ` +
                        `docs/surface-divergence-licenses.json or remove the param`,
                );
            }
        }

        // Rot direction, per entry: every licensed operationId must still be
        // wired AND still diverge on at least one param; every licensed
        // param must still be observed on at least one of the entry's
        // operationIds (a param unique to one member, and a member unique
        // to one param, both rot independently in a multi-member family).
        for (const entry of extraParamEntries) {
            if (!entry.observedByOperation) continue; // failed shape validation above
            const observedParamsAcrossEntry = new Set();
            for (const [operationId, observedParams] of entry.observedByOperation) {
                for (const param of observedParams) observedParamsAcrossEntry.add(param);
                if (observedParams.size === 0) {
                    fail(
                        `extra-param entry "${entry.operationOrFamily}" names operationId "${operationId}", ` +
                            `but it no longer measures as divergent on any licensed param (rot -- narrow the ` +
                            `license or delete the entry)`,
                    );
                }
            }
            for (const param of entry.extraParamsSet) {
                if (!observedParamsAcrossEntry.has(param)) {
                    fail(
                        `extra-param entry "${entry.operationOrFamily}" licenses param "${param}", but no ` +
                            `member operation still measures it as divergent (rot -- narrow the license or ` +
                            `delete the entry)`,
                    );
                }
            }
        }
    }
}

// One level of allOf-merge: the corrected spec nests request-body branches
// at most one level deep for every operation this diff has observed.
function bodyParamNames(requestBody, doc) {
    if (!requestBody) return [];
    const resolved = deref(requestBody.schema, { doc });
    if (!resolved || typeof resolved !== "object") return [];
    const branches = Array.isArray(resolved.allOf)
        ? resolved.allOf.map((branch) => deref(branch, { doc }))
        : [resolved];
    const names = new Set();
    for (const branch of branches) {
        for (const key of Object.keys(branch?.properties ?? {})) names.add(key);
    }
    return [...names];
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

console.log(
    "MCP schema parity check passed (schema artifact fresh, widened-type coercion family source-anchored, " +
        "extra-param diff licensed both directions).",
);
