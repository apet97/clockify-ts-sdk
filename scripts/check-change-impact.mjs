#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { buildPlan } from "./change-impact-plan.mjs";

const root = process.cwd();
let failures = [];
const contract = JSON.parse(await readRel("docs/change-impact-contract.json", "contractPath"));

async function readRel(relPath, label = relPath) {
    const safePath = changeImpactFilePath(label, relPath);
    if (safePath == null) return "";
    return readFile(path.join(root, safePath), "utf8");
}

async function existsRel(relPath, label = relPath) {
    const safePath = changeImpactFilePath(label, relPath);
    if (safePath == null) return false;
    try {
        await stat(path.join(root, safePath));
        return true;
    } catch {
        return false;
    }
}

function fail(id, message) {
    failures.push(`${id}: ${message}`);
}

function changeImpactFilePath(label, relPath) {
    if (typeof relPath !== "string" || relPath.trim().length === 0) {
        fail(label, "must be a non-empty string");
        return null;
    }
    const normalized = path.normalize(relPath);
    if (path.isAbsolute(relPath) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
        fail(label, "must be a repo-relative file path without parent traversal");
        return null;
    }
    return normalized;
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        fail(label, "must be a non-empty string");
    }
}

function assertNonEmptyArray(label, values) {
    if (!Array.isArray(values) || values.length === 0) {
        fail(label, "must be a non-empty array");
    }
}

function assertStringArray(label, values, { allowEmpty = true } = {}) {
    if (!Array.isArray(values)) {
        fail(label, "must be an array");
        return [];
    }
    if (!allowEmpty && values.length === 0) {
        fail(label, "must be a non-empty array");
    }
    for (const value of values) {
        if (typeof value !== "string" || value.trim().length === 0) {
            fail(label, "contains non-string or empty entry");
        }
    }
    return values.filter((value) => typeof value === "string" && value.trim().length > 0);
}

function includesAll(text, markers, label) {
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) failures.push(`${label} missing marker: ${marker}`);
    }
}

