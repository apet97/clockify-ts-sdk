#!/usr/bin/env node
// check-developer-environment: validates the developer environment contract
// against the expected shape of repo-doctor output (Node floor, package-local
// manifests, Fern pins, generated directories, GOCLMCP sibling presence).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReport } from "./repo-doctor.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(
    fs.readFileSync(path.join(root, "docs", "developer-environment-contract.json"), "utf8"),
);
const failures = [];

function fail(id, message) {
    failures.push(`${id}: ${message}`);
}

function environmentRelativePath(label, relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
        fail(label, "must be a non-empty string");
        return null;
    }
    const normalized = path.normalize(relativePath);
    if (path.isAbsolute(relativePath) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
        fail(label, "must be a repo-relative path without parent traversal");
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

function assertUnique(label, values) {
    const seen = new Set();
    for (const value of values ?? []) {
        if (seen.has(value)) fail(label, `duplicate ${value}`);
        seen.add(value);
    }
}

function readRelative(relativePath, label = relativePath) {
    const safePath = environmentRelativePath(label, relativePath);
    if (safePath == null) return "";
    const absolutePath = path.join(root, safePath);
    if (!fs.existsSync(absolutePath)) {
        fail(safePath, "missing");
        return "";
    }
    return fs.readFileSync(absolutePath, "utf8");
}

function checkText(relativePath, markers, forbiddenMarkers = []) {
    const text = readRelative(relativePath);
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) fail(relativePath, `missing marker ${JSON.stringify(marker)}`);
    }
    for (const marker of forbiddenMarkers ?? []) {
        if (text.includes(marker)) fail(relativePath, `contains forbidden marker ${marker}`);
    }
    return text;
}

function assertFalseFields(value, fields, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        fail(label, "is not an object");
        return;
    }
    for (const field of fields ?? []) {
        if (value[field] !== false) fail(label, `${field} must be false`);
    }
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);

    environmentRelativePath("policyDocument.path", contract.policyDocument?.path);
    const policyMarkers = assertStringArray("policyDocument.mustContain", contract.policyDocument?.mustContain, {
        allowEmpty: false,
    });
    assertUnique("policyDocument.mustContain", policyMarkers);
    assertUnique(
        "policyDocument.forbiddenMarkers",
        assertStringArray("policyDocument.forbiddenMarkers", contract.policyDocument?.forbiddenMarkers ?? []),
    );

    const forbiddenFiles = assertStringArray("root.forbiddenFiles", contract.root?.forbiddenFiles, {
        allowEmpty: false,
    });
    assertUnique("root.forbiddenFiles", forbiddenFiles);
    for (const [index, forbiddenFile] of forbiddenFiles.entries()) {
        environmentRelativePath(`root.forbiddenFiles[${index}]`, forbiddenFile);
    }

    if (contract.repoDoctor == null || typeof contract.repoDoctor !== "object" || Array.isArray(contract.repoDoctor)) {
        fail("repoDoctor", "must be an object");
    } else {
        environmentRelativePath("repoDoctor.path", contract.repoDoctor.path);
        assertNonEmptyString("repoDoctor.makeTarget", contract.repoDoctor.makeTarget);
        const markers = assertStringArray("repoDoctor.mustContain", contract.repoDoctor.mustContain, {
            allowEmpty: false,
        });
        assertUnique("repoDoctor.mustContain", markers);
        const generatedReport = contract.repoDoctor.generatedReport ?? {};
        if (generatedReport == null || typeof generatedReport !== "object" || Array.isArray(generatedReport)) {
            fail("repoDoctor.generatedReport", "must be an object");
        } else {
            assertNonEmptyString("repoDoctor.generatedReport.network", generatedReport.network);
            assertUnique(
                "repoDoctor.generatedReport.environmentShapeFalseFields",
                assertStringArray(
                    "repoDoctor.generatedReport.environmentShapeFalseFields",
                    generatedReport.environmentShapeFalseFields,
                    { allowEmpty: false },
                ),
            );
            assertUnique(
                "repoDoctor.generatedReport.requiredCheckIds",
                assertStringArray("repoDoctor.generatedReport.requiredCheckIds", generatedReport.requiredCheckIds, {
                    allowEmpty: false,
                }),
            );
        }
    }

    assertNonEmptyArray("packages", contract.packages);
    assertUnique(
        "packages.id",
        (contract.packages ?? []).map((pkg) => pkg?.id).filter((id) => typeof id === "string"),
    );
    for (const [index, pkg] of (contract.packages ?? []).entries()) {
        const label = pkg?.id ?? `packages[${index}]`;
        if (pkg == null || typeof pkg !== "object" || Array.isArray(pkg)) {
            fail(label, "package contract must be an object");
            continue;
        }
        assertNonEmptyString(`${label}.id`, pkg.id);
        environmentRelativePath(`${label}.manifest`, pkg.manifest);
        environmentRelativePath(`${label}.lockfile`, pkg.lockfile);
        assertNonEmptyString(`${label}.engine`, pkg.engine);
        assertUnique(
            `${label}.requiredScripts`,
            assertStringArray(`${label}.requiredScripts`, pkg.requiredScripts, { allowEmpty: false }),
        );
        if (
            pkg.requiredScriptValues == null ||
            typeof pkg.requiredScriptValues !== "object" ||
            Array.isArray(pkg.requiredScriptValues)
        ) {
            fail(label, "requiredScriptValues must be an object");
        } else {
            for (const [script, expectedCommand] of Object.entries(pkg.requiredScriptValues)) {
                assertNonEmptyString(`${label}.requiredScriptValues.${script}`, expectedCommand);
            }
        }
    }

    environmentRelativePath("fern.config", contract.fern?.config);
    environmentRelativePath("fern.generators", contract.fern?.generators);
    assertUnique(
        "fern.mustContain",
        assertStringArray("fern.mustContain", contract.fern?.mustContain, { allowEmpty: false }),
    );

    if (!Array.isArray(contract.supportingDocs) || contract.supportingDocs.length === 0) {
        fail("supportingDocs", "must be a non-empty array");
    }
    assertUnique(
        "supportingDocs.path",
        (contract.supportingDocs ?? []).map((doc) => doc?.path).filter((docPath) => typeof docPath === "string"),
    );
    for (const [index, doc] of (contract.supportingDocs ?? []).entries()) {
        const label = `supportingDocs[${index}]`;
        if (doc == null || typeof doc !== "object" || Array.isArray(doc)) {
            fail(label, "must be an object");
            continue;
        }
        environmentRelativePath(`${label}.path`, doc.path);
        assertUnique(
            `${label}.mustContain`,
            assertStringArray(`${label}.mustContain`, doc.mustContain, { allowEmpty: false }),
        );
    }

    if (contract.wiring == null || typeof contract.wiring !== "object" || Array.isArray(contract.wiring)) {
        fail("wiring", "must be an object");
    } else {
        assertNonEmptyString("wiring.makeTarget", contract.wiring.makeTarget);
        assertNonEmptyString("wiring.checker", contract.wiring.checker);
        assertNonEmptyString("wiring.enterpriseAuditId", contract.wiring.enterpriseAuditId);
        if (contract.wiring.makeTarget !== "developer-environment") {
            fail("wiring.makeTarget", "must be developer-environment");
        }
        if (contract.wiring.checker !== "scripts/check-developer-environment.mjs") {
            fail("wiring.checker", "must be scripts/check-developer-environment.mjs");
        }
    }
}

