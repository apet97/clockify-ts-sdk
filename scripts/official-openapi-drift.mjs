#!/usr/bin/env node
// Official-vs-custom OpenAPI drift driver.
//
//   node scripts/official-openapi-drift.mjs --write     regenerate the 3 trust surfaces (make official-openapi-report)
//   node scripts/official-openapi-drift.mjs --check      fail if a surface is stale (make official-openapi-drift gate)
//   node scripts/official-openapi-drift.mjs --report     print NEW_OFFICIAL_ENDPOINT/CUSTOM_BETTER/CONFLICT/PHANTOM_RISK lines
//   node scripts/official-openapi-drift.mjs --fetch       compare the LIVE official spec (network) vs the committed snapshot
//
// --write/--check/--report are fully offline and deterministic (they read the
// committed official snapshot). --fetch is the only networked mode and is never
// run inside perfect-fast/perfect-full. The corrected spec is read-only here.
import fs from "node:fs";
import path from "node:path";
import {
    ROOT,
    SPEC_PATHS,
    GENERATED_DOCS,
    OFFICIAL_OPENAPI_URL,
    buildOfficialDriftReport,
    renderReportLines,
    renderSpecDiff,
    renderSpecConfidence,
    renderLiveEvidenceIndex,
    indexOperations,
    parseSpec,
} from "./official-openapi-report.mjs";

const args = new Set(process.argv.slice(2));
const wantWrite = args.has("--write");
const wantCheck = args.has("--check");
const wantReport = args.has("--report");
const wantFetch = args.has("--fetch");

function renderAllSurfaces() {
    const report = buildOfficialDriftReport();
    return {
        report,
        files: {
            [GENERATED_DOCS.specDiff]: renderSpecDiff(report.diff, { officialSource: SPEC_PATHS.official }),
            [GENERATED_DOCS.specConfidence]: renderSpecConfidence(report.corrected, report.diff, report.parsed),
            [GENERATED_DOCS.liveEvidence]: renderLiveEvidenceIndex(report.corrected, report.parsed),
        },
    };
}

function writeSurfaces() {
    const { files } = renderAllSurfaces();
    for (const [rel, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(ROOT, rel), content);
        console.log(`wrote ${rel}`);
    }
}

function checkSurfaces() {
    const { files } = renderAllSurfaces();
    const stale = [];
    for (const [rel, content] of Object.entries(files)) {
        const abs = path.join(ROOT, rel);
        const current = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
        if (current !== content) stale.push(rel);
    }
    if (stale.length > 0) {
        console.error("Official OpenAPI drift surfaces are stale:");
        for (const rel of stale) console.error(`- ${rel}`);
        console.error("Run `make official-openapi-report` to regenerate.");
        process.exit(1);
    }
    console.log(`Official OpenAPI drift surfaces up to date (${Object.keys(files).length} files).`);
}

function printReport() {
    const { report } = renderAllSurfaces();
    const lines = renderReportLines(report.diff);
    const s = report.diff.summary;
    console.log(
        `# official-openapi drift (official=${s.officialOps} custom=${s.correctedOps} new-official=${s.newOfficial} custom-only=${s.customBetter} conflicts=${s.conflicts} phantom-risk=${s.phantomRisk})`,
    );
    for (const line of lines) console.log(line);
}

async function fetchLiveAndCompare() {
    let text;
    try {
        const res = await fetch(OFFICIAL_OPENAPI_URL, { headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        text = await res.text();
    } catch (error) {
        console.error(`--fetch skipped: could not retrieve ${OFFICIAL_OPENAPI_URL} (${error.message}).`);
        console.error("This is expected offline; the committed snapshot remains the source of truth.");
        return;
    }
    const liveDoc = parseSpec(text, ".json");
    const { corrected } = buildOfficialDriftReport();
    const live = indexOperations(liveDoc);
    const correctedKeys = new Set(corrected.keys());
    const newOfficial = [...live.values()].filter((op) => !correctedKeys.has(op.key)).sort((a, b) => a.key.localeCompare(b.key));
    console.log(`# FETCHED_DELTA live official=${live.size} vs custom=${corrected.size}`);
    if (newOfficial.length === 0) {
        console.log("No live official endpoints are missing from the custom spec.");
        return;
    }
    for (const op of newOfficial) {
        console.log(`NEW_OFFICIAL_ENDPOINT: ${op.method} ${op.rawPath.replace(/^\/v1(?=\/)/, "")}  (operationId=${op.operationId ?? "n/a"})`);
    }
    console.log(
        `\n${newOfficial.length} live official operation(s) are not yet imported into the custom spec.`,
        "Spec-shape changes start in ../GOCLMCP, then flow into spec/corrected. Record decisions in",
        "spec/evidence/discrepancies.md.",
    );
}

async function main() {
    if (wantFetch) {
        await fetchLiveAndCompare();
        return;
    }
    if (wantWrite) {
        writeSurfaces();
        return;
    }
    if (wantCheck) {
        checkSurfaces();
        return;
    }
    if (wantReport) {
        printReport();
        return;
    }
    console.error("usage: official-openapi-drift.mjs [--write|--check|--report|--fetch]");
    process.exit(2);
}

main();
