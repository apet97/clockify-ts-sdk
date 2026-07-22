import assert from "node:assert/strict";
import test from "node:test";

import * as validator from "./lib/unique-claim-inventory.mjs";

const ROADMAP_PATH = "docs/roadmap-1.0.md";
const ROADMAP_STATUS_PATH = "docs/roadmap-1.0-status.json";
const RISK_PATH = "docs/risk-register.json";
const PRODUCT_SURFACE_PATH = "docs/product-surface.json";
const READINESS_PATH = "docs/release-readiness-checklist.md";

function makeEvidence(target) {
    return { type: "make-target", target, path: "Makefile", marker: target };
}

function contractEvidence(path, marker) {
    return { type: "contract", path, marker };
}

function generatedEvidence(path, marker) {
    return { type: "generated-surface", path, marker };
}

function receiptEvidence(path, marker) {
    return { type: "receipt", path, marker };
}

function fixture() {
    const roadmapClosure1 =
        "`make docs-quality`; `docs/roadmap-1.0-receipts/task-01.md`";
    const roadmapClosure2 =
        "`make docs-drift docs-quality`; `docs/roadmap-1.0-receipts/task-02.md`";
    const risks = [
        {
            id: "accepted-risk",
            status: "accepted",
            surface: "Release",
            summary: "One accepted release risk remains explicitly tracked.",
            impact: "The accepted boundary remains visible.",
            mitigation: "Keep the risk-register gate green.",
            closureGate: "No closure planned.",
            evidence: [{ path: "docs/release-readiness-contract.json", contains: "release-readiness" }],
        },
        {
            id: "open-risk",
            status: "open",
            finalReadinessBlocking: true,
            surface: "Readiness",
            summary: "One current risk blocks final readiness.",
            impact: "Final readiness remains blocked.",
            mitigation: "Close the named blocker before release.",
            closureGate: "Run the exact closure command and record its receipt.",
            evidence: [{ path: "docs/release-readiness-contract.json", contains: "release-readiness" }],
        },
    ];
    const workflows = [
        {
            id: "status",
            userGoal: "Confirm current status.",
            sdk: ["client.health"],
            cli: ["clk115 status"],
            tsMcp: ["clockify_status"],
            goMcp: ["clockify_status"],
            proof: ["wrapper/tests/health.test.ts"],
            surfaceAvailability: {
                sdk: "supported",
                cli: "supported",
                tsMcp: "supported",
                goMcp: "supported",
            },
            proofMode: "unit plus sandbox status proof",
            recovery: ["Inspect the diagnostic receipt."],
            intentionalGaps: [],
        },
        {
            id: "demo",
            userGoal: "Seed and clean deterministic demo data.",
            sdk: ["client.projects"],
            cli: [],
            tsMcp: ["clockify_demo_seed", "clockify_demo_cleanup"],
            goMcp: ["clockify_demo_seed", "clockify_demo_cleanup"],
            proof: ["scripts/live/orchestrator.mjs"],
            surfaceAvailability: {
                sdk: "supported through resources",
                cli: "no dedicated command",
                tsMcp: "supported",
                goMcp: "supported",
            },
            proofMode: "sandbox cleanup proof",
            recovery: ["Clean only the prefixed sandbox data."],
            intentionalGaps: ["CLI has no dedicated demo command."],
        },
    ];
    const readinessClaims = [
        {
            sourceKey: "readiness:static-preflight",
            path: READINESS_PATH,
            marker: "The release-readiness preflight is static and is not release proof.",
            status: "current",
            projection: {
                makeTarget: "release-readiness",
                mode: "static-no-network",
                proofAuthority: false,
            },
        },
        {
            sourceKey: "readiness:blocker-count",
            path: READINESS_PATH,
            marker: "The current final-readiness blocker count is one.",
            status: "blocked",
            projection: { openFinalReadinessBlockers: 1 },
        },
    ];
    const policy = {
        claimUniverse: ["readiness", "risk", "roadmap", "workflow"],
        allowedKinds: ["readiness", "risk", "roadmap", "workflow"],
        allowedStatuses: [
            "accepted",
            "available",
            "available-with-gaps",
            "blocked",
            "complete",
            "current",
            "implemented",
            "open",
            "pending",
        ],
        kindStatuses: {
            readiness: ["blocked", "current"],
            risk: ["accepted", "open"],
            roadmap: ["complete", "implemented", "pending"],
            workflow: ["available", "available-with-gaps"],
        },
        canonicalSources: {
            roadmap: {
                path: ROADMAP_PATH,
                statusPath: ROADMAP_STATUS_PATH,
                keys: ["roadmap:task-01", "roadmap:task-02"],
                statusSelectors: [
                    { key: "task1", taskNumbers: [1] },
                    { key: "task2", taskNumbers: [2] },
                ],
            },
            risk: {
                path: RISK_PATH,
                collection: "risks",
                keys: ["risk:accepted-risk", "risk:open-risk"],
            },
            workflow: {
                path: PRODUCT_SURFACE_PATH,
                collection: "workflows",
                keys: ["workflow:status", "workflow:demo"],
            },
            readiness: { claims: readinessClaims },
        },
        evidenceTypes: {
            contracts: [ROADMAP_STATUS_PATH, "docs/release-readiness-contract.json"],
            generatedSurfaces: [PRODUCT_SURFACE_PATH],
            receiptRoots: ["docs/roadmap-1.0-receipts"],
        },
        workflowBacking: {
            path: PRODUCT_SURFACE_PATH,
            requiredFields: [
                "surfaceAvailability",
                "proof",
                "proofMode",
                "recovery",
                "intentionalGaps",
            ],
        },
        wiring: {
            makefile: "Makefile",
            checker: "scripts/check-unique-claim-inventory.mjs",
            target: "unique-claim-inventory",
            aggregateTarget: "docs-quality",
        },
    };
    const claims = [
        {
            id: "roadmap-task-01",
            claimKey: "roadmap-task-01",
            sourceKey: "roadmap:task-01",
            claim: "Task 1 — Baseline is complete.",
            kind: "roadmap",
            locations: [
                { path: ROADMAP_PATH, marker: "| 1. Baseline |" },
                { path: ROADMAP_STATUS_PATH, marker: '"task1"' },
            ],
            evidence: [
                receiptEvidence(
                    "docs/roadmap-1.0-receipts/task-01.md",
                    "Task 1 receipt",
                ),
            ],
            boundary: "Completion is limited to the exact recorded gate and receipt.",
            status: "complete",
            sourceOfTruth: ROADMAP_PATH,
            projection: {
                taskNumber: 1,
                title: "Baseline",
                dependsOn: [],
                stateText: "complete",
                closure: roadmapClosure1,
                releaseBlocking: true,
            },
        },
        {
            id: "roadmap-task-02",
            claimKey: "roadmap-task-02",
            sourceKey: "roadmap:task-02",
            claim: "Task 2 — Follow-up remains pending.",
            kind: "roadmap",
            locations: [
                { path: ROADMAP_PATH, marker: "| 2. Follow-up |" },
                { path: ROADMAP_STATUS_PATH, marker: '"task2"' },
            ],
            evidence: [makeEvidence("docs-quality")],
            boundary: "A pending row records required work, not completion.",
            status: "pending",
            sourceOfTruth: ROADMAP_PATH,
            projection: {
                taskNumber: 2,
                title: "Follow-up",
                dependsOn: [1],
                stateText: "pending",
                closure: roadmapClosure2,
                releaseBlocking: true,
            },
        },
        ...risks.map((risk) => ({
            id: `risk-${risk.id}`,
            claimKey: `risk-${risk.id}`,
            sourceKey: `risk:${risk.id}`,
            claim: risk.summary,
            kind: "risk",
            locations: [{ path: RISK_PATH, marker: `"id": "${risk.id}"` }],
            evidence: [makeEvidence("risk-register")],
            boundary: risk.impact,
            status: risk.status,
            sourceOfTruth: RISK_PATH,
            projection: {
                id: risk.id,
                status: risk.status,
                finalReadinessBlocking: risk.finalReadinessBlocking ?? false,
                surface: risk.surface,
                summary: risk.summary,
                impact: risk.impact,
                mitigation: risk.mitigation,
                closureGate: risk.closureGate,
            },
        })),
        ...workflows.map((workflow) => ({
            id: `workflow-${workflow.id}`,
            claimKey: `workflow-${workflow.id}`,
            sourceKey: `workflow:${workflow.id}`,
            workflowId: workflow.id,
            claim: workflow.userGoal,
            kind: "workflow",
            locations: [
                { path: PRODUCT_SURFACE_PATH, marker: `"id": "${workflow.id}"` },
            ],
            evidence: [
                generatedEvidence(PRODUCT_SURFACE_PATH, `"id": "${workflow.id}"`),
            ],
            boundary:
                workflow.intentionalGaps.join(" ") ||
                "Availability remains bounded by the recorded proof and recovery fields.",
            status: workflow.intentionalGaps.length ? "available-with-gaps" : "available",
            sourceOfTruth: PRODUCT_SURFACE_PATH,
            projection: {
                id: workflow.id,
                userGoal: workflow.userGoal,
                surfaceAvailability: workflow.surfaceAvailability,
                proof: workflow.proof,
                proofMode: workflow.proofMode,
                recovery: workflow.recovery,
                intentionalGaps: workflow.intentionalGaps,
            },
        })),
        ...readinessClaims.map((source, index) => ({
            id: source.sourceKey.replace(":", "-"),
            claimKey: source.sourceKey.replace(":", "-"),
            sourceKey: source.sourceKey,
            claim:
                index === 0
                    ? "Release readiness preflight is static and has no proof authority."
                    : "One current risk blocks final readiness.",
            kind: "readiness",
            locations: [{ path: source.path, marker: source.marker }],
            evidence: [
                index === 0
                    ? makeEvidence("release-readiness")
                    : contractEvidence(
                          "docs/release-readiness-contract.json",
                          "release-readiness",
                      ),
            ],
            boundary:
                index === 0
                    ? "Static validation is orientation, not release proof."
                    : "The blocker count is derived only from current risk statuses.",
            status: source.status,
            sourceOfTruth: source.path,
            projection: source.projection,
        })),
    ];
    const files = {
        [ROADMAP_PATH]: [
            "| Task | Depends on | Status | Evidence now | Closure gate / receipt | Release blocker? |",
            "|---|---|---|---|---|---|",
            `| 1. Baseline | — | complete | receipt recorded | ${roadmapClosure1} | Yes |`,
            `| 2. Follow-up | 1 | pending | none recorded | ${roadmapClosure2} | Yes |`,
        ].join("\n"),
        [ROADMAP_STATUS_PATH]: JSON.stringify(
            {
                schemaVersion: 1,
                task1: {
                    status: "complete",
                    receipt: "docs/roadmap-1.0-receipts/task-01.md",
                },
                task2: { status: "pending" },
            },
            null,
            2,
        ),
        [RISK_PATH]: JSON.stringify(
            { schemaVersion: 1, allowedStatuses: ["open", "accepted"], risks },
            null,
            2,
        ),
        [PRODUCT_SURFACE_PATH]: JSON.stringify(
            { schemaVersion: 1, workflows },
            null,
            2,
        ),
        [READINESS_PATH]: readinessClaims.map((item) => item.marker).join("\n"),
        "docs/release-readiness-contract.json": JSON.stringify({
            wiring: { makeTarget: "release-readiness" },
        }),
        "docs/roadmap-1.0-receipts/task-01.md": "# Task 1 receipt\n\nTask 1 receipt",
        Makefile: [
            "docs-quality: unique-claim-inventory",
            "\tnode scripts/check-docs-quality.mjs",
            "unique-claim-inventory:",
            "\tnode scripts/check-unique-claim-inventory.mjs",
            "docs-drift:",
            "\tnode scripts/check-docs-drift.mjs",
            "risk-register:",
            "\tnode scripts/check-risk-register.mjs",
            "release-readiness:",
            "\tnode scripts/check-release-readiness.mjs",
            "perfect-full:",
            "\tnode scripts/verify.mjs full",
            "perfect-live:",
            "\tnode scripts/run-live-proof.mjs",
        ].join("\n"),
        "scripts/check-unique-claim-inventory.mjs":
            'import { validateUniqueClaimInventory } from "./lib/unique-claim-inventory.mjs";',
    };
    return { policy, inventory: { schemaVersion: 1, policy, claims }, files };
}

