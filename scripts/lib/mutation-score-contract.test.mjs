import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateMutationModuleFloorScope } from "./mutation-score-contract.mjs";

const contract = JSON.parse(
    readFileSync(new URL("../../docs/mutation-score-contract.json", import.meta.url), "utf8"),
);
const wrapperStryker = JSON.parse(
    readFileSync(new URL("../../wrapper/stryker.conf.json", import.meta.url), "utf8"),
);

function wrapperModuleFloors(overrides = {}) {
    return {
        ...contract.packages.find((entry) => entry.id === "wrapper").moduleFloors,
        ...overrides,
    };
}

function validate(moduleFloors, mutate = wrapperStryker.mutate) {
    return validateMutationModuleFloorScope({
        packageId: "wrapper",
        moduleFloors,
        mutate,
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
