import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateUniqueClaimInventory } from "./lib/unique-claim-inventory.mjs";

function fixture(overrides = {}) {
    const row = {
        id: "readiness-posture",
        claimKey: "readiness-posture",
        claim: "The repository has a defined current readiness posture.",
        kind: "readiness",
        locations: [{ path: "docs/source.md", marker: "readiness marker" }],
        evidence: [{ path: "Makefile", marker: "docs-quality" }],
        boundary: "Static validation is not release proof.",
        status: "current",
        sourceOfTruth: "docs/source.md",
    };
    return {
        policy: {
            claimUniverse: ["readiness", "risk", "roadmap", "workflow"],
            allowedKinds: ["readiness", "risk", "roadmap", "workflow"],
            allowedStatuses: ["current", "accepted", "pending"],
            workflowBacking: { path: "docs/product-surface.json", requiredFields: ["surfaceAvailability", "proofMode", "recovery", "intentionalGaps"] },
        },
        inventory: { schemaVersion: 1, claims: [row] },
        files: {
            "docs/source.md": "readiness marker",
            "docs/product-surface.json": JSON.stringify({ workflows: [{ id: "daily", surfaceAvailability: { sdk: "available" }, proofMode: "mock", recovery: ["retry"], intentionalGaps: [] }] }),
            Makefile: "docs-quality:\n\tnode scripts/check-docs-quality.mjs\nunique-claim-inventory:\n\tnode scripts/check-unique-claim-inventory.mjs\n",
        },
        ...overrides,
    };
}

function validate(data) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "unique-claims-"));
    try {
        for (const [relative, text] of Object.entries(data.files)) {
            const file = path.join(tempRoot, relative);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, text);
        }
        return validateUniqueClaimInventory({ root: tempRoot, ...data });
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
}

test("accepts a bounded inventory with exact source and Make evidence", () => {
    assert.deepEqual(validate(fixture()), []);
});

test("fails closed on normalized duplicate claim keys and conflicting locations", () => {
    const data = fixture();
    data.inventory.claims.push({ ...data.inventory.claims[0], id: "risk-posture", claimKey: " READINESS-POSTURE ", evidence: [{ path: "Makefile", marker: "unique-claim-inventory" }] });
    const failures = validate(data);
    assert.ok(failures.some((failure) => failure.includes("duplicate normalized claimKey")));
    assert.ok(failures.some((failure) => failure.includes("conflicting canonical location")));
});

test("fails closed on unsafe or unanchored locations and invented Make evidence", () => {
    const data = fixture();
    data.inventory.claims[0].locations = [{ path: "../escape.md", marker: "missing" }];
    data.inventory.claims[0].evidence = [{ path: "Makefile", marker: "invented-target" }];
    const failures = validate(data);
    assert.ok(failures.some((failure) => failure.includes("unsafe path")));
    assert.ok(failures.some((failure) => failure.includes("made-up Make target")));
});

test("requires workflow claims to name a complete product-surface workflow backing", () => {
    const data = fixture();
    data.inventory.claims[0] = { ...data.inventory.claims[0], id: "workflow-daily", claimKey: "workflow-daily", kind: "workflow", evidence: [{ path: "docs/product-surface.json", marker: "daily" }] };
    data.files["docs/product-surface.json"] = JSON.stringify({ workflows: [{ id: "daily", surfaceAvailability: { sdk: "available" }, proofMode: "mock", recovery: [], intentionalGaps: [] }] });
    const failures = validate(data);
    assert.ok(failures.some((failure) => failure.includes("workflow backing missing required field recovery")));
});