function validate(data) {
    return validator.validateUniqueClaimInventory({ root: "/fixture", ...data });
}

function expectFailure(mutate, diagnostic) {
    const data = fixture();
    mutate(data);
    const failures = validate(data);
    assert.ok(
        failures.some((failure) => failure.includes(diagnostic)),
        `expected ${JSON.stringify(diagnostic)} in:\n${failures.join("\n")}`,
    );
}

test("accepts a complete bounded canonical projection", () => {
    assert.deepEqual(validate(fixture()), []);
});

test("rejects duplicate ids", () => {
    expectFailure(
        ({ inventory }) => {
            inventory.claims[1].id = inventory.claims[0].id;
        },
        "duplicate id",
    );
});

test("rejects duplicate claim keys after case and whitespace normalization", () => {
    expectFailure(
        ({ inventory }) => {
            inventory.claims[1].claimKey = "  ROADMAP-TASK-01  ";
        },
        "duplicate normalized claimKey",
    );
});

test("rejects duplicate source keys", () => {
    expectFailure(
        ({ inventory }) => {
            inventory.claims[1].sourceKey = inventory.claims[0].sourceKey;
        },
        "duplicate sourceKey",
    );
});

test("rejects canonical location collisions after path and marker normalization", () => {
    expectFailure(
        ({ inventory }) => {
            inventory.claims[1].locations = [
                { path: `./${ROADMAP_PATH}`, marker: "  | 1. BASELINE | " },
            ];
        },
        "conflicting canonical location",
    );
});

