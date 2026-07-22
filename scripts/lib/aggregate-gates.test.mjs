import assert from "node:assert/strict";
import test from "node:test";

import { evaluateAggregateGates, parseMakefile } from "./aggregate-gates.mjs";

const baseContract = {
    bounds: {
        maxDepth: 32,
        maxInvocations: 64,
        maxTargetVisits: 256,
        maxRecipeLines: 256,
        maxCommandSegments: 512,
        maxCommandTokens: 1024,
        maxPackageScripts: 128,
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

function evaluate(
    makefileText = validMakefile,
    plans = validPlans,
    contract = baseContract,
    options = {},
) {
    return evaluateAggregateGates({
        makefileText,
        contract,
        commandsForPhase: (phase) => plans[phase].map((entry) => structuredClone(entry)),
        ...options,
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
            /fixture:danger.*fixture:inject.*Stryker/i.test(failure),
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

test("rejects hidden duplicate targets in standalone verify plans without exemptions", () => {
    expectFailure(
        validMakefile,
        /standalone verify release.*fast-proof.*executes more than once/i,
        {
            ...validPlans,
            release: [
                command("make", ["generator-comparison"]),
                command("make", ["fast-proof"]),
                command("make", ["fast-proof"]),
                command("make", ["mutation-ci"]),
            ],
        },
    );
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

test("traverses a reached external Makefile and counts its transitive recursive targets", () => {
    const root = validMakefile.replace(
        "node claim.mjs",
        "$(MAKE) --no-print-directory -C fixture relay",
    );
    const fixture = `.PHONY: relay nested
relay:
\t$(MAKE) --no-print-directory nested
nested:
\tnode nested.mjs
`;
    const result = evaluate(root, validPlans, {
        ...baseContract,
        makefiles: { allowedDirectories: [".", "fixture"] },
    }, {
        makefileProvider: (directory) => ({ ".": root, fixture }[directory]),
        makefileFallbackProvider: (directory) => (directory === "fixture" ? fixture : undefined),
    });

    assert.equal(result.aggregates["perfect-fast"].counts["fixture::relay"], 1);
    assert.equal(result.aggregates["perfect-fast"].counts["fixture::nested"], 1);
    assert.deepEqual(result.failures, []);
});

test("rejects transitive mutation and duplicate paths inside a reached external Makefile", () => {
    const root = validMakefile.replace("node claim.mjs", "$(MAKE) -C fixture relay");
    const fixture = `.PHONY: relay left right shared mutation
relay: left right mutation
left: shared
right: shared
shared:
\tnode shared.mjs
mutation:
\tnode mutation.mjs
`;
    const result = evaluate(root, validPlans, {
        ...baseContract,
        makefiles: { allowedDirectories: [".", "fixture"] },
    }, {
        makefileProvider: (directory) => ({ ".": root, fixture }[directory]),
    });

    assert.match(result.failures.join("\n"), /fixture::mutation.*local mutation/i);
    assert.match(result.failures.join("\n"), /fixture::shared.*left.*right/i);
});

test("fails closed for missing and out-of-policy recursive Make directories", () => {
    const missing = validMakefile.replace("node claim.mjs", "$(MAKE) -C fixture relay");
    const missingResult = evaluate(missing, validPlans, {
        ...baseContract,
        makefiles: { allowedDirectories: [".", "fixture"] },
    }, {
        makefileProvider: (directory) => (directory === "." ? missing : undefined),
    });
    assert.match(missingResult.failures.join("\n"), /fixture.*Makefile.*unavailable/i);

    const outside = validMakefile.replace("node claim.mjs", "$(MAKE) -C ../outside relay");
    const outsideResult = evaluate(outside, validPlans, {
        ...baseContract,
        makefiles: { allowedDirectories: [".", "fixture"] },
    }, {
        makefileProvider: () => validMakefile,
    });
    assert.match(outsideResult.failures.join("\n"), /\.\.\/outside.*outside.*policy/i);
});

test("rejects a Make target hidden in a recursively reached npm script", () => {
    const makefile = validMakefile
        .replace("node claim.mjs", "npm run hidden")
        .concat("\n.PHONY: mutation\nmutation:\n\tnode mutation.mjs\n");
    const result = evaluate(makefile, validPlans, baseContract, {
        packageCatalog: {
            byDirectory: { ".": { name: "root", scripts: { hidden: "make mutation" } } },
            byName: { root: "." },
        },
    });
    assert.match(result.failures.join("\n"), /hidden.*mutation.*local mutation/i);
});

test("counts a Make target hidden in an npm script and rejects the resulting duplicate", () => {
    const makefile = validMakefile.replace("node claim.mjs", "npm run hidden");
    const result = evaluate(makefile, validPlans, baseContract, {
        packageCatalog: {
            byDirectory: { ".": { name: "root", scripts: { hidden: "make fast-proof" } } },
            byName: { root: "." },
        },
    });
    assert.match(result.failures.join("\n"), /fast-proof.*hidden.*verify fast/i);
});

test("supports command make and rejects unparseable shell-wrapped Make", () => {
    expectFailure(
        validMakefile.replace("node claim.mjs", "command make mutation"),
        /fast-claim.*mutation.*local mutation/i,
    );
    expectFailure(
        validMakefile.replace("node claim.mjs", "bash -c 'make mutation'"),
        /unsupported shell.*bash.*-c.*make mutation/i,
    );
});

test("routes command make from a canonical verify entry through target traversal", () => {
    expectFailure(
        validMakefile,
        /verify fast.*mutation.*local mutation/i,
        {
            ...validPlans,
            fast: [
                command("command", ["make", "mutation"]),
                command("make", ["performance-budgets"]),
            ],
        },
    );
});

test("rejects unaccounted Make and Stryker markers in canonical verify command representations", () => {
    expectFailure(
        validMakefile,
        /verify fast.*unaccounted.*Make/i,
        {
            ...validPlans,
            fast: [command("echo", ["make"]), command("make", ["performance-budgets"])],
        },
    );
    expectFailure(
        validMakefile,
        /verify fast.*Stryker.*marker/i,
        {
            ...validPlans,
            fast: [
                command("node", ["node_modules/.bin/stryker"]),
                command("make", ["performance-budgets"]),
            ],
        },
    );
});

for (const recipe of [
    "npm run-script mutation -w fixture-package",
    "npm -w fixture-package run-script mutation",
    "npm --workspace=fixture-package run-script mutation",
    "npm x -- stryker run",
    "npm exec -- stryker run",
    "npx --yes stryker run",
    "stryker run",
]) {
    test(`rejects official local mutation command form: ${recipe}`, () => {
        expectFailure(validMakefile.replace("node claim.mjs", recipe), /local mutation/i);
    });
}

test("follows workspace-before-run-script package invocation", () => {
    const makefile = validMakefile.replace(
        "node claim.mjs",
        "npm -w fixture-package run-script danger",
    );
    const result = evaluate(makefile, validPlans, baseContract, {
        packageCatalog: {
            byDirectory: {
                ".": { name: "root", scripts: {} },
                fixture: { name: "fixture-package", scripts: { danger: "npm x stryker" } },
            },
            byName: { root: ".", "fixture-package": "fixture" },
        },
    });
    assert.match(result.failures.join("\n"), /fixture:danger.*Stryker/i);
});

test("requires every governed root and external target to be phony", () => {
    expectFailure(
        validMakefile.replace(" fast-proof", ""),
        /fast-proof.*not declared.*\.PHONY/i,
    );

    const root = validMakefile.replace("node claim.mjs", "$(MAKE) -C fixture relay");
    const fixture = `relay:\n\tnode relay.mjs\n`;
    const result = evaluate(root, validPlans, {
        ...baseContract,
        makefiles: { allowedDirectories: [".", "fixture"] },
    }, {
        makefileProvider: (directory) => ({ ".": root, fixture }[directory]),
    });
    assert.match(result.failures.join("\n"), /fixture::relay.*not declared.*\.PHONY/i);
});

test("rejects standalone proof targets whose run recipe can race setup under make -j", () => {
    const unsafe = `${validMakefile}
.PHONY: public-proof setup proof-run
public-proof: setup proof-run
setup:
\tnode setup.mjs
proof-run:
\tnode proof.mjs
`;
    const contract = {
        ...baseContract,
        standaloneTargetOrder: {
            "public-proof": { setupPrerequisites: ["setup"], runTarget: "proof-run" },
        },
    };
    assert.match(
        evaluate(unsafe, validPlans, contract).failures.join("\n"),
        /public-proof.*proof-run.*recipe.*after.*setup/i,
    );

    const safe = unsafe.replace(
        "public-proof: setup proof-run",
        "public-proof: setup\n\t$(MAKE) --no-print-directory proof-run",
    );
    assert.deepEqual(evaluate(safe, validPlans, contract).failures, []);
});

test("charges command and package-script traversal to explicit bounds", () => {
    const scripts = {
        one: "npm run two",
        two: "npm run three",
        three: "node safe.mjs",
    };
    const makefile = validMakefile.replace("node claim.mjs", "npm run one");
    const result = evaluate(makefile, validPlans, {
        ...baseContract,
        bounds: {
            ...baseContract.bounds,
            maxCommandSegments: 2,
            maxPackageScripts: 2,
        },
    }, {
        packageCatalog: {
            byDirectory: { ".": { name: "root", scripts } },
            byName: { root: "." },
        },
    });
    assert.match(result.failures.join("\n"), /max(CommandSegments|PackageScripts).*bound/i);
});

test("accepts an accounted recursive Make invocation with output redirection", () => {
    const makefile = validMakefile
        .replace(
            "node claim.mjs",
            "$(MAKE) --no-print-directory fast-child >/dev/null",
        )
        .concat("\n.PHONY: fast-child\nfast-child:\n\tnode child.mjs\n");
    assert.deepEqual(evaluate(makefile).failures, []);
});

for (const recipe of [
    "echo '$$(make mutation)'",
    'm=make; "$m" mutation',
    "printf make | sh",
    "eval make mutation",
    "echo \"make mutation\"",
    "node -e 'require(\"child_process\").execSync(\"make mutation\")'",
    "python -c 'import os; os.system(\"make mutation\")'",
]) {
    test(`rejects an unaccounted raw Make marker: ${recipe}`, () => {
        expectFailure(
            makefileWithMutation.replace("node claim.mjs", recipe),
            /unaccounted.*Make|unsupported.*Make|local mutation/i,
        );
    });
}

test("rejects an unaccounted Make marker beside an accounted invocation", () => {
    expectFailure(
        validMakefile.replace("node claim.mjs", "echo make; make fast-proof"),
        /unaccounted.*Make|fast-proof.*executes more than once/i,
    );
});

test("accounts quoted and path-qualified Make commands without exempting extra markers", () => {
    expectFailure(
        makefileWithMutation.replace("node claim.mjs", "\"make\" mutation"),
        /mutation.*local mutation/i,
    );
    expectFailure(
        validMakefile.replace("node claim.mjs", "command \"/usr/bin/make\" fast-proof"),
        /fast-proof.*executes more than once/i,
    );
});

const externalRootMakefile = validMakefile.replace(
    "node claim.mjs",
    "$(MAKE) --no-print-directory -C fixture relay",
);
const externalFallbackMakefile = `.PHONY: relay nested
relay:
\t$(MAKE) --no-print-directory nested
nested:
\tnode nested.mjs
`;
const externalContract = {
    ...baseContract,
    makefiles: { allowedDirectories: [".", "fixture"] },
};

test("uses a committed external Make graph fallback when the live sibling is absent", () => {
    const result = evaluate(externalRootMakefile, validPlans, externalContract, {
        makefileProvider: (directory) => (directory === "." ? externalRootMakefile : undefined),
        makefileDirectoryStateProvider: (directory) =>
            directory === "fixture" ? "absent" : "present",
        makefileFallbackProvider: (directory) =>
            directory === "fixture" ? externalFallbackMakefile : undefined,
    });

    assert.deepEqual(result.failures, []);
    assert.equal(result.aggregates["perfect-fast"].counts["fixture::relay"], 1);
    assert.equal(result.aggregates["perfect-fast"].counts["fixture::nested"], 1);
});

test("rejects fallback use when the external directory exists without a readable Makefile", () => {
    const result = evaluate(externalRootMakefile, validPlans, externalContract, {
        makefileProvider: (directory) => (directory === "." ? externalRootMakefile : undefined),
        makefileDirectoryStateProvider: () => "present",
        makefileFallbackProvider: (directory) =>
            directory === "fixture" ? externalFallbackMakefile : undefined,
    });

    assert.match(result.failures.join("\n"), /fixture.*present.*Makefile.*unavailable/i);
});

test("accepts a live external Make graph that matches its committed fallback", () => {
    const result = evaluate(externalRootMakefile, validPlans, externalContract, {
        makefileProvider: (directory) =>
            ({ ".": externalRootMakefile, fixture: externalFallbackMakefile })[directory],
        makefileFallbackProvider: (directory) =>
            directory === "fixture" ? externalFallbackMakefile : undefined,
    });

    assert.deepEqual(result.failures, []);
});

test("rejects relevant drift between a live external Make graph and its fallback", () => {
    const drifted = externalFallbackMakefile.replace(
        "$(MAKE) --no-print-directory nested",
        "$(MAKE) --no-print-directory nested extra",
    ).concat(".PHONY: extra\nextra:\n\tnode extra.mjs\n");
    const result = evaluate(externalRootMakefile, validPlans, externalContract, {
        makefileProvider: (directory) =>
            ({ ".": externalRootMakefile, fixture: drifted })[directory],
        makefileFallbackProvider: (directory) =>
            directory === "fixture" ? externalFallbackMakefile : undefined,
    });

    assert.match(result.failures.join("\n"), /fixture.*live.*fallback.*drift/i);
});

test("rejects a malformed or incomplete external Make graph fallback", () => {
    for (const fallback of ["not a make graph\n", ".PHONY: relay\nrelay: missing\n"]) {
        const result = evaluate(externalRootMakefile, validPlans, externalContract, {
            makefileProvider: (directory) => (directory === "." ? externalRootMakefile : undefined),
            makefileFallbackProvider: (directory) =>
                directory === "fixture" ? fallback : undefined,
        });
        assert.match(result.failures.join("\n"), /fixture.*fallback/i);
    }
});

test("rejects duplicate target definitions in a live-matched fallback", () => {
    const duplicateFallback = `${externalFallbackMakefile}relay:\n\tnode duplicate.mjs\n`;
    const result = evaluate(externalRootMakefile, validPlans, externalContract, {
        makefileProvider: (directory) =>
            ({ ".": externalRootMakefile, fixture: externalFallbackMakefile })[directory],
        makefileFallbackProvider: (directory) =>
            directory === "fixture" ? duplicateFallback : undefined,
    });
    assert.match(result.failures.join("\n"), /fixture.*fallback.*defined more than once/i);
});

const makefileWithMutation = `${validMakefile}
.PHONY: mutation
mutation:
\tnode mutation.mjs
`;

for (const recipe of [
    "bash -lc 'make mutation'",
    "sh -ec 'make mutation'",
]) {
    test(`rejects shell command-string indirection with combined options: ${recipe}`, () => {
        expectFailure(
            makefileWithMutation.replace("node claim.mjs", recipe),
            /unsupported shell.*make mutation/i,
        );
    });
}

test("rejects parenthesized Make mutation and hidden duplicate groups", () => {
    expectFailure(
        makefileWithMutation.replace("node claim.mjs", "(make mutation)"),
        /Make-like|mutation/i,
    );
    expectFailure(
        validMakefile.replace("node claim.mjs", "(make fast-proof)"),
        /parenthesized.*fast-proof|fast-proof.*more than once/i,
    );
});

test("normalizes a direct Make executable path before traversal", () => {
    expectFailure(
        makefileWithMutation.replace("node claim.mjs", "/usr/bin/make mutation"),
        /mutation.*local mutation/i,
    );
    expectFailure(
        validMakefile.replace("node claim.mjs", "/usr/bin/make fast-proof"),
        /fast-proof.*executes more than once/i,
    );
});

test("accounts GNU Make-compatible executable names through the same traversal", () => {
    expectFailure(
        makefileWithMutation.replace("node claim.mjs", "gmake mutation"),
        /mutation.*local mutation/i,
    );
    expectFailure(
        validMakefile.replace("node claim.mjs", "/opt/homebrew/bin/gmake fast-proof"),
        /fast-proof.*executes more than once/i,
    );
});

for (const recipe of [
    "node ./node_modules/@stryker-mutator/core/bin/stryker.js run",
    "/usr/bin/node node_modules/.bin/stryker run",
    "node -e 'require(\"@stryker-mutator/core\")'",
    "python -c 'import stryker'",
    "echo node_modules/.bin/stryker",
]) {
    test(`rejects a source-wide Stryker executable marker: ${recipe}`, () => {
        expectFailure(validMakefile.replace("node claim.mjs", recipe), /Stryker.*marker|local mutation/i);
    });
}

test("rejects npx command-string forms before their payload can bypass traversal", () => {
    for (const recipe of [
        "npx -c 'stryker run'",
        "npx --call 'make mutation'",
        "npx --call='make mutation'",
    ]) {
        expectFailure(
            makefileWithMutation.replace("node claim.mjs", recipe),
            /npx.*(?:-c|--call)|Stryker|unaccounted.*Make/i,
        );
    }
});

test("recursively walks npm exec payloads for mutation and duplicate Make targets", () => {
    expectFailure(
        makefileWithMutation.replace("node claim.mjs", "npm exec -- make mutation"),
        /mutation.*local mutation/i,
    );
    expectFailure(
        validMakefile.replace("node claim.mjs", "npm x -- make fast-proof"),
        /fast-proof.*executes more than once/i,
    );
    expectFailure(
        makefileWithMutation.replace("node claim.mjs", "npm exec -- bash -lc make mutation"),
        /unsupported shell|unaccounted.*Make/i,
    );
});

const npmFixtureCatalog = {
    byDirectory: {
        ".": { name: "root", scripts: {} },
        fixture: {
            name: "fixture-package",
            scripts: {
                danger: "npm x stryker",
                test: "npm x stryker",
            },
        },
    },
    byName: { root: ".", "fixture-package": "fixture" },
};

for (const recipe of [
    "npm -w fixture-package test",
    "npm --workspace fixture-package test",
    "npm -w fixture test",
    "npm --workspace=./fixture run danger",
    "npm -w=fixture-package run danger",
    "npm --workspace=fixture-package run danger",
    "npm --prefix fixture run danger",
    "npm --prefix=fixture run danger",
    "npm -C fixture run danger",
    "npm -C=fixture run danger",
    "npm run danger -w fixture-package",
    "npm run danger --workspace=fixture-package",
    "npm -w fixture-package t",
    "npm --prefix fixture tst",
]) {
    test(`parses bounded npm package/script form and reaches Stryker: ${recipe}`, () => {
        const result = evaluate(
            validMakefile.replace("node claim.mjs", recipe),
            validPlans,
            baseContract,
            { packageCatalog: npmFixtureCatalog },
        );
        assert.match(result.failures.join("\n"), /fixture:(danger|test).*Stryker/i);
    });
}

test("detects npm exec aliases after global workspace options", () => {
    for (const recipe of [
        "npm -w=fixture-package x stryker",
        "npm --workspace fixture-package exec -- stryker run",
        "npm --prefix=fixture x stryker",
    ]) {
        expectFailure(validMakefile.replace("node claim.mjs", recipe), /Stryker/i);
    }
});

test("fails closed for ambiguous, unknown, and incomplete npm package/script forms", () => {
    for (const [recipe, pattern] of [
        ["npm -w missing-package test", /workspace.*unknown|package.*unknown/i],
        ["npm --prefix ../outside run danger", /prefix.*outside|outside.*policy/i],
        ["npm -C ../outside run danger", /prefix.*outside|outside.*policy/i],
        ["npm -C=missing run danger", /prefix.*unknown|package.*unknown/i],
        ["npm -w fixture-package --prefix fixture run danger", /ambiguous|workspace.*prefix/i],
        ["npm -w fixture-package -C fixture run danger", /ambiguous|workspace.*prefix/i],
        ["npm -w fixture-package run", /script.*missing|requires.*script/i],
        ["npm --workspace test", /workspace.*value|subcommand/i],
    ]) {
        const result = evaluate(
            validMakefile.replace("node claim.mjs", recipe),
            validPlans,
            baseContract,
            { packageCatalog: npmFixtureCatalog },
        );
        assert.match(result.failures.join("\n"), pattern, recipe);
    }
});

test("validates npm workspace and prefix selectors for exec forms too", () => {
    for (const [recipe, pattern] of [
        ["npm -w missing-package x harmless", /workspace.*unknown|package.*unknown/i],
        ["npm --prefix ../outside exec harmless", /prefix.*outside|outside.*policy/i],
    ]) {
        const result = evaluate(
            validMakefile.replace("node claim.mjs", recipe),
            validPlans,
            baseContract,
            { packageCatalog: npmFixtureCatalog },
        );
        assert.match(result.failures.join("\n"), pattern, recipe);
    }
});

test("charges npm argument parsing to the command-token work bound", () => {
    const result = evaluate(
        validMakefile.replace(
            "node claim.mjs",
            "npm --workspace fixture-package run danger -- ignored one two three",
        ),
        validPlans,
        {
            ...baseContract,
            bounds: { ...baseContract.bounds, maxCommandTokens: 4 },
        },
        { packageCatalog: npmFixtureCatalog },
    );
    assert.match(result.failures.join("\n"), /maxCommandTokens.*bound/i);
});

for (const recipe of [
    'm=${unused:-make}; "$m" mutation',
    'm=$(printf ma%s ke); "$m" mutation',
    "printf '\\155\\141\\153\\145 mutation\\n' | sh",
    'cmd=ma""ke; eval "$cmd mutation"',
    "npm exec -- bash -lc 'make mutation'",
    "${MAKE_CMD} mutation",
    "$(MAKE:.exe=) mutation",
    'm=ma; n=ke; "$m$n" mutation',
]) {
    test(`fails closed for dynamic Make execution: ${recipe}`, () => {
        expectFailure(
            makefileWithMutation.replace("node claim.mjs", recipe),
            /unaccounted.*Make|unsupported.*(?:Make|shell)|local mutation/i,
        );
    });
}

for (const recipe of [
    'runner=stry""ker; "$runner" run',
    "node node_modules/.bin/stryk?? run",
    "node ./node_modules/@stryk''er-mutator/core/bin/stryk??.js run",
    "npx 'stryk''er' run",
    "npx stryk\\er run",
    "npx str?ker run",
    "npx str[yi]ker run",
    "npx str*ker run",
]) {
    test(`fails closed for obscured Stryker execution: ${recipe}`, () => {
        expectFailure(
            validMakefile.replace("node claim.mjs", recipe),
            /Stryker.*marker|local mutation|unsupported.*shell/i,
        );
    });
}

test("bounds lexical source accounting before scanning arbitrarily long recipes", () => {
    const result = evaluate(
        validMakefile.replace("node claim.mjs", `echo ${"x".repeat(4096)}`),
        validPlans,
        {
            ...baseContract,
            bounds: { ...baseContract.bounds, maxCommandTokens: 4 },
        },
    );
    assert.match(result.failures.join("\n"), /source accounting.*maxCommandTokens.*bound/i);
});

test("fails closed for a dynamic npm package selector", () => {
    const result = evaluate(
        validMakefile.replace("node claim.mjs", 'npm -w "$PACKAGE" run danger'),
        validPlans,
        baseContract,
        { packageCatalog: npmFixtureCatalog },
    );
    assert.match(result.failures.join("\n"), /dynamic shell command|workspace.*unknown/i);
});
