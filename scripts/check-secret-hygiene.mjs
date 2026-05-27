#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(fs.readFileSync(path.join(root, "docs", "secret-hygiene.json"), "utf8"));
const failures = [];

function fail(message) {
    failures.push(message);
}

function secretRelativePath(label, relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
        fail(`${label}: must be a non-empty string`);
        return null;
    }
    const normalized = path.normalize(relativePath);
    if (path.isAbsolute(relativePath) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
        fail(`${label}: must be a repo-relative path without parent traversal`);
        return null;
    }
    return normalized;
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        fail(`${label}: must be a non-empty string`);
    }
}

function assertNonEmptyArray(label, values) {
    if (!Array.isArray(values) || values.length === 0) {
        fail(`${label}: must be a non-empty array`);
    }
}

function assertStringArray(label, values, { allowEmpty = true } = {}) {
    if (!Array.isArray(values)) {
        fail(`${label}: must be an array`);
        return [];
    }
    if (!allowEmpty && values.length === 0) {
        fail(`${label}: must be a non-empty array`);
    }
    for (const value of values) {
        if (typeof value !== "string" || value.trim().length === 0) {
            fail(`${label}: contains non-string or empty entry`);
        }
    }
    return values.filter((value) => typeof value === "string" && value.trim().length > 0);
}

function assertUnique(label, values) {
    const seen = new Set();
    for (const value of values ?? []) {
        if (seen.has(value)) fail(`${label}: duplicate ${value}`);
        seen.add(value);
    }
}

function validatePolicyShape() {
    if (policy.schemaVersion !== 1) fail("schemaVersion: must be 1");
    assertNonEmptyString("purpose", policy.purpose);
    const invariants = assertStringArray("contractInvariants", policy.contractInvariants, {
        allowEmpty: false,
    });
    assertUnique("contractInvariants", invariants);
    for (const invariant of [
        "valid-schema-version",
        "valid-purpose",
        "typed-scan-extensions",
        "safe-secret-hygiene-paths",
        "typed-ignore-lists",
        "typed-secret-patterns",
        "valid-secret-pattern-regexes",
        "typed-required-doc-markers",
        "makefile-audit-wiring",
    ]) {
        if (!invariants.includes(invariant)) fail(`contractInvariants: missing invariant ${invariant}`);
    }

    const scanExtensions = assertStringArray("scanExtensions", policy.scanExtensions, { allowEmpty: false });
    assertUnique("scanExtensions", scanExtensions);
    for (const extension of scanExtensions) {
        if (!extension.startsWith(".")) fail(`scanExtensions: extension must start with dot: ${extension}`);
    }

    for (const [field, values] of Object.entries({
        ignoredDirectories: policy.ignoredDirectories,
        ignoredFiles: policy.ignoredFiles,
    })) {
        const entries = assertStringArray(field, values ?? []);
        assertUnique(field, entries);
        entries.forEach((entry, index) => secretRelativePath(`${field}[${index}]`, entry));
    }

    assertNonEmptyArray("patterns", policy.patterns);
    assertUnique(
        "patterns.id",
        (policy.patterns ?? []).map((pattern) => pattern?.id).filter((id) => typeof id === "string"),
    );
    for (const [index, pattern] of (policy.patterns ?? []).entries()) {
        const label = `patterns[${index}]`;
        if (pattern == null || typeof pattern !== "object" || Array.isArray(pattern)) {
            fail(`${label}: must be an object`);
            continue;
        }
        assertNonEmptyString(`${label}.id`, pattern.id);
        assertNonEmptyString(`${label}.regex`, pattern.regex);
        assertNonEmptyString(`${label}.message`, pattern.message);
        if (typeof pattern.regex === "string") {
            try {
                new RegExp(pattern.regex, "g");
            } catch {
                fail(`${label}.regex: invalid regex`);
            }
        }
    }

    assertNonEmptyArray("requiredDocs", policy.requiredDocs);
    assertUnique(
        "requiredDocs.path",
        (policy.requiredDocs ?? []).map((doc) => doc?.path).filter((docPath) => typeof docPath === "string"),
    );
    for (const [index, doc] of (policy.requiredDocs ?? []).entries()) {
        const label = `requiredDocs[${index}]`;
        if (doc == null || typeof doc !== "object" || Array.isArray(doc)) {
            fail(`${label}: must be an object`);
            continue;
        }
        secretRelativePath(`${label}.path`, doc.path);
        assertUnique(
            `${label}.contains`,
            assertStringArray(`${label}.contains`, doc.contains, { allowEmpty: false }),
            );
    }

    if (policy.wiring == null || typeof policy.wiring !== "object" || Array.isArray(policy.wiring)) {
        fail("wiring: must be an object");
    } else {
        if (policy.wiring.makeTarget !== "secret-hygiene") {
            fail(`wiring.makeTarget: must be secret-hygiene, got ${policy.wiring.makeTarget ?? "(missing)"}`);
        }
        if (policy.wiring.enterpriseAuditId !== "secret-hygiene") {
            fail(`wiring.enterpriseAuditId: must be secret-hygiene, got ${policy.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        const checker = secretRelativePath("wiring.checker", policy.wiring.checker);
        if (checker !== "scripts/check-secret-hygiene.mjs") {
            fail(`wiring.checker: must be scripts/check-secret-hygiene.mjs, got ${policy.wiring.checker ?? "(missing)"}`);
        }
    }
}

validatePolicyShape();

if (failures.length > 0) {
    console.error("secret hygiene contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const ignoredDirectories = new Set(policy.ignoredDirectories ?? []);
const ignoredFiles = new Set(policy.ignoredFiles ?? []);
const scanExtensions = new Set(policy.scanExtensions ?? []);
const patterns = (policy.patterns ?? []).map((pattern) => ({
    ...pattern,
    compiled: new RegExp(pattern.regex, "g"),
}));

for (const doc of policy.requiredDocs ?? []) {
    const absolutePath = path.join(root, doc.path);
    if (!fs.existsSync(absolutePath)) {
        fail(`${doc.path} is missing`);
        continue;
    }

    const text = fs.readFileSync(absolutePath, "utf8");
    for (const marker of doc.contains ?? []) {
        if (!text.includes(marker)) fail(`${doc.path} missing marker ${JSON.stringify(marker)}`);
    }
}

for (const file of walk(root)) {
    const relativePath = path.relative(root, file);
    if (ignoredFiles.has(relativePath)) continue;
    if (!scanExtensions.has(path.extname(file))) continue;

    const text = fs.readFileSync(file, "utf8");
    for (const pattern of patterns) {
        pattern.compiled.lastIndex = 0;
        const matches = [...text.matchAll(pattern.compiled)];
        for (const match of matches) {
            const line = lineNumberForIndex(text, match.index ?? 0);
            fail(`${relativePath}:${line}: ${pattern.message} (${pattern.id})`);
        }
    }
}

if (failures.length > 0) {
    console.error("secret hygiene check failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`secret hygiene passed (${patterns.length} patterns)`);

function* walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolutePath = path.join(directory, entry.name);
        const relativePath = path.relative(root, absolutePath);
        if (entry.isDirectory()) {
            if (ignoredDirectories.has(relativePath) || ignoredDirectories.has(entry.name)) continue;
            yield* walk(absolutePath);
            continue;
        }
        if (entry.isFile()) yield absolutePath;
    }
}

function lineNumberForIndex(text, index) {
    let line = 1;
    for (let offset = 0; offset < index; offset += 1) {
        if (text.charCodeAt(offset) === 10) line += 1;
    }
    return line;
}
