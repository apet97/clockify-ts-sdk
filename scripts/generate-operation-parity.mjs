#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    buildOperationDisposition,
    validateOperationDisposition,
} from "./lib/operation-parity-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const openapiPath = path.join(root, "docs", "openapi-operations.json");
const receiptPath = path.join(root, "output", "ts-sdk", "codegen-receipt.json");
const goCatalogPath = path.join(root, "..", "GOCLMCP", "docs", "tool-catalog.json");
const overridesPath = path.join(root, "docs", "operation-parity-overrides.json");
const classificationsPath = path.join(root, "docs", "sdk-operation-naming-classifications.json");
const discrepancyLedgerPath = path.join(root, "spec", "evidence", "discrepancies.md");
const dispositionPath = path.join(root, "docs", "operation-dispositions.json");
const jsonPath = path.join(root, "docs", "operation-parity.json");
const mdPath = path.join(root, "docs", "operation-parity.md");

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function toSnake(value) {
    return String(value ?? "")
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase();
}

function readTsMcpTools() {
    const manifest = readJson(path.join(root, "docs", "mcp-tool-manifest.json"));
    return new Set((manifest.tools ?? []).map((tool) => tool.name).filter(Boolean));
}

function readExistingGoMcpByOperation() {
    if (!fs.existsSync(jsonPath)) return new Map();
    const current = readJson(jsonPath);
    return new Map(
        (current.operations ?? [])
            .filter((op) => op.operationId && op.goMcp)
            .map((op) => [op.operationId, op.goMcp]),
    );
}

function readGoMcpSurface() {
    if (!fs.existsSync(goCatalogPath)) {
        const byOperation = readExistingGoMcpByOperation();
        return {
            tools: new Set(byOperation.values()),
            byOperation,
        };
    }
    const catalog = readJson(goCatalogPath);
    return {
        tools: new Set((catalog.tools ?? []).map((tool) => tool.name).filter(Boolean)),
        byOperation: new Map(),
    };
}

function readOverrides() {
    if (!fs.existsSync(overridesPath)) return new Map();
    const raw = readJson(overridesPath);
    return new Map((raw.overrides ?? []).map((item) => [item.operationId, item]));
}

const resourceAliases = new Map([
    ["time_entries", "entries"],
    ["audit_log_report", "audit_log"],
    ["user_groups", "groups"],
    ["custom_fields", "custom_fields"],
    ["time_off", "time_off"],
    ["time_off_policies", "time_off"],
    ["expense_categories", "expenses"],
    ["expense_report", "expenses"],
    ["invoice_items", "invoices"],
    ["invoice_payments", "invoices"],
]);

function methodAliases(method) {
    const snake = toSnake(method);
    const aliases = new Set([snake]);
    if (snake === "filter") aliases.add("list");
    if (snake === "find_workspace_users") aliases.add("list");
    if (snake === "generate_detailed_report_v1") aliases.add("list");
    if (snake === "submit") aliases.add("create");
    if (snake === "update_status") aliases.add("update_status");
    if (snake === "list_in_progress") aliases.add("list");
    return [...aliases];
}

function candidateTools(op) {
    const rawGroup = toSnake(op.sdkGroup || op.tags?.[0] || "");
    const group = resourceAliases.get(rawGroup) ?? rawGroup;
    const methodSource = op.sdkMethod || op.operationId || op.method.toLowerCase();
    return methodAliases(methodSource).map((method) => `clockify_${group}_${method}`);
}

function build({ disposition, inventory }) {
    const tsTools = readTsMcpTools();
    const goSurface = readGoMcpSurface();
    const overrides = readOverrides();
    const dispositionByOperation = new Map(
        disposition.operations.map((operation) => [operation.operationId, operation]),
    );
    const operations = inventory.operations.map((op) => {
        const candidates = candidateTools(op);
        const override = overrides.get(op.operationId) ?? {};
        const generatedDisposition = dispositionByOperation.get(op.operationId);
        const inferredTsMcp = candidates.find((name) => tsTools.has(name)) ?? null;
        const inferredGoMcp =
            goSurface.byOperation.get(op.operationId) ??
            candidates.find((name) => goSurface.tools.has(name)) ??
            null;
        const sdk = generatedDisposition?.generated?.clientPath ?? null;
        const tsMcp = Object.prototype.hasOwnProperty.call(override, "tsMcp") ? override.tsMcp : inferredTsMcp;
        const goMcp = Object.prototype.hasOwnProperty.call(override, "goMcp") ? override.goMcp : inferredGoMcp;
        return {
            method: op.method,
            path: op.path,
            operationId: op.operationId,
            sdk,
            sdkNaming: generatedDisposition?.sdkNaming ?? null,
            candidateTools: candidates,
            tsMcp,
            goMcp,
            overrideReason: override.reason ?? null,
            parity: {
                sdkGenerated: generatedDisposition?.generated?.reachable === true,
                tsMcpExact: Boolean(tsMcp),
                goMcpExact: Boolean(goMcp),
                curated: overrides.has(op.operationId),
            },
        };
    });
    const summary = {
        operations: operations.length,
        ...disposition.summary,
        tsMcpExact: operations.filter((op) => op.parity.tsMcpExact).length,
        goMcpExact: operations.filter((op) => op.parity.goMcpExact).length,
        curated: operations.filter((op) => op.parity.curated).length,
    };
    return {
        schemaVersion: 1,
        purpose: "Receipt-derived operation-level parity map across generated SDK methods, TypeScript MCP tools, and GOCLMCP tools.",
        sources: {
            openapi: "docs/openapi-operations.json",
            sdkCodegenReceipt: "output/ts-sdk/codegen-receipt.json",
            sdkNamingClassifications: "docs/sdk-operation-naming-classifications.json",
            operationDispositions: "docs/operation-dispositions.json",
            tsMcp: "docs/mcp-tool-manifest.json",
            goMcp: "../GOCLMCP/docs/tool-catalog.json",
            overrides: "docs/operation-parity-overrides.json",
        },
        summary,
        operations,
    };
}

