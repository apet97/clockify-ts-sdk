import assert from "node:assert/strict";
import test from "node:test";

import { validateRequiredMakeStepGroups } from "./generator-config-contract.mjs";

const required = [
    ["sdk-codegen"],
    ["sdk-codegen-drift", "sdk-codegen-test", "generated-edit-check"],
];

const validPlan = [
    { command: "make", args: ["sdk-codegen"] },
    {
        command: "make",
        args: ["sdk-codegen-drift", "sdk-codegen-test", "generated-edit-check"],
        env: { CLOCKIFY_ALLOW_GENERATED_DIFF: "1" },
    },
    { command: "npm", args: ["test"] },
];

function failures(commands) {
    return validateRequiredMakeStepGroups({
        commands,
        expectedGroups: required,
        label: "fastRunner.requiredMakeStepGroups",
    });
}

test("accepts the exact two codegen make groups from plan data", () => {
    assert.deepEqual(failures(validPlan), []);
});

test("rejects a removed codegen make group", () => {
    assert.match(failures(validPlan.slice(1)).join("\n"), /\[0\].*sdk-codegen/i);
});

test("rejects reordered codegen make groups", () => {
    assert.match(failures([validPlan[1], validPlan[0]]).join("\n"), /\[0\].*sdk-codegen/i);
});

test("rejects merged codegen make groups", () => {
    assert.match(
        failures([{ command: "make", args: required.flat() }]).join("\n"),
        /\[0\].*sdk-codegen/i,
    );
});

test("rejects drift inside either codegen make group", () => {
    assert.match(
        failures([
            validPlan[0],
            {
                ...validPlan[1],
                args: ["sdk-codegen-test", "sdk-codegen-drift", "generated-edit-check"],
            },
        ]).join("\n"),
        /\[1\].*sdk-codegen-drift/i,
    );
});