function assertExactFields(plan, fields, label) {
    for (const [field, expected] of Object.entries(fields ?? {})) {
        const actual = plan[field];
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            fail(label, `${field} expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
        }
    }
}

function assertScopeIds(scopes, ids, label) {
    const actual = new Set((scopes ?? []).map((scope) => scope.id));
    for (const id of ids ?? []) {
        if (!actual.has(id)) fail(label, `missing scope ${id}`);
    }
}

function assertScopeFields(scopes, fields, label) {
    for (const scope of scopes ?? []) {
        for (const field of fields ?? []) {
            if (typeof scope[field] === "boolean") continue;
            if (typeof scope[field] === "string") {
                if (scope[field].trim().length === 0) fail(label, `${scope.id}.${field} must be non-empty`);
                continue;
            }
            if (!Array.isArray(scope[field]) || scope[field].length === 0) {
                fail(label, `${scope.id}.${field} must be a non-empty array`);
            }
        }
    }
}

function assertIncludesAll(actualItems, expectedItems, label) {
    const actual = new Set(actualItems ?? []);
    for (const expected of expectedItems ?? []) {
        if (!actual.has(expected)) fail(label, `missing ${expected}`);
    }
}

function assertUnique(items, label) {
    const seen = new Set();
    for (const item of items ?? []) {
        if (seen.has(item)) fail(label, `duplicate ${item}`);
        seen.add(item);
    }
}

function validateGeneratedPlanContract() {
    const generatedPlan = contract.planGenerator?.generatedPlan;
    if (generatedPlan == null || typeof generatedPlan !== "object" || Array.isArray(generatedPlan)) {
        fail("planGenerator.generatedPlan", "must be an object");
        return;
    }
    if (
        generatedPlan.exactFields == null ||
        typeof generatedPlan.exactFields !== "object" ||
        Array.isArray(generatedPlan.exactFields)
    ) {
        fail("planGenerator.generatedPlan.exactFields", "must be an object");
    }
    for (const field of ["requiredMatchedScopeIds", "requiredScopeFields"]) {
        const values = assertStringArray(`planGenerator.generatedPlan.${field}`, generatedPlan[field], {
            allowEmpty: false,
        });
        assertUnique(values, `planGenerator.generatedPlan.${field}`);
    }
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);

    if (contract.wiring == null || typeof contract.wiring !== "object" || Array.isArray(contract.wiring)) {
        fail("wiring", "must be an object");
    } else {
        if (contract.wiring.makeTarget !== "change-impact") {
            fail("wiring.makeTarget", `must be change-impact, got ${contract.wiring.makeTarget ?? "(missing)"}`);
        }
        if (contract.wiring.enterpriseAuditId !== "change-impact") {
            fail("wiring.enterpriseAuditId", `must be change-impact, got ${contract.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        const checker = changeImpactFilePath("wiring.checker", contract.wiring.checker);
        if (checker !== "scripts/check-change-impact.mjs") {
            fail("wiring.checker", `must be scripts/check-change-impact.mjs, got ${contract.wiring.checker ?? "(missing)"}`);
        }
    }

    assertUnique(
        assertStringArray("allowedNonMakeTargets", contract.allowedNonMakeTargets, { allowEmpty: false }),
        "allowedNonMakeTargets",
    );

    changeImpactFilePath("policyDocument.path", contract.policyDocument?.path);
    assertUnique(
        assertStringArray("policyDocument.contains", contract.policyDocument?.contains, { allowEmpty: false }),
        "policyDocument.contains",
    );
    assertUnique(
        assertStringArray("policyDocument.forbiddenMarkers", contract.policyDocument?.forbiddenMarkers ?? []),
        "policyDocument.forbiddenMarkers",
    );

    if (contract.planGenerator == null || typeof contract.planGenerator !== "object" || Array.isArray(contract.planGenerator)) {
        fail("planGenerator", "must be an object");
    } else {
        changeImpactFilePath("planGenerator.path", contract.planGenerator.path);
        assertNonEmptyString("planGenerator.makeTarget", contract.planGenerator.makeTarget);
        assertUnique(
            assertStringArray("planGenerator.contains", contract.planGenerator.contains, { allowEmpty: false }),
            "planGenerator.contains",
        );
        validateGeneratedPlanContract();
    }

    assertUnique(
        assertStringArray("requiredScopeIds", contract.requiredScopeIds, { allowEmpty: false }),
        "requiredScopeIds",
    );
    assertUnique(
        assertStringArray("matrixInvariants", contract.matrixInvariants, { allowEmpty: false }),
        "matrixInvariants",
    );

    assertNonEmptyArray("pathProbeExpectations", contract.pathProbeExpectations);
    for (const [index, probe] of (contract.pathProbeExpectations ?? []).entries()) {
        const label = `pathProbeExpectations[${index}]`;
        if (probe == null || typeof probe !== "object" || Array.isArray(probe)) {
            fail(label, "must be an object");
            continue;
        }
        assertNonEmptyString(`${label}.changedPath`, probe.changedPath);
        assertUnique(
            assertStringArray(`${label}.requiredScopeIds`, probe.requiredScopeIds, { allowEmpty: false }),
            `${label}.requiredScopeIds`,
        );
    }

    assertNonEmptyArray("pathProbeCoverageExpectations", contract.pathProbeCoverageExpectations);
    for (const [index, expectation] of (contract.pathProbeCoverageExpectations ?? []).entries()) {
        const label = `pathProbeCoverageExpectations[${index}]`;
        if (expectation == null || typeof expectation !== "object" || Array.isArray(expectation)) {
            fail(label, "must be an object");
            continue;
        }
        assertNonEmptyString(`${label}.scopeId`, expectation.scopeId);
    }

    assertNonEmptyArray("scopeRequirementExpectations", contract.scopeRequirementExpectations);
    for (const [index, expectation] of (contract.scopeRequirementExpectations ?? []).entries()) {
        const label = `scopeRequirementExpectations[${index}]`;
        if (expectation == null || typeof expectation !== "object" || Array.isArray(expectation)) {
            fail(label, "must be an object");
            continue;
        }
        assertNonEmptyString(`${label}.scopeId`, expectation.scopeId);
        for (const field of ["requiredTargets", "requiredDocs", "changedPaths"]) {
            const values = assertStringArray(`${label}.${field}`, expectation[field], { allowEmpty: false });
            assertUnique(values, `${label}.${field}`);
            if (field === "requiredDocs") {
                for (const [docIndex, docPath] of values.entries()) {
                    changeImpactFilePath(`${label}.${field}[${docIndex}]`, docPath);
                }
            }
        }
    }

    assertNonEmptyArray("scopes", contract.scopes);
    for (const [index, scope] of (contract.scopes ?? []).entries()) {
        const label = scope?.id ?? `scopes[${index}]`;
        if (scope == null || typeof scope !== "object" || Array.isArray(scope)) {
            fail(label, "scope must be an object");
            continue;
        }
        assertNonEmptyString(`${label}.id`, scope.id);
        assertNonEmptyString(`${label}.notes`, scope.notes);
        if (typeof scope.changelogRequired !== "boolean") {
            fail(label, "changelogRequired must be a boolean");
        }
        for (const field of ["changedPaths", "requiredTargets", "requiredDocs"]) {
            const values = assertStringArray(`${label}.${field}`, scope[field], { allowEmpty: false });
            assertUnique(values, `${label}.${field}`);
            if (field === "requiredDocs") {
                for (const [docIndex, docPath] of values.entries()) {
                    changeImpactFilePath(`${label}.${field}[${docIndex}]`, docPath);
                }
            }
        }
    }
}

validateContractShape();

if (failures.length > 0) {
    console.error("Change impact contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

failures = [];
const makefile = await readRel("Makefile");
const docsIndex = await readRel("docs/README.md");
const qualityGates = await readRel("docs/quality-gates.md");

const policy = await readRel(contract.policyDocument?.path, "policyDocument.path");
includesAll(policy, contract.policyDocument?.contains ?? [], contract.policyDocument?.path ?? "policyDocument.path");
for (const marker of contract.policyDocument?.forbiddenMarkers ?? []) {
    if (policy.includes(marker)) {
        failures.push(`${contract.policyDocument?.path ?? "policyDocument.path"} contains forbidden marker: ${marker}`);
    }
}

if (contract.planGenerator) {
    if (!(await existsRel(contract.planGenerator.path))) {
        fail("planGenerator", `missing ${contract.planGenerator.path}`);
    } else {
        includesAll(await readRel(contract.planGenerator.path), contract.planGenerator.contains, contract.planGenerator.path);
    }
    const generatedPlan = buildPlan(contract, { scope: null, changedPath: null });
    const generatedPlanContract = contract.planGenerator.generatedPlan ?? {};
    assertExactFields(generatedPlan, generatedPlanContract.exactFields, "planGenerator.generatedPlan");
    assertScopeIds(generatedPlan.matchedScopes, generatedPlanContract.requiredMatchedScopeIds, "planGenerator.generatedPlan");
    assertScopeFields(
        generatedPlan.matchedScopes,
        generatedPlanContract.requiredScopeFields,
        "planGenerator.generatedPlan",
    );
}

const matrixInvariants = new Set(contract.matrixInvariants ?? []);
for (const invariant of [
    "unique-scope-ids",
    "unique-required-scope-ids",
    "unique-path-probe-changed-paths",
    "unique-path-probe-coverage-scope-ids",
    "unique-scope-requirement-scope-ids",
    "unique-scope-changed-paths",
    "unique-scope-required-targets",
    "unique-scope-required-docs",
]) {
    if (!matrixInvariants.has(invariant)) fail("matrixInvariants", `missing invariant ${invariant}`);
}
assertUnique((contract.scopes ?? []).map((scope) => scope.id), "scopes.id");
assertUnique(contract.requiredScopeIds, "requiredScopeIds");
assertUnique((contract.pathProbeExpectations ?? []).map((probe) => probe.changedPath), "pathProbeExpectations.changedPath");
assertUnique(
    (contract.pathProbeCoverageExpectations ?? []).map((expectation) => expectation.scopeId),
    "pathProbeCoverageExpectations.scopeId",
);
assertUnique(
    (contract.scopeRequirementExpectations ?? []).map((expectation) => expectation.scopeId),
    "scopeRequirementExpectations.scopeId",
);

assertScopeIds(contract.scopes, contract.requiredScopeIds, "requiredScopeIds");

for (const probe of contract.pathProbeExpectations ?? []) {
    const pathPlan = buildPlan(contract, { scope: null, changedPath: probe.changedPath });
    if (!pathPlan.ok) fail("pathProbeExpectations", `${probe.changedPath} did not produce an ok path plan`);
    assertScopeIds(
        pathPlan.matchedScopes,
        probe.requiredScopeIds,
        `pathProbeExpectations.${probe.changedPath}`,
    );
}

for (const expectation of contract.pathProbeCoverageExpectations ?? []) {
    const scope = (contract.scopes ?? []).find((candidate) => candidate.id === expectation.scopeId);
    if (!scope) {
        fail("pathProbeCoverageExpectations", `missing scope ${expectation.scopeId}`);
        continue;
    }
    for (const changedPath of scope.changedPaths ?? []) {
        const pathPlan = buildPlan(contract, { scope: null, changedPath });
        if (!pathPlan.ok) {
            fail("pathProbeCoverageExpectations", `${changedPath} did not produce an ok path plan`);
        }
        assertScopeIds(
            pathPlan.matchedScopes,
            [expectation.scopeId],
            `pathProbeCoverageExpectations.${expectation.scopeId}.${changedPath}`,
        );
    }
}

for (const expectation of contract.scopeRequirementExpectations ?? []) {
    const scope = (contract.scopes ?? []).find((candidate) => candidate.id === expectation.scopeId);
    if (!scope) {
        fail("scopeRequirementExpectations", `missing scope ${expectation.scopeId}`);
        continue;
    }
    assertIncludesAll(
        scope.requiredTargets,
        expectation.requiredTargets,
        `scopeRequirementExpectations.${expectation.scopeId}.requiredTargets`,
    );
    assertIncludesAll(
        scope.requiredDocs,
        expectation.requiredDocs,
        `scopeRequirementExpectations.${expectation.scopeId}.requiredDocs`,
    );
    assertIncludesAll(
        scope.changedPaths,
        expectation.changedPaths,
        `scopeRequirementExpectations.${expectation.scopeId}.changedPaths`,
    );
}

for (const scope of contract.scopes ?? []) {
    assertUnique(scope.changedPaths, `${scope.id}.changedPaths`);
    assertUnique(scope.requiredTargets, `${scope.id}.requiredTargets`);
    assertUnique(scope.requiredDocs, `${scope.id}.requiredDocs`);

    for (const field of ["id", "changedPaths", "requiredTargets", "requiredDocs", "notes"]) {
        if (scope[field] == null || (Array.isArray(scope[field]) && scope[field].length === 0)) {
            fail(scope.id ?? "scope", `missing ${field}`);
        }
    }

    for (const target of scope.requiredTargets ?? []) {
        if (!makefile.includes(`${target}:`) && !contract.allowedNonMakeTargets.includes(target)) {
            fail(scope.id, `Makefile missing target ${target}`);
        }
    }

    for (const docPath of scope.requiredDocs ?? []) {
        if (!(await existsRel(docPath))) fail(scope.id, `missing required doc ${docPath}`);
    }

    if (scope.changelogRequired && !(scope.requiredTargets ?? []).includes("changelog-drift")) {
        fail(scope.id, "changelogRequired scope must include changelog-drift");
    }
}

if (!makefile.includes("change-impact:")) fail("Makefile", "missing change-impact target");
if (contract.planGenerator?.makeTarget && !makefile.includes(`${contract.planGenerator.makeTarget}:`)) {
    fail("Makefile", `missing ${contract.planGenerator.makeTarget} target`);
}
if (!qualityGates.includes("make change-impact")) fail("docs/quality-gates.md", "missing make change-impact");
if (!docsIndex.includes("./change-impact-policy.md")) fail("docs/README.md", "missing change-impact policy link");
if (!docsIndex.includes("./change-impact-contract.json")) fail("docs/README.md", "missing change-impact contract link");

if (failures.length > 0) {
    console.error("Change impact contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Change impact contract passed (${contract.scopes.length} scopes checked).`);
