// Shape and wiring rules for docs/build-determinism-contract.json.
//
// Until 2026-07-28 that contract was read by nothing: check-build-determinism.mjs
// hardcoded the package name and the dist path, so `scope` and `requiredBehavior`
// were decorative prose that could contradict the checker indefinitely. The
// contract now supplies the checker's two real inputs — which workspace to build
// and which tree to hash — so editing it changes behaviour rather than nothing.
export const CONTRACT_PATH = "docs/build-determinism-contract.json";

/** The build inputs the checker takes from the contract. Throws on a bad shape. */
export function resolveBuildDeterminismConfig(contract) {
    const failures = validateContractShape(contract);
    if (failures.length > 0) {
        throw new Error(`${CONTRACT_PATH} is unusable:\n- ${failures.join("\n- ")}`);
    }
    return {
        packageName: contract.scope.package,
        artifactTree: contract.scope.artifactTree,
    };
}

function validateContractShape(contract) {
    const failures = [];
    if (contract?.schemaVersion !== 1) failures.push("schemaVersion must be 1");
    const scope = contract?.scope;
    if (typeof scope?.package !== "string" || scope.package.length === 0) {
        failures.push("scope.package must be a non-empty workspace name");
    }
    if (typeof scope?.artifactTree !== "string" || scope.artifactTree.length === 0) {
        failures.push("scope.artifactTree must be a non-empty repo-relative path");
    } else if (scope.artifactTree.startsWith("/") || scope.artifactTree.includes("..")) {
        failures.push("scope.artifactTree must be a repo-relative path without ..");
    }
    if (!Array.isArray(contract?.requiredBehavior) || contract.requiredBehavior.length === 0) {
        failures.push("requiredBehavior must list at least one behaviour");
    }
    if (typeof contract?.wiring?.makeTarget !== "string" || !contract.wiring.makeTarget) {
        failures.push("wiring.makeTarget must name a Makefile target");
    }
    if (typeof contract?.wiring?.checker !== "string" || !contract.wiring.checker) {
        failures.push("wiring.checker must name the enforcing script");
    }
    if (typeof contract?.wiring?.fullGateOnly !== "boolean") {
        failures.push("wiring.fullGateOnly must be a boolean");
    }
    return failures;
}

/**
 * Wiring rules that need the repo around them: the checker exists, the make
 * target runs it, and `fullGateOnly` matches where the verify plan actually
 * schedules the gate. The verify plan — not the Makefile layout — owns aggregate
 * membership, so that is what gets asked.
 */
export function validateBuildDeterminismContract({
    contract,
    makefile,
    fastTargets,
    fullTargets,
    fileExists,
}) {
    const failures = validateContractShape(contract);
    if (failures.length > 0) return failures;

    const { makeTarget, checker, fullGateOnly } = contract.wiring;
    if (!fileExists(checker)) failures.push(`wiring.checker ${checker} does not exist`);

    const lines = makefile.split("\n");
    const index = lines.findIndex((line) => line.startsWith(`${makeTarget}:`));
    if (index === -1) {
        failures.push(`Makefile has no ${makeTarget} target`);
    } else {
        const recipe = [];
        for (
            let cursor = index + 1;
            cursor < lines.length && lines[cursor].startsWith("\t");
            cursor += 1
        ) {
            recipe.push(lines[cursor]);
        }
        if (!recipe.some((line) => line.includes(checker))) {
            failures.push(`Makefile target ${makeTarget} must run ${checker}`);
        }
    }

    const inFast = fastTargets.some((args) => args.includes(makeTarget));
    const inFull = fullTargets.some((args) => args.includes(makeTarget));
    if (!inFull) failures.push(`${makeTarget} must be scheduled in the full verify phase`);
    if (fullGateOnly && inFast) {
        failures.push(`${makeTarget} is declared fullGateOnly but the fast phase schedules it`);
    }
    if (!fullGateOnly && !inFast) {
        failures.push(`${makeTarget} is not fullGateOnly but the fast phase omits it`);
    }
    return failures;
}
