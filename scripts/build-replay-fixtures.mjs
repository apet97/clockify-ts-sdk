#!/usr/bin/env node
/**
 * Redact a raw local probe into a committable golden fixture.
 *
 *   node scripts/build-replay-fixtures.mjs <name> [--op <operationId>]
 *
 * Reads spec/evidence/probes/<name>.json (git-ignored) and writes
 * spec/evidence/fixtures/<name>.json. Network-free.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const [name, ...rest] = process.argv.slice(2);
if (!name) {
    console.error("usage: node scripts/build-replay-fixtures.mjs <name> [--op <operationId>]");
    process.exit(2);
}

const opIndex = rest.indexOf("--op");
const operationId = opIndex >= 0 ? rest[opIndex + 1] : "unknown";
const probePath = path.join(root, "spec/evidence/probes", `${name}.json`);
if (!fs.existsSync(probePath)) {
    console.error(`probe not found: ${probePath} (probes are git-ignored; capture one first)`);
    process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(probePath, "utf8"));
const redactions = new Set();
const idMap = new Map();
let idSeq = 1;

function placeholderId() {
    return `000000000000000000000${String(idSeq++).padStart(3, "0")}`;
}

function redact(value, key) {
    if (Array.isArray(value)) return value.map((item) => redact(item, key));
    if (value && typeof value === "object") {
        const out = {};
        for (const [nextKey, nextValue] of Object.entries(value)) out[nextKey] = redact(nextValue, nextKey);
        return out;
    }
    if (typeof value !== "string") return value;

    if (key && /token|secret|key|authorization|cookie|password/i.test(key)) {
        redactions.add(`${key} -> <redacted>`);
        return "<redacted>";
    }
    if (key && /email|mail/i.test(key)) {
        redactions.add(`${key} -> mock@example.com`);
        return "mock@example.com";
    }
    if (key && /name/i.test(key)) {
        redactions.add(`${key} -> Mock User`);
        return "Mock User";
    }
    if (/^[0-9a-f]{24}$/i.test(value)) {
        if (!idMap.has(value)) idMap.set(value, placeholderId());
        redactions.add(`${key ?? "id"} -> placeholder`);
        return idMap.get(value);
    }
    return value;
}

function defaultAssertion(name, operationId, wire) {
    if (name === "projects.list" || operationId === "getWorkspaceProjects") {
        return { isArray: true };
    }
    if (name === "timeoff.requests.search" || operationId === "getTimeOffRequests") {
        return {
            envelope: ["count", "requests"],
            ...(typeof wire?.count === "number" ? { count: wire.count } : {}),
        };
    }
    return undefined;
}

const wire = redact(raw, undefined);
const assertion = defaultAssertion(name, operationId, wire);
const fixture = {
    comment: `WS3 golden fixture (redacted, NOT a raw live probe) for operationId ${operationId}. Built by scripts/build-replay-fixtures.mjs from a git-ignored probe. IDs replaced with placeholders; secrets -> <redacted>; emails/names -> synthetic.`,
    _redactions: [...redactions].sort(),
    operationId,
    wire,
    ...(assertion ? { assert: assertion } : {}),
};

const outPath = path.join(root, "spec/evidence/fixtures", `${name}.json`);
fs.writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`wrote redacted golden ${path.relative(root, outPath)} (${redactions.size} redactions)`);
