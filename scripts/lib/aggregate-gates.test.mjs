import assert from "node:assert/strict";
import test from "node:test";

import { evaluateAggregateGates, parseMakefile } from "./aggregate-gates.mjs";

const baseContract = {
    bounds: {
        maxDepth: 32,
        maxInvocations: 64,
        maxTargetVisits: 256,
        maxRecipeLines: 256,
    },
    aggregates: {
        "perfect-fast": {
            verifyPhase: "fast",
            performanceLast: true,
        },
        "perfect-full": {
            verifyPhase: "full",
            includesAggregate: "perfect-fast",
            performanceLast: true,
        },
        "contract-gates": {
            requiredTargets: ["aggregate-gates"],
        },
    },
    standaloneVerify: {
        full: { exactlyOnce: ["generator-comparison", "mutation-ci"] },
        release: { exactlyOnce: ["generator-comparison", "mutation-ci"] },
    },
    performanceTarget: "performance-budgets",
};

function command(command, args, env) {
    return env === undefined ? { command, args } : { command, args, env };
}

const validPlans = {
    fast: [command("make", ["fast-proof"]), command("make", ["performance-budgets"])],
    full: [
        command("make", ["fast-proof"]),
        command("make", ["generator-comparison"]),
        command("make", ["mutation-ci"]),
        command("make", ["performance-budgets"]),
    ],
    live: [],
    release: [
        command("make", ["generator-comparison"]),
        command("make", ["mutation-ci"]),
    ],
};

const validMakefile = `.PHONY: perfect-fast perfect-full contract-gates aggregate-gates fast-claim fast-proof generator-comparison mutation-ci performance-budgets
perfect-fast: fast-claim
\tnode scripts/verify.mjs fast
perfect-full: fast-claim
\tnode scripts/verify.mjs full
contract-gates: aggregate-gates
aggregate-gates:
\tnode scripts/check-aggregate-gates.mjs
fast-claim:
\tnode claim.mjs
fast-proof:
\tnode proof.mjs
generator-comparison:
\tnode generator.mjs
mutation-ci:
\tnode mutation-ci.mjs
performance-budgets:
\tnode performance.mjs
`;

function evaluate(makefileText = validMakefile, plans = validPlans, contract = baseContract) {
    return evaluateAggregateGates({
        makefileText,
        contract,
        commandsForPhase: (phase) => plans[phase].map((entry) => structuredClone(entry)),
    });
}

function expectFailure(makefileText, pattern, plans = validPlans, contract = baseContract) {
    const result = evaluate(makefileText, plans, contract);
    assert.ok(result.failures.some((failure) => pattern.test(failure)), result.failures.join("\n"));
}

test("parses targets, prerequisites, recipes, and phony declarations", () => {
    const parsed = parseMakefile(validMakefile);
    assert.deepEqual(parsed.targets.get("perfect-fast").prerequisites, ["fast-claim"]);
    assert.deepEqual(parsed.targets.get("perfect-fast").recipes, ["node scripts/verify.mjs fast"]);
    assert.ok(parsed.phony.has("perfect-fast"));
});

test("accepts a unique bounded aggregate graph", () => {
    const result = evaluate();
    assert.deepEqual(result.failures, []);
    assert.equal(result.aggregates["perfect-fast"].counts["performance-budgets"], 1);
    assert.equal(result.aggregates["perfect-full"].sequence.at(-1), "performance-budgets");
});

test("rejects a duplicate inside one verify make command", () => {
    expectFailure(
        validMakefile,
        /fast-proof.*verify fast\[0\].*verify fast\[0\]/i,
        { ...validPlans, fast: [command("make", ["fast-proof", "fast-proof"])] },
    );
});

test("rejects a duplicate across two verify plan entries", () => {
    expectFailure(
        validMakefile,
        /fast-proof.*verify fast\[0\].*verify fast\[1\]/i,
        {
            ...validPlans,
            fast: [command("make", ["fast-proof"]), command("make", ["fast-proof"])],
        },
    );
});

test("rejects a duplicate reached through two prerequisite paths", () => {
    const makefile = `${validMakefile}\nleft: shared\nright: shared\nshared:\n\tnode shared.mjs\n`.replace(
        "perfect-fast: fast-claim",
        "perfect-fast: fast-claim left right",
    );
    expectFailure(
        makefile,
        /shared.*perfect-fast -> left -> shared.*perfect-fast -> right -> shared/i,
        validPlans,
    );
});

test("rejects a duplicate target definition with the reached paths", () => {
    expectFailure(
        `${validMakefile}\nfast-claim:\n\tnode duplicate.mjs\n`,
        /fast-claim.*defined.*line.*line/i,
    );
});

test("rejects a dependency cycle with the complete path", () => {
    const makefile = validMakefile
        .replace("perfect-fast: fast-claim", "perfect-fast: fast-claim cycle-a")
        .concat("\ncycle-a: cycle-b\ncycle-b: cycle-a\n");
    expectFailure(makefile, /cycle.*perfect-fast -> cycle-a -> cycle-b -> cycle-a/i);
});

test("rejects a transitive local mutation target", () => {
    const makefile = `${validMakefile}\nmutation-safety: mutation\nmutation:\n\tnpx stryker run\n`.replace(
        "perfect-fast: fast-claim",
        "perfect-fast: fast-claim mutation-safety",
    );
    expectFailure(
        makefile,
        /perfect-fast -> mutation-safety -> mutation.*local mutation/i,
    );
});