test("rejects missing locations", () => {
    expectFailure(({ inventory }) => delete inventory.claims[0].locations, "locations must be non-empty");
});

test("rejects empty location paths", () => {
    expectFailure(({ inventory }) => (inventory.claims[0].locations[0].path = "  "), "location path must be non-empty");
});

test("rejects unsafe location paths", () => {
    expectFailure(({ inventory }) => (inventory.claims[0].locations[0].path = "../escape.md"), "location path is unsafe");
});

test("rejects non-existent location paths", () => {
    expectFailure(({ inventory }) => (inventory.claims[0].locations[0].path = "docs/missing.md"), "location path does not exist");
});

test("rejects unanchored locations", () => {
    expectFailure(({ inventory }) => (inventory.claims[0].locations[0].marker = "not present"), "location marker is not anchored");
});

test("rejects duplicate location paths within one claim", () => {
    expectFailure(
        ({ inventory }) => inventory.claims[0].locations.push({ path: ROADMAP_PATH, marker: "complete" }),
        "duplicate location path",
    );
});

test("rejects missing evidence", () => {
    expectFailure(({ inventory }) => (inventory.claims[0].evidence = []), "evidence must be non-empty");
});

test("rejects unsafe evidence paths", () => {
    expectFailure(
        ({ inventory }) => {
            inventory.claims[1].evidence = [
                { type: "contract", path: "../fake.json", marker: "fake" },
            ];
        },
        "evidence path is unsafe",
    );
});

