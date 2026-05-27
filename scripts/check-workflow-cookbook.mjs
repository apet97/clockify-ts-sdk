#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildPlan } from "./workflow-plan.mjs";

const root = process.cwd();
const contract = JSON.parse(await readRel("docs/workflow-cookbook-contract.json"));
const failures = [];
const shapeFailures = [];

async function readRel(relPath) {
    return readFile(path.join(root, relPath), "utf8");
}

function failShape(message) {
    shapeFailures.push(`contract: ${message}`);
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function assertStringArray(value, field, { allowEmpty = false } = {}) {
    if (!Array.isArray(value)) {
        failShape(`${field} must be an array`);
        return [];
    }

    if (!allowEmpty && value.length === 0) {
        failShape(`${field} must not be empty`);
    }

    const seen = new Set();
    for (const [index, entry] of value.entries()) {
        if (!isNonEmptyString(entry)) {
            failShape(`${field}[${index}] must be a non-empty string`);
            continue;
        }

        if (seen.has(entry)) {
            failShape(`${field} contains duplicate entry ${entry}`);
            continue;
        }

        seen.add(entry);
    }

    return value;
}

function assertSafeRelativePath(value, field) {
    if (!isNonEmptyString(value)) {
        failShape(`${field} must be a non-empty string path`);
        return;
    }

    if (path.isAbsolute(value)) {
        failShape(`${field} must be repo-relative, got ${value}`);
    }

    if (value.includes("\\") || value.includes("//")) {
        failShape(`${field} must use normalized forward-slash paths, got ${value}`);
    }

    if (value.split("/").includes("..")) {
        failShape(`${field} must not escape the repository, got ${value}`);
    }

    if (!/^[A-Za-z0-9._/-]+$/.test(value)) {
        failShape(`${field} contains unsupported path characters, got ${value}`);
    }
}

function assertMarkerObject(value, field) {
    if (!isPlainObject(value)) {
        failShape(`${field} must be an object`);
        return;
    }

    assertSafeRelativePath(value.path, `${field}.path`);
    assertStringArray(value.contains, `${field}.contains`);
}

function assertContractShape(value) {
    if (!isPlainObject(value)) {
        failShape("root must be a JSON object");
        return;
    }

    if (value.schemaVersion !== 1) {
        failShape(`schemaVersion must be 1, got ${value.schemaVersion ?? "(missing)"}`);
    }

    if (!isNonEmptyString(value.purpose)) {
        failShape("purpose must be a non-empty string");
    }

    const invariants = assertStringArray(value.contractInvariants, "contractInvariants");
    for (const requiredInvariant of [
        "safe-workflow-cookbook-paths",
        "typed-cookbook-sections-and-markers",
        "typed-planner-contract",
        "generated-plan-static-no-network",
        "product-surface-workflow-coverage",
        "supporting-docs-marker-contract",
        "makefile-audit-wiring",
    ]) {
        if (!invariants.includes(requiredInvariant)) {
            failShape(`contractInvariants must include ${requiredInvariant}`);
        }
    }

    if (!isPlainObject(value.cookbook)) {
        failShape("cookbook must be an object");
    } else {
        assertSafeRelativePath(value.cookbook.path, "cookbook.path");
        assertStringArray(value.cookbook.requiredSections, "cookbook.requiredSections");
        assertStringArray(value.cookbook.contains, "cookbook.contains");
        assertStringArray(value.cookbook.forbiddenMarkers, "cookbook.forbiddenMarkers");
    }

    if (!isPlainObject(value.planner)) {
        failShape("planner must be an object");
    } else {
        assertSafeRelativePath(value.planner.path, "planner.path");
        if (value.planner.path !== "scripts/workflow-plan.mjs") {
            failShape(`planner.path must be scripts/workflow-plan.mjs, got ${value.planner.path ?? "(missing)"}`);
        }
        if (value.planner.makeTarget !== "workflow-plan") {
            failShape(`planner.makeTarget must be workflow-plan, got ${value.planner.makeTarget ?? "(missing)"}`);
        }
        assertStringArray(value.planner.contains, "planner.contains");

        const generatedPlan = value.planner.generatedPlan;
        if (!isPlainObject(generatedPlan)) {
            failShape("planner.generatedPlan must be an object");
        } else {
            if (!isPlainObject(generatedPlan.exactFields)) {
                failShape("planner.generatedPlan.exactFields must be an object");
            } else {
                const expectedExactFields = {
                    schemaVersion: 1,
                    network: "none",
                    commandsExecuted: [],
                    envValuesCaptured: false,
                    workflow: "all",
                };
                for (const [field, expected] of Object.entries(expectedExactFields)) {
                    if (JSON.stringify(generatedPlan.exactFields[field]) !== JSON.stringify(expected)) {
                        failShape(`planner.generatedPlan.exactFields.${field} must be ${JSON.stringify(expected)}`);
                    }
                }
            }

            const requiredWorkflowIds = assertStringArray(
                generatedPlan.requiredWorkflowIds,
                "planner.generatedPlan.requiredWorkflowIds",
            );
            for (const workflowId of ["first-run-support", "time-tracking", "work-package", "business-workflows", "demo-and-cleanup", "recovery"]) {
                if (!requiredWorkflowIds.includes(workflowId)) {
                    failShape(`planner.generatedPlan.requiredWorkflowIds must include ${workflowId}`);
                }
            }

            const requiredArrayFields = assertStringArray(
                generatedPlan.requiredWorkflowArrayFields,
                "planner.generatedPlan.requiredWorkflowArrayFields",
            );
            for (const field of ["sdk", "cli", "mcp", "safety"]) {
                if (!requiredArrayFields.includes(field)) {
                    failShape(`planner.generatedPlan.requiredWorkflowArrayFields must include ${field}`);
                }
            }
        }
    }

    if (!isPlainObject(value.productSurface)) {
        failShape("productSurface must be an object");
    } else {
        assertSafeRelativePath(value.productSurface.path, "productSurface.path");
        if (value.productSurface.path !== "docs/product-surface.json") {
            failShape(`productSurface.path must be docs/product-surface.json, got ${value.productSurface.path ?? "(missing)"}`);
        }
        assertStringArray(value.productSurface.workflowIds, "productSurface.workflowIds");
        assertStringArray(value.productSurface.requiredMarkers, "productSurface.requiredMarkers");
        assertStringArray(value.productSurface.requiredWorkflowClaimFields, "productSurface.requiredWorkflowClaimFields");
        assertStringArray(value.productSurface.surfaceAvailabilityFields, "productSurface.surfaceAvailabilityFields");
        assertStringArray(value.productSurface.emptySurfaceRequiresIntentionalGap, "productSurface.emptySurfaceRequiresIntentionalGap");
    }

    if (!Array.isArray(value.supportingDocs) || value.supportingDocs.length === 0) {
        failShape("supportingDocs must be a non-empty array");
    } else {
        for (const [index, doc] of value.supportingDocs.entries()) {
            assertMarkerObject(doc, `supportingDocs[${index}]`);
        }
    }

    if (!isPlainObject(value.wiring)) {
        failShape("wiring must be an object");
    } else {
        if (value.wiring.makeTarget !== "workflow-cookbook") {
            failShape(`wiring.makeTarget must be workflow-cookbook, got ${value.wiring.makeTarget ?? "(missing)"}`);
        }
        if (value.wiring.enterpriseAuditId !== "workflow-cookbook") {
            failShape(`wiring.enterpriseAuditId must be workflow-cookbook, got ${value.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        assertSafeRelativePath(value.wiring.checker, "wiring.checker");
        if (value.wiring.checker !== "scripts/check-workflow-cookbook.mjs") {
            failShape(`wiring.checker must be scripts/check-workflow-cookbook.mjs, got ${value.wiring.checker ?? "(missing)"}`);
        }
    }
}

function includesAll(text, markers, label) {
    for (const marker of markers) {
        if (!text.includes(marker)) failures.push(`${label} missing marker: ${marker}`);
    }
}

function assertExactFields(plan, fields, label) {
    for (const [field, expected] of Object.entries(fields ?? {})) {
        const actual = plan[field];
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            failures.push(`${label} ${field} expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
        }
    }
}

function assertWorkflowIds(workflows, ids, label) {
    const actual = new Set((workflows ?? []).map((workflow) => workflow.id));
    for (const id of ids ?? []) {
        if (!actual.has(id)) failures.push(`${label} missing workflow ${id}`);
    }
}

function assertWorkflowFields(workflows, fields, label) {
    for (const workflow of workflows ?? []) {
        for (const field of fields ?? []) {
            if (!Array.isArray(workflow[field]) || workflow[field].length === 0) {
                failures.push(`${label} ${workflow.id}.${field} must be a non-empty array`);
            }
        }
    }
}

function assertProductSurfaceWorkflowClaims(workflows, contractValue, label) {
    for (const workflow of workflows ?? []) {
        for (const field of contractValue.requiredWorkflowClaimFields ?? []) {
            if (field === "surfaceAvailability") {
                if (!isPlainObject(workflow.surfaceAvailability)) {
                    failures.push(`${label} ${workflow.id}.surfaceAvailability must be an object`);
                    continue;
                }
                for (const surface of contractValue.surfaceAvailabilityFields ?? []) {
                    if (!isNonEmptyString(workflow.surfaceAvailability[surface])) {
                        failures.push(`${label} ${workflow.id}.surfaceAvailability.${surface} must be a non-empty string`);
                    }
                }
                continue;
            }
            if (field === "proofMode") {
                if (!isNonEmptyString(workflow.proofMode)) {
                    failures.push(`${label} ${workflow.id}.proofMode must be a non-empty string`);
                }
                continue;
            }
            if (!Array.isArray(workflow[field])) {
                failures.push(`${label} ${workflow.id}.${field} must be an array`);
                continue;
            }
            if (field === "recovery" && workflow[field].length === 0) {
                failures.push(`${label} ${workflow.id}.${field} must be a non-empty array`);
            }
        }

        for (const surface of contractValue.emptySurfaceRequiresIntentionalGap ?? []) {
            if (Array.isArray(workflow[surface]) && workflow[surface].length === 0) {
                if (!Array.isArray(workflow.intentionalGaps) || workflow.intentionalGaps.length === 0) {
                    failures.push(`${label} ${workflow.id}.${surface} is empty and must have an intentionalGaps entry`);
                }
            }
        }
    }
}

assertContractShape(contract);

if (shapeFailures.length > 0) {
    console.error("Workflow cookbook contract shape failed:");
    for (const failure of shapeFailures) console.error(`- ${failure}`);
    process.exit(1);
}

const cookbook = await readRel(contract.cookbook.path);
for (const section of contract.cookbook.requiredSections ?? []) {
    if (!cookbook.includes(`## ${section}`)) failures.push(`${contract.cookbook.path} missing section: ${section}`);
}
includesAll(cookbook, contract.cookbook.contains, contract.cookbook.path);
for (const marker of contract.cookbook.forbiddenMarkers ?? []) {
    if (cookbook.includes(marker)) failures.push(`${contract.cookbook.path} contains forbidden marker: ${marker}`);
}

if (contract.planner) {
    const planner = await readRel(contract.planner.path);
    includesAll(planner, contract.planner.contains, contract.planner.path);
    const makefile = await readRel("Makefile");
    if (!makefile.includes(`${contract.wiring.makeTarget}:`)) {
        failures.push(`Makefile missing target: ${contract.wiring.makeTarget}`);
    }
    if (!makefile.includes(`${contract.planner.makeTarget}:`)) {
        failures.push(`Makefile missing target: ${contract.planner.makeTarget}`);
    }
    const generatedPlan = buildPlan({ workflow: "all" });
    const generatedPlanContract = contract.planner.generatedPlan ?? {};
    assertExactFields(generatedPlan, generatedPlanContract.exactFields, "planner.generatedPlan");
    assertWorkflowIds(generatedPlan.workflows, generatedPlanContract.requiredWorkflowIds, "planner.generatedPlan");
    assertWorkflowFields(generatedPlan.workflows, generatedPlanContract.requiredWorkflowArrayFields, "planner.generatedPlan");
}

const productSurface = await readRel(contract.productSurface.path);
const surface = JSON.parse(productSurface);
const workflowIds = new Set((surface.workflows ?? []).map((workflow) => workflow.id));
for (const workflowId of contract.productSurface.workflowIds ?? []) {
    if (!workflowIds.has(workflowId)) failures.push(`${contract.productSurface.path} missing workflow id: ${workflowId}`);
}
includesAll(productSurface, contract.productSurface.requiredMarkers, contract.productSurface.path);
assertProductSurfaceWorkflowClaims(surface.workflows, contract.productSurface, contract.productSurface.path);

for (const doc of contract.supportingDocs ?? []) {
    const text = await readRel(doc.path);
    includesAll(text, doc.contains, doc.path);
}

if (failures.length > 0) {
    console.error("Workflow cookbook contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Workflow cookbook contract passed (${contract.cookbook.requiredSections.length} sections checked).`);
