import assert from "node:assert/strict";
import test from "node:test";

import {
    REQUIRED_BREAKING_CHANGE_MAPPINGS,
    validateRequiredBreakingChanges,
} from "./lib/breaking-change-mappings.mjs";

function validMappings() {
    return REQUIRED_BREAKING_CHANGE_MAPPINGS.map((mapping) => ({ ...mapping }));
}

for (const required of REQUIRED_BREAKING_CHANGE_MAPPINGS) {
    test(`rejects omission of removed symbol ${required.removed}`, () => {
        const failures = validateRequiredBreakingChanges(
            validMappings().filter((mapping) => mapping.removed !== required.removed),
        );
        assert.match(failures.join("\n"), new RegExp(`missing.*${required.removed}`, "i"));
    });

    test(`rejects omission of replacement for ${required.removed}`, () => {
        const mappings = validMappings();
        const mapping = mappings.find((candidate) => candidate.removed === required.removed);
        assert.ok(mapping);
        delete mapping.replacement;
        const failures = validateRequiredBreakingChanges(mappings);
        assert.match(failures.join("\n"), new RegExp(`${required.removed}.*replacement`, "i"));
    });
}

test("accepts the exact Task 6 migration mapping", () => {
    assert.deepEqual(validateRequiredBreakingChanges(validMappings()), []);
});