test("rejects evidence types outside the closed vocabulary", () => {
    expectFailure(
        ({ inventory }) => {
            inventory.claims[1].evidence = [
                { type: "source-file", path: ROADMAP_PATH, marker: "Follow-up" },
            ];
        },
        "unknown evidence type",
    );
});

test("rejects made-up Make evidence targets", () => {
    expectFailure(
        ({ inventory }) => (inventory.claims[1].evidence = [makeEvidence("invented-target")]),
        "made-up Make target",
    );
});

test("rejects contract evidence outside the declared contract allowlist", () => {
    expectFailure(
        ({ inventory }) => {
            inventory.claims[1].evidence = [
                contractEvidence("docs/not-a-contract.json", "fake"),
            ];
        },
        "contract evidence path is not declared",
    );
});

test("rejects empty and unknown kinds", () => {
    expectFailure(({ inventory }) => (inventory.claims[0].kind = ""), "kind must be non-empty");
    expectFailure(({ inventory }) => (inventory.claims[0].kind = "history"), "unknown kind");
});

test("rejects empty and unknown statuses", () => {
    expectFailure(({ inventory }) => (inventory.claims[0].status = ""), "status must be non-empty");
    expectFailure(({ inventory }) => (inventory.claims[0].status = "done-ish"), "unknown status");
});

test("rejects kind and status contradictions", () => {
    expectFailure(({ inventory }) => (inventory.claims[2].status = "pending"), "status contradicts kind risk");
});

test("rejects complete claims backed only by static evidence", () => {
    expectFailure(
        ({ inventory }) => (inventory.claims[0].evidence = [makeEvidence("docs-quality")]),
        "complete roadmap claim requires receipt evidence",
    );
});

test("rejects workflow claims missing availability backing", () => {
    expectFailure(
        ({ inventory }) => delete inventory.claims[4].projection.surfaceAvailability,
        "workflow projection missing surfaceAvailability",
    );
});

test("rejects workflow claims missing proof backing", () => {
    expectFailure(({ inventory }) => delete inventory.claims[4].projection.proof, "workflow projection missing proof");
});

test("rejects workflow claims missing recovery backing", () => {
    expectFailure(({ inventory }) => (inventory.claims[4].projection.recovery = []), "workflow projection missing recovery");
});

