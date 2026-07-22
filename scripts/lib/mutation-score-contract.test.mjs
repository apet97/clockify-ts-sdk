import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

import { validateMutationModuleFloorScope } from "./mutation-score-contract.mjs";

const contract = JSON.parse(
    readFileSync(new URL("../../docs/mutation-score-contract.json", import.meta.url), "utf8"),
);
const wrapperStryker = JSON.parse(
    readFileSync(new URL("../../wrapper/stryker.conf.json", import.meta.url), "utf8"),
);
const NO_CALIBRATION_PENDING = Symbol("no calibration pending");

function wrapperModuleFloors(overrides = {}) {
    return {
        ...contract.packages.find((entry) => entry.id === "wrapper").moduleFloors,
        ...overrides,
    };
}

function uncalibratedWrapperFloors(overrides = {}) {
    return wrapperModuleFloors({
        "wrapper/ensure.ts": 1,
        "wrapper/invoice-body.ts": 1,
        ...overrides,
    });
}

function wrapperCalibrationPending() {
    return contract.packages.find((entry) => entry.id === "wrapper").calibrationPending;
}

function validate(
    moduleFloors,
    mutate = wrapperStryker.mutate,
    calibrationPending = wrapperCalibrationPending(),
) {
    return validateMutationModuleFloorScope({
        packageId: "wrapper",
        moduleFloors,
        mutate,
        ...(calibrationPending === NO_CALIBRATION_PENDING ? {} : { calibrationPending }),
        sourceExists(filePath) {
            try {
                return statSync(new URL(`../../${filePath}`, import.meta.url)).isFile();
            } catch {
                return false;
            }
        },
    });
}

test("the wrapper floor contract exactly matches its positive Stryker source scope", () => {
    assert.deepEqual(validate(wrapperModuleFloors()), []);
});

test("the wrapper floor contract rejects missing authenticated mutation sources", () => {
    const floors = wrapperModuleFloors();
    delete floors["wrapper/create-client.ts"];

    assert.deepEqual(validate(floors), [
        "wrapper.moduleFloors: missing active mutate source wrapper/create-client.ts",
    ]);
});

test("the wrapper floor contract rejects authenticated module-floor extras", () => {
    assert.deepEqual(
        validate(wrapperModuleFloors({ "wrapper/internal/authenticated-boundary-fetch-copy.ts": 87 })),
        [
            "wrapper.moduleFloors: source path wrapper/internal/authenticated-boundary-fetch-copy.ts does not exist as a file",
            "wrapper.moduleFloors: floor path wrapper/internal/authenticated-boundary-fetch-copy.ts is not an active mutate source",
        ],
    );
});

test("the wrapper floor contract rejects duplicate, empty, and non-source mutate entries", () => {
    const duplicate = validate(wrapperModuleFloors(), [
        ...wrapperStryker.mutate,
        "wrapper/create-client.ts",
    ]);
    assert.ok(
        duplicate.some((failure) =>
            /duplicate positive source path wrapper\/create-client\.ts$/.test(failure),
        ),
    );

    const empty = validate(wrapperModuleFloors(), ["!wrapper/tests/**"]);
    assert.ok(empty.includes("wrapper.mutate: must include at least one positive source path"));

    const nonSource = validate(wrapperModuleFloors(), ["wrapper/tests/create-client.test.ts"]);
    assert.ok(
        nonSource.includes(
            "wrapper.mutate[0]: must be a repo-relative hand-written TypeScript source path",
        ),
    );
});

test("the wrapper floor contract rejects a nonexistent source even when its floor matches", () => {
    const phantom = "wrapper/internal/nonexistent-authenticated-boundary.ts";
    const failures = validate(wrapperModuleFloors({ [phantom]: 87 }), [
        ...wrapperStryker.mutate,
        phantom,
    ]);

    assert.ok(
        failures.includes(
            `wrapper.mutate[${wrapperStryker.mutate.length}]: source path ${phantom} does not exist as a file`,
        ),
    );
    assert.ok(
        failures.includes(`wrapper.moduleFloors: source path ${phantom} does not exist as a file`),
    );
});

