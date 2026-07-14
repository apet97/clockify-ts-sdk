import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateCliReleaseWorkflow } from "./check-release-dispatch-guard.mjs";

const workflow = readFileSync(
    new URL("../.github/workflows/ci-cli-release.yml", import.meta.url),
    "utf8",
);
const makefile = readFileSync(new URL("../Makefile", import.meta.url), "utf8");

test("CLI release builds its SDK dependency on exact Node 22.13.0", () => {
    assert.deepEqual(validateCliReleaseWorkflow(workflow), []);
});

test("checker rejects a CLI release that only generates the SDK", () => {
    const failures = validateCliReleaseWorkflow(
        workflow.replace("          npm run build -w clockify-sdk-ts-115\n", ""),
    );
    assert.ok(failures.some((failure) => /SDK dependency proof.*build/i.test(failure)));
});

test("checker rejects a floating CLI release runtime", () => {
    const failures = validateCliReleaseWorkflow(
        workflow.replace('          node-version: "22.13.0"', '          node-version: "22"'),
    );
    assert.ok(failures.some((failure) => /exact Node 22\.13\.0/i.test(failure)));
});

test("make ci-contract runs the CLI release regression tests", () => {
    const start = makefile.indexOf("ci-contract:");
    const end = makefile.indexOf("\n\nlive-safety:", start);
    assert.match(
        makefile.slice(start, end),
        /node --test scripts\/check-cli-release-workflow\.test\.mjs/,
    );
});
