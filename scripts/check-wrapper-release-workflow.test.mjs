import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateWrapperReleaseWorkflow } from "./check-release-dispatch-guard.mjs";

const workflow = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");

test("wrapper release is tag-only with guarded external writes", () => {
    assert.doesNotMatch(workflow, /workflow_dispatch/);
    assert.equal(
        workflow.split("if: github.event_name == 'push' && github.ref_type == 'tag'").length - 1,
        2,
    );
    assert.deepEqual(validateWrapperReleaseWorkflow(workflow), []);
});

test("wrapper release rejects workflow_dispatch on the publish-capable workflow", () => {
    const broken = workflow.replace(
        '      - "wrapper-v*.*.*"\n',
        '      - "wrapper-v*.*.*"\n  workflow_dispatch: {}\n',
    );
    assert.notEqual(broken, workflow);
    const failures = validateWrapperReleaseWorkflow(broken);
    assert.ok(failures.some((failure) => /triggered only by pushed tags/i.test(failure)), failures.join("\n"));
});

test("wrapper release rejects branch triggers and broadened tag patterns", () => {
    const withBranch = workflow.replace(
        '      - "wrapper-v*.*.*"\n',
        '      - "wrapper-v*.*.*"\n    branches:\n      - main\n',
    );
    const branchFailures = validateWrapperReleaseWorkflow(withBranch);
    assert.ok(branchFailures.some((failure) => /only by pushed tags/i.test(failure)), branchFailures.join("\n"));

    const broadTag = workflow.replace('"wrapper-v*.*.*"', '"*"');
    const tagFailures = validateWrapperReleaseWorkflow(broadTag);
    assert.ok(tagFailures.some((failure) => /tag trigger must be exactly/i.test(failure)), tagFailures.join("\n"));
});

test("wrapper release refuses a tag commit outside origin/main", () => {
    const broken = workflow.replace(
        'git merge-base --is-ancestor "$GITHUB_SHA" refs/remotes/origin/main',
        "git rev-parse HEAD",
    );
    const failures = validateWrapperReleaseWorkflow(broken);
    assert.ok(failures.some((failure) => /ancestry guard/i.test(failure)), failures.join("\n"));
});

test("wrapper release rejects an ancestry command hidden in dead shell", () => {
    const broken = workflow.replace(
        '          if ! git merge-base --is-ancestor "$GITHUB_SHA" refs/remotes/origin/main; then\n' +
            '            echo "::error::Release tag commit $GITHUB_SHA is not reachable from origin/main"\n' +
            "            exit 1\n" +
            "          fi",
        "          if false; then\n" +
            '            git merge-base --is-ancestor "$GITHUB_SHA" refs/remotes/origin/main\n' +
            "          fi",
    );
    assert.notEqual(broken, workflow);
    const failures = validateWrapperReleaseWorkflow(broken);
    assert.ok(
        failures.some((failure) => /canonical executable guard/i.test(failure)),
        failures.join("\n"),
    );
});

test("wrapper release cannot echo instead of running release-proof", () => {
    const failures = validateWrapperReleaseWorkflow(
        workflow.replace("run: make release-proof", "run: echo 'make release-proof'"),
    );
    assert.ok(failures.some((failure) => /execute only make release-proof/i.test(failure)), failures.join("\n"));
});

test("wrapper release cannot skip or fake the contract gates", () => {
    const failures = validateWrapperReleaseWorkflow(
        workflow.replace("run: make contract-gates", "run: echo 'make contract-gates'"),
    );
    assert.ok(
        failures.some((failure) => /execute only make contract-gates/i.test(failure)),
        failures.join("\n"),
    );
});

test("wrapper release rejects a second job even when the canonical job is intact", () => {
    const broken = `${workflow}\n  unguarded-write:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Unguarded publish bypass\n        run: npm publish\n`;
    const failures = validateWrapperReleaseWorkflow(broken);
    assert.ok(failures.some((failure) => /exactly one job/i.test(failure)), failures.join("\n"));
    assert.ok(failures.some((failure) => /external write.*pushed-tag-only/i.test(failure)), failures.join("\n"));
});

test("wrapper release classifies an unguarded gh api POST as an external write", () => {
    const broken = workflow.replace(
        "        run: npm ci\n",
        "        run: |\n          npm ci\n          gh api --method POST repos/example/example/releases\n",
    );
    assert.notEqual(broken, workflow);
    const failures = validateWrapperReleaseWorkflow(broken);
    assert.ok(failures.some((failure) => /external write.*pushed-tag-only/i.test(failure)), failures.join("\n"));
});

test("wrapper release requires SDK drift and generator fixture proof", () => {
    const failures = validateWrapperReleaseWorkflow(
        workflow.replace("          make sdk-codegen-drift sdk-codegen-test\n", ""),
    );
    assert.ok(failures.some((failure) => /SDK generation proof.*sdk-codegen-drift/i.test(failure)), failures.join("\n"));
});

test("wrapper release initializes its receipt before the source guard", () => {
    const guardStart = workflow.indexOf("\n      - name: Verify release source is on origin/main");
    const guardEnd = workflow.indexOf("\n      - name: Install workspaces (root)", guardStart);
    const initStart = workflow.indexOf("\n      - name: Initialize release receipt");
    assert.ok(initStart >= 0 && guardStart > initStart && guardEnd > guardStart);
    const guard = workflow.slice(guardStart, guardEnd);
    const withoutGuard = workflow.slice(0, guardStart) + workflow.slice(guardEnd);
    const movedInitStart = withoutGuard.indexOf("\n      - name: Initialize release receipt");
    const broken = withoutGuard.slice(0, movedInitStart) + guard + withoutGuard.slice(movedInitStart);
    const failures = validateWrapperReleaseWorkflow(broken);
    assert.ok(failures.some((failure) => /receipt.*before.*source guard/i.test(failure)), failures.join("\n"));
});

test("wrapper release rejects a named receipt initializer that only echoes init", () => {
    const broken = workflow.replace(
        "          node scripts/release-state.mjs init \\\n",
        "          echo 'node scripts/release-state.mjs init' \\\n",
    );
    assert.notEqual(broken, workflow);
    const failures = validateWrapperReleaseWorkflow(broken);
    assert.ok(failures.some((failure) => /initializer.*actively run/i.test(failure)), failures.join("\n"));
});