function failIfInvalidContractShape() {
    if (failures.length === 0) return;
    console.error("developer environment contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

validateContractShape();
failIfInvalidContractShape();

checkText(
    contract.policyDocument.path,
    contract.policyDocument.mustContain,
    contract.policyDocument.forbiddenMarkers,
);

for (const forbidden of contract.root?.forbiddenFiles ?? []) {
    if (fs.existsSync(path.join(root, forbidden))) fail("root", `${forbidden} must not exist in this non-workspace repo`);
}

if (contract.repoDoctor) {
    const doctor = checkText(contract.repoDoctor.path, contract.repoDoctor.mustContain);
    if (!doctor.includes("Does not run git, npm, Docker, Fern, tests, builds, or Clockify API calls")) {
        fail(contract.repoDoctor.path, "missing no-side-effect statement");
    }
    const report = await buildReport();
    if (report.repo?.network !== contract.repoDoctor.generatedReport?.network) {
        fail(contract.repoDoctor.path, `generated report network must be ${contract.repoDoctor.generatedReport?.network}`);
    }
    if (!Array.isArray(report.repo?.commandsExecuted) || report.repo.commandsExecuted.length !== 0) {
        fail(contract.repoDoctor.path, "generated report commandsExecuted must be an empty array");
    }
    assertFalseFields(
        report.environmentShape,
        contract.repoDoctor.generatedReport?.environmentShapeFalseFields ?? [],
        `${contract.repoDoctor.path} generated environmentShape`,
    );
    const requiredCheckIds = new Set(contract.repoDoctor.generatedReport?.requiredCheckIds ?? []);
    const actualCheckIds = new Set((report.checks ?? []).map((entry) => entry.id));
    for (const id of requiredCheckIds) {
        if (!actualCheckIds.has(id)) fail(contract.repoDoctor.path, `generated report missing check ${id}`);
    }
}

for (const pkg of contract.packages ?? []) {
    const manifest = JSON.parse(readRelative(pkg.manifest));
    if (!fs.existsSync(path.join(root, pkg.lockfile))) fail(pkg.id, `${pkg.lockfile} is missing`);
    if (manifest.engines?.node !== pkg.engine) {
        fail(pkg.id, `expected engines.node ${pkg.engine}, got ${manifest.engines?.node}`);
    }
    for (const script of pkg.requiredScripts ?? []) {
        if (typeof manifest.scripts?.[script] !== "string") fail(pkg.id, `missing script ${script}`);
    }
    for (const [script, expectedCommand] of Object.entries(pkg.requiredScriptValues ?? {})) {
        const actualCommand = manifest.scripts?.[script];
        if (actualCommand !== expectedCommand) {
            fail(pkg.id, `script ${script} must be ${JSON.stringify(expectedCommand)}, got ${JSON.stringify(actualCommand)}`);
        }
    }
}

const fernText = `${readRelative(contract.fern.config)}\n${readRelative(contract.fern.generators)}`;
for (const marker of contract.fern.mustContain ?? []) {
    if (!fernText.includes(marker)) fail("fern", `missing marker ${JSON.stringify(marker)}`);
}

for (const doc of contract.supportingDocs ?? []) {
    checkText(doc.path, doc.mustContain);
}

const makefile = readRelative("Makefile");
if (!makefile.includes("developer-environment:")) fail("Makefile", "missing developer-environment target");
if (contract.repoDoctor?.makeTarget && !makefile.includes(`${contract.repoDoctor.makeTarget}:`)) {
    fail("Makefile", `missing ${contract.repoDoctor.makeTarget} target`);
}

const docsIndex = readRelative("docs/README.md");
for (const requiredDoc of ["developer-environment-policy.md", "developer-environment-contract.json"]) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail("docs/README.md", `missing ${requiredDoc}`);
}

if (failures.length > 0) {
    console.error("developer environment contract failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("developer environment contract passed");
