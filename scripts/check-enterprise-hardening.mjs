#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const auditPath = path.join(root, "docs", "enterprise-hardening-audit.json");
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const failures = [];

function fail(id, message) {
    failures.push(`${id}: ${message}`);
}

function auditRelativePath(label, relativePath) {
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

function evidenceMarkerContract(evidence) {
    if (evidence?.contains != null) {
        return { field: "contains", values: evidence.contains };
    }
    return { field: "markers", values: evidence?.markers };
}

function assertUnique(label, values) {
    const seen = new Set();
    for (const value of values) {
        if (seen.has(value)) fail(label, `contains duplicate entry: ${value}`);
        seen.add(value);
    }
}

if (audit.schemaVersion !== 1) {
    fail("audit.schemaVersion", "must be 1");
}
assertNonEmptyString("audit.purpose", audit.purpose);

if (!Array.isArray(audit.requirements) || audit.requirements.length === 0) {
    fail("audit.requirements", "must be a non-empty array");
}

const requirements = Array.isArray(audit.requirements) ? audit.requirements : [];
assertUnique(
    "audit.requirements[].id",
    requirements.map((requirement) => requirement?.id).filter((id) => typeof id === "string" && id.length > 0),
);


if (audit.wiring == null || typeof audit.wiring !== "object" || Array.isArray(audit.wiring)) {
    fail("audit.wiring", "must be an object");
} else {
    assertNonEmptyString("audit.wiring.makeTarget", audit.wiring.makeTarget);
    assertNonEmptyString("audit.wiring.checker", audit.wiring.checker);
    if (audit.wiring.makeTarget !== "enterprise-audit") {
        fail("audit.wiring.makeTarget", "must be enterprise-audit");
    }
    if (audit.wiring.checker !== "scripts/check-enterprise-hardening.mjs") {
        fail("audit.wiring.checker", "must be scripts/check-enterprise-hardening.mjs");
    }
}

for (const [requirementIndex, requirement] of requirements.entries()) {
    const requirementLabel = `audit.requirements[${requirementIndex}]`;
    if (requirement == null || typeof requirement !== "object" || Array.isArray(requirement)) {
        fail(requirementLabel, "must be an object");
        continue;
    }
    assertNonEmptyString(`${requirementLabel}.id`, requirement.id);
    assertNonEmptyString(`${requirement.id ?? requirementLabel}.requirement`, requirement.requirement);
    if (!Array.isArray(requirement.evidence) || requirement.evidence.length === 0) {
        fail(requirement.id ?? requirementLabel, "evidence must be a non-empty array");
        continue;
    }
    assertUnique(
        `${requirement.id ?? requirementLabel}.evidence[].path`,
        requirement.evidence
            .map((evidence) => evidence?.path)
            .filter((evidencePath) => typeof evidencePath === "string" && evidencePath.length > 0),
    );
    for (const [evidenceIndex, evidence] of requirement.evidence.entries()) {
        const evidenceLabel = `${requirement.id ?? requirementLabel}.evidence[${evidenceIndex}]`;
        if (evidence == null || typeof evidence !== "object" || Array.isArray(evidence)) {
            fail(evidenceLabel, "must be an object");
            continue;
        }
        auditRelativePath(`${evidenceLabel}.path`, evidence.path);
        const markerContract = evidenceMarkerContract(evidence);
        const markers = assertStringArray(`${evidenceLabel}.${markerContract.field}`, markerContract.values, {
            allowEmpty: false,
        });
        assertUnique(`${evidenceLabel}.${markerContract.field}`, markers);
    }
}

if (failures.length > 0) {
    console.error("enterprise hardening audit shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

for (const [requirementIndex, requirement] of requirements.entries()) {
    const requirementLabel = `audit.requirements[${requirementIndex}]`;
    if (!requirement.id) {
        fail(requirementLabel, "requirement is missing id");
        continue;
    }
    assertNonEmptyString(`${requirement.id}.requirement`, requirement.requirement);

    if (!Array.isArray(requirement.evidence) || requirement.evidence.length === 0) {
        fail(requirement.id, "no evidence entries");
        continue;
    }
    assertUnique(
        `${requirement.id}.evidence[].path`,
        requirement.evidence
            .map((evidence) => evidence?.path)
            .filter((evidencePath) => typeof evidencePath === "string" && evidencePath.length > 0),
    );

    // The draft/final-receipt branch that used to sit here was removed on
    // 2026-07-27. It was the last live remnant of the final-readiness receipt
    // family retired 2026-05-28, and it was a latent false-green: its
    // `!temporaryExists && finalReceiptExists` arm `continue`d past the entire
    // evidence-verification loop below, so any requirement that grew the pair
    // would have had ALL of its evidence silently unchecked once a receipt
    // landed. Zero of the 93 requirements carried the keys, so deleting it
    // changes nothing today and makes the gate strictly stricter tomorrow.
    // scripts/check-enterprise-hardening.retired-receipts.test.mjs fails if the
    // concept returns.
    for (const [evidenceIndex, evidence] of requirement.evidence.entries()) {
        const relativePath = auditRelativePath(`${requirement.id}.evidence[${evidenceIndex}].path`, evidence.path);
        const markerContract = evidenceMarkerContract(evidence);
        const markers = assertStringArray(`${requirement.id}.evidence[${evidenceIndex}].${markerContract.field}`, markerContract.values, {
            allowEmpty: false,
        });
        assertUnique(`${requirement.id}.evidence[${evidenceIndex}].${markerContract.field}`, markers);
        if (relativePath == null) {
            continue;
        }

        const absolutePath = path.join(root, relativePath);
        if (!fs.existsSync(absolutePath)) {
            fail(requirement.id, `${relativePath} does not exist`);
            continue;
        }

        const content = fs.readFileSync(absolutePath, "utf8");
        for (const marker of markers) {
            if (!content.includes(marker)) {
                fail(requirement.id, `${relativePath} missing marker ${JSON.stringify(marker)}`);
            }
        }
    }
}

if (failures.length > 0) {
    console.error("enterprise hardening audit failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`enterprise hardening audit passed (${audit.requirements.length} requirements)`);
