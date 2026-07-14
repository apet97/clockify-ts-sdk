import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const packageLock = JSON.parse(
    readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
);

test("the hoisted Vitest runtime has a matching root coverage provider", () => {
    const vitestVersion = packageLock.packages["node_modules/vitest"]?.version;
    const coverageVersion = packageLock.packages["node_modules/@vitest/coverage-v8"]?.version;

    assert.equal(
        packageJson.devDependencies?.["@vitest/coverage-v8"],
        packageJson.overrides?.vitest,
        "root devDependencies must keep the coverage provider aligned with hoisted Vitest",
    );
    assert.ok(coverageVersion, "package-lock must install @vitest/coverage-v8 at the root");
    assert.equal(coverageVersion, vitestVersion, "Vitest and its root coverage provider must match");
});
