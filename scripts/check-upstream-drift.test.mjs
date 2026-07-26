import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readDoc(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

// Markdown prose wraps across lines; collapse whitespace so a substring
// check isn't sensitive to where the wrapping happens to fall.
function normalizeWhitespace(text) {
    return text.replace(/\s+/g, " ");
}

// Proof-class honesty (P01-04 / SOURCE-002): `upstream-drift` is a local-only,
// offline marker/wiring check. It must never be documented as if it were
// external upstream verification -- that claim belongs only to the networked
// `openapi-source-lock` / `locked-upstream-source` and `official-openapi-fetch`
// / `official-openapi-currentness` targets.
test("docs/upstream-drift-policy.md documents upstream-drift as local-only, not external proof", () => {
    const text = normalizeWhitespace(readDoc("docs/upstream-drift-policy.md"));
    assert.ok(
        text.includes("`upstream-drift` / `local-contract-consistency`** (offline)"),
        "policy doc must explicitly label upstream-drift as offline/local-only",
    );
    assert.ok(
        text.includes("proves nothing about what upstream currently contains"),
        "policy doc must explicitly disclaim external proof for the local-only gate",
    );
});

test("docs/upstream-drift-policy.md documents the networked proof classes distinctly", () => {
    const text = normalizeWhitespace(readDoc("docs/upstream-drift-policy.md"));
    assert.ok(
        text.includes("`openapi-source-lock` / `locked-upstream-source`** (networked)"),
        "policy doc must name the networked locked-upstream-source proof",
    );
    assert.ok(
        text.includes("`official-openapi-fetch` / `official-openapi-currentness`** (networked)"),
        "policy doc must name the networked official-currentness proof",
    );
});

test("official-openapi-drift-policy.md never claims official-openapi-drift (offline) is live proof", () => {
    const text = readDoc("docs/official-openapi-drift-policy.md");
    const offlineLine = text
        .split("\n")
        .find((line) => line.includes("make official-openapi-drift") && line.includes("gate:"));
    assert.ok(offlineLine, "expected to find the official-openapi-drift gate description line");
    assert.ok(
        !/\blive\b/i.test(offlineLine),
        `official-openapi-drift (offline) description must not claim to be live proof: ${offlineLine}`,
    );
});