test("rejects workflow claims missing intentional-gap backing", () => {
    expectFailure(
        ({ inventory }) => delete inventory.claims[5].projection.intentionalGaps,
        "workflow projection missing intentionalGaps",
    );
});

test("rejects workflow projections that drift from product-surface", () => {
    expectFailure(
        ({ inventory }) => (inventory.claims[4].projection.proofMode = "static only"),
        "workflow projection drift",
    );
});

test("rejects a roadmap claim omitted from the declared universe", () => {
    expectFailure(
        ({ inventory }) => inventory.claims.splice(1, 1),
        "roadmap claim coverage mismatch",
    );
});

test("rejects a risk claim omitted from the declared universe", () => {
    expectFailure(
        ({ inventory }) => inventory.claims.splice(2, 1),
        "risk claim coverage mismatch",
    );
});

test("rejects a workflow claim omitted from the declared universe", () => {
    expectFailure(
        ({ inventory }) => inventory.claims.splice(4, 1),
        "workflow claim coverage mismatch",
    );
});

test("rejects canonical source extras not enumerated by policy", () => {
    expectFailure(
        ({ files }) => {
            const source = JSON.parse(files[RISK_PATH]);
            source.risks.push({ ...source.risks[0], id: "unmapped-risk" });
            files[RISK_PATH] = JSON.stringify(source, null, 2);
        },
        "risk canonical source keys mismatch",
    );
});

test("rejects roadmap state drift", () => {
    expectFailure(
        ({ inventory }) => (inventory.claims[1].projection.stateText = "implemented"),
        "roadmap projection drift",
    );
});

test("rejects risk status drift", () => {
    expectFailure(
        ({ inventory }) => (inventory.claims[2].projection.status = "open"),
        "risk projection drift",
    );
});

test("rejects archived plans promoted as canonical sources", () => {
    expectFailure(
        ({ inventory, files }) => {
            const path = "docs/superpowers/plans/archived.md";
            files[path] = "archived marker";
            inventory.claims[6].sourceOfTruth = path;
            inventory.claims[6].locations = [{ path, marker: "archived marker" }];
        },
        "archived or historical source cannot be canonical",
    );
});

test("rejects historical receipts promoted as canonical sources", () => {
    expectFailure(
        ({ inventory }) => {
            inventory.claims[6].sourceOfTruth = "docs/roadmap-1.0-receipts/task-01.md";
            inventory.claims[6].locations = [
                {
                    path: "docs/roadmap-1.0-receipts/task-01.md",
                    marker: "Task 1 receipt",
                },
            ];
        },
        "receipt cannot be a canonical claim source",
    );
});

test("rejects a receipt location even when sourceOfTruth remains current", () => {
    expectFailure(
        ({ inventory }) => {
            inventory.claims[6].locations = [
                {
                    path: "docs/roadmap-1.0-receipts/task-01.md",
                    marker: "Task 1 receipt",
                },
            ];
        },
        "receipt cannot be a canonical claim location",
    );
});

test("rejects an empty inventory", () => {
    expectFailure(({ inventory }) => (inventory.claims = []), "inventory must contain claims");
});

test("reports malformed inventory JSON deterministically", () => {
    assert.equal(typeof validator.validateUniqueClaimInventoryDocument, "function");
    const failures = validator.validateUniqueClaimInventoryDocument({
        root: "/fixture",
        text: "{ malformed",
        files: fixture().files,
    });
    assert.ok(failures.some((failure) => failure.includes("malformed inventory JSON")));
});

test("rejects removed unique-claim Make target wiring", () => {
    expectFailure(
        ({ files }) => {
            files.Makefile = files.Makefile
                .replace("docs-quality: unique-claim-inventory", "docs-quality:")
                .replace(/unique-claim-inventory:\n\tnode scripts\/check-unique-claim-inventory\.mjs\n/, "");
        },
        "missing unique-claim-inventory Make target",
    );
});

test("rejects removed checker invocation wiring", () => {
    expectFailure(
        ({ files }) => {
            files.Makefile = files.Makefile.replace(
                "\tnode scripts/check-unique-claim-inventory.mjs",
                "\t@true",
            );
        },
        "missing unique-claim checker invocation",
    );
});

test("rejects removal from docs-quality aggregate wiring", () => {
    expectFailure(
        ({ files }) => {
            files.Makefile = files.Makefile.replace(
                "docs-quality: unique-claim-inventory",
                "docs-quality:",
            );
        },
        "docs-quality must depend on unique-claim-inventory",
    );
});