function jsonFor(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}

function cell(value) {
    if (Array.isArray(value)) return value.length ? value.map((item) => `\`${item}\``).join("<br>") : "-";
    if (value === null || value === undefined || value === false || value === "") return "-";
    if (value === true) return "yes";
    return `\`${String(value).replaceAll("|", "\\|")}\``;
}

function markdownFor(value) {
    const lines = [];
    lines.push("<!-- Generated by scripts/generate-operation-parity.mjs. Run `make operation-parity` after OpenAPI, SDK naming, CLI, or MCP tool changes. -->");
    lines.push("");
    lines.push("# Operation Parity Matrix");
    lines.push("");
    lines.push(value.purpose);
    lines.push("");
    lines.push("## Summary");
    lines.push("");
    lines.push("| Metric | Count |");
    lines.push("|---|---:|");
    for (const [key, count] of Object.entries(value.summary)) lines.push(`| ${key} | ${count} |`);
    lines.push("");
    lines.push("## Operations");
    lines.push("");
    lines.push("| Method | Path | Operation ID | Generated SDK | SDK naming | TS MCP exact | Go MCP exact | Curated reason | Candidate tools |");
    lines.push("|---|---|---|---|---|---|---|---|---|");
    for (const op of value.operations) {
        lines.push(`| ${op.method} | \`${op.path}\` | ${cell(op.operationId)} | ${cell(op.sdk)} | ${cell(op.sdkNaming)} | ${cell(op.tsMcp)} | ${cell(op.goMcp)} | ${op.overrideReason ? op.overrideReason.replaceAll("|", "\\|") : "-"} | ${cell(op.candidateTools)} |`);
    }
    lines.push("");
    return `${lines.join("\n")}\n`;
}

const inventory = readJson(openapiPath);
const receipt = readJson(receiptPath);
const classificationDocument = readJson(classificationsPath);
if (
    classificationDocument.schemaVersion !== 1 ||
    typeof classificationDocument.purpose !== "string" ||
    !Array.isArray(classificationDocument.classifications)
) {
    console.error("SDK operation naming classifications must have schemaVersion 1, purpose, and classifications");
    process.exit(1);
}
const classifications = classificationDocument.classifications ?? [];
const discrepancyLedger = fs.readFileSync(discrepancyLedgerPath, "utf8");
const knownEvidenceIds = new Set(
    [...discrepancyLedger.matchAll(/^### `([^`]+)`/gm)].map((match) => match[1]),
);
const dispositionCore = buildOperationDisposition({ classifications, inventory, receipt });
const disposition = {
    schemaVersion: dispositionCore.schemaVersion,
    purpose: "All corrected OpenAPI operations mapped to codegen-receipt reachability and governed SDK naming classification.",
    sources: {
        openapi: "docs/openapi-operations.json",
        sdkCodegenReceipt: "output/ts-sdk/codegen-receipt.json",
        sdkNamingClassifications: "docs/sdk-operation-naming-classifications.json",
        discrepancyLedger: "spec/evidence/discrepancies.md",
    },
    summary: dispositionCore.summary,
    operations: dispositionCore.operations,
};
const dispositionFailures = validateOperationDisposition({
    artifact: disposition,
    classifications,
    inventory,
    knownEvidenceIds,
    receipt,
});
if (dispositionFailures.length > 0) {
    console.error("Operation disposition validation failed:");
    for (const failure of dispositionFailures) console.error(`- ${failure}`);
    process.exit(1);
}

const parity = build({ disposition, inventory });
const expectedDisposition = jsonFor(disposition);
const expectedJson = jsonFor(parity);
const expectedMd = markdownFor(parity);

if (args.has("--write")) {
    fs.writeFileSync(dispositionPath, expectedDisposition);
    fs.writeFileSync(jsonPath, expectedJson);
    fs.writeFileSync(mdPath, expectedMd);
    console.log("wrote docs/operation-dispositions.json and docs/operation-parity.{json,md}");
    process.exit(0);
}

if (args.has("--check")) {
    const currentDisposition = fs.existsSync(dispositionPath)
        ? fs.readFileSync(dispositionPath, "utf8")
        : "";
    const currentJson = fs.existsSync(jsonPath) ? fs.readFileSync(jsonPath, "utf8") : "";
    const currentMd = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, "utf8") : "";
    const stale = [];
    if (currentDisposition !== expectedDisposition) stale.push("docs/operation-dispositions.json");
    if (currentJson !== expectedJson) stale.push("docs/operation-parity.json");
    if (currentMd !== expectedMd) stale.push("docs/operation-parity.md");
    if (stale.length > 0) {
        console.error(`Operation parity drift: ${stale.join(", ")}. Run make operation-parity.`);
        process.exit(1);
    }
    console.log("operation parity is current");
    process.exit(0);
}

process.stdout.write(expectedJson);