test("rejects recursive make reaching mutation", () => {
    const makefile = validMakefile.replace(
        "\tnode claim.mjs",
        "\t$(MAKE) --no-print-directory mutation\nmutation:\n\tnode mutation.mjs",
    );
    expectFailure(makefile, /fast-claim.*recursive make.*mutation.*local mutation/i);
});

for (const recipe of [
    "npm run mutation -w @apet97/clockify-mcp-115",
    "npm -w @apet97/clockify-mcp-115 run mutation",
    "npm --workspace=@apet97/clockify-mcp-115 run mutation",
    "npx stryker run",
    "npm exec -- stryker run",
]) {
    test(`rejects reached local mutation recipe: ${recipe}`, () => {
        expectFailure(
            validMakefile.replace("node claim.mjs", recipe),
            /fast-claim.*local mutation/i,
        );
    });
}

test("rejects Stryker reached through an invoked package script", () => {
    const result = evaluateAggregateGates({
        makefileText: validMakefile,
        contract: baseContract,
        commandsForPhase: (phase) => {
            if (phase !== "fast") return validPlans[phase].map((entry) => structuredClone(entry));
            return [
                command("npm", ["run", "danger", "-w", "fixture-package"]),
                command("make", ["performance-budgets"]),
            ];
        },
        packageCatalog: {
            byDirectory: {
                ".": { name: "root", scripts: {} },
                fixture: {
                    name: "fixture-package",
                    scripts: {
                        danger: "node harmless.mjs && npm run inject",
                        inject: "npx stryker run",
                    },
                },
            },
            byName: { "fixture-package": "fixture" },
        },
    });
    assert.ok(
        result.failures.some((failure) =>
            /fixture:danger -> fixture:inject.*Stryker/i.test(failure),
        ),
        result.failures.join("\n"),
    );
});

test("rejects Stryker hidden behind a workspace script in a reached recipe", () => {
    const result = evaluateAggregateGates({
        makefileText: validMakefile.replace(
            "node claim.mjs",
            "npm run danger --workspace fixture-package",
        ),
        contract: baseContract,
        commandsForPhase: (phase) =>
            validPlans[phase].map((entry) => structuredClone(entry)),
        packageCatalog: {
            byDirectory: {
                ".": { name: "root", scripts: {} },
                fixture: {
                    name: "fixture-package",
                    scripts: { danger: "npm exec -- stryker run" },
                },
            },
            byName: { "fixture-package": "fixture" },
        },
    });
    assert.ok(
        result.failures.some((failure) =>
            /fast-claim.*fixture:danger.*Stryker/i.test(failure),
        ),
        result.failures.join("\n"),
    );
});

test("does not mistake mutation-ci fixture strings for local mutation", () => {
    const makefile = validMakefile.replace(
        "node mutation-ci.mjs",
        "node --test scripts/check-mutation-ci-workflow.test.mjs",
    );
    assert.deepEqual(evaluate(makefile).failures, []);
});

test("rejects loss of standalone full or release required targets", () => {
    for (const phase of ["full", "release"]) {
        for (const target of ["generator-comparison", "mutation-ci"]) {
            const plans = {
                ...validPlans,
                [phase]: validPlans[phase].filter(
                    (entry) => !(entry.command === "make" && entry.args.includes(target)),
                ),
            };
            expectFailure(validMakefile, new RegExp(`${phase}.*${target}.*exactly once`, "i"), plans);
        }
    }
});

test("rejects moved or doubled fast/full performance budgets", () => {
    expectFailure(
        validMakefile,
        /fast.*performance-budgets.*last/i,
        { ...validPlans, fast: [...validPlans.fast].reverse() },
    );
    expectFailure(
        validMakefile,
        /full.*performance-budgets.*exactly once/i,
        { ...validPlans, full: [...validPlans.full, command("make", ["performance-budgets"])] },
    );
});

test("does not impose performance ordering on live or release", () => {
    const plans = {
        ...validPlans,
        live: [command("make", ["performance-budgets"]), command("make", ["fast-proof"])],
        release: [
            command("make", ["performance-budgets"]),
            ...validPlans.release,
            command("make", ["fast-proof"]),
        ],
    };
    assert.deepEqual(evaluate(validMakefile, plans).failures, []);
});

test("rejects loss of a perfect-fast claim from perfect-full", () => {
    expectFailure(
        validMakefile.replace("perfect-full: fast-claim", "perfect-full:"),
        /perfect-full.*missing perfect-fast claim.*fast-claim/i,
    );
});

test("rejects unknown targets and unsupported recursive make indirection", () => {
    expectFailure(
        validMakefile.replace("perfect-fast: fast-claim", "perfect-fast: missing-target"),
        /missing-target.*unknown target.*perfect-fast -> missing-target/i,
    );
    expectFailure(
        validMakefile.replace("node claim.mjs", "$(MAKE) $@"),
        /recursive make.*unsupported.*\$@/i,
    );
});

test("rejects explicit bounds before unbounded traversal", () => {
    expectFailure(
        validMakefile,
        /maxTargetVisits.*bound/i,
        validPlans,
        {
            ...baseContract,
            bounds: { ...baseContract.bounds, maxTargetVisits: 1 },
        },
    );
});