test("the wrapper floor contract rejects exact and broad exclusions of governed sources", () => {
    for (const [exclusion, governedSource] of [
        ["!wrapper/create-client.ts", "wrapper/create-client.ts"],
        ["!wrapper/**", "wrapper/composed-fetch.ts"],
    ]) {
        const failures = validate(wrapperModuleFloors(), [...wrapperStryker.mutate, exclusion]);
        assert.ok(
            failures.includes(
                `wrapper.mutate[${wrapperStryker.mutate.length}]: exclusion ${exclusion.slice(1)} overlaps governed positive source ${governedSource}`,
            ),
            failures.join("\n"),
        );
    }
});

test("the wrapper floor contract rejects an exclusion outside its package", () => {
    const failures = validate(wrapperModuleFloors(), [...wrapperStryker.mutate, "!mcp/**"]);
    assert.ok(
        failures.includes(
            `wrapper.mutate[${wrapperStryker.mutate.length}]: exclusion must stay within wrapper/`,
        ),
        failures.join("\n"),
    );
});

test("the wrapper floor contract rejects parent-segment paths disguised as package-local", () => {
    const disguisedSource = "wrapper/../mcp/src/result.ts";
    const sourceFailures = validate(wrapperModuleFloors({ [disguisedSource]: 68 }), [
        ...wrapperStryker.mutate,
        disguisedSource,
    ]);
    assert.ok(
        sourceFailures.includes(
            `wrapper.mutate[${wrapperStryker.mutate.length}]: must be a repo-relative hand-written TypeScript source path`,
        ),
        sourceFailures.join("\n"),
    );

    const exclusionFailures = validate(wrapperModuleFloors(), [
        ...wrapperStryker.mutate,
        "!wrapper/../mcp/**",
    ]);
    assert.ok(
        exclusionFailures.includes(
            `wrapper.mutate[${wrapperStryker.mutate.length}]: exclusion must be a repo-relative path`,
        ),
        exclusionFailures.join("\n"),
    );
});

test("the wrapper floor contract permits zero floors only through exact calibration pending sources", () => {
    const source = "wrapper/create-client.ts";
    const zeroFloors = uncalibratedWrapperFloors({ [source]: 0 });

    assert.deepEqual(validate(zeroFloors, wrapperStryker.mutate, NO_CALIBRATION_PENDING), [
        `wrapper.moduleFloors.${source}: floor 0 requires calibrationPending to name this source`,
    ]);
    assert.deepEqual(validate(zeroFloors, wrapperStryker.mutate, []), [
        "wrapper.calibrationPending: must be a non-empty array when module floors contain zero",
        `wrapper.moduleFloors.${source}: floor 0 requires calibrationPending to name this source`,
    ]);
    assert.deepEqual(validate(zeroFloors, wrapperStryker.mutate, [source]), []);
});

test("the wrapper floor contract rejects malformed, duplicate, inactive, and nonzero calibration pending sources", () => {
    const source = "wrapper/create-client.ts";
    const positiveFloors = uncalibratedWrapperFloors();
    const zeroFloors = uncalibratedWrapperFloors({ [source]: 0 });

    assert.deepEqual(validate(zeroFloors, wrapperStryker.mutate, "not-an-array"), [
        "wrapper.calibrationPending: must be a non-empty array when module floors contain zero",
        `wrapper.moduleFloors.${source}: floor 0 requires calibrationPending to name this source`,
    ]);
    assert.deepEqual(validate(zeroFloors, wrapperStryker.mutate, [source, source]), [
        `wrapper.calibrationPending[1]: duplicate source path ${source}`,
    ]);
    assert.deepEqual(validate(positiveFloors, wrapperStryker.mutate, [source]), [
        `wrapper.calibrationPending[0]: source path ${source} must have floor 0`,
    ]);
    assert.deepEqual(validate(zeroFloors, wrapperStryker.mutate, ["wrapper/unknown.ts"]), [
        "wrapper.calibrationPending[0]: source path wrapper/unknown.ts is not an active mutate source",
        "wrapper.calibrationPending[0]: source path wrapper/unknown.ts must have floor 0",
        `wrapper.moduleFloors.${source}: floor 0 requires calibrationPending to name this source`,
    ]);
});
