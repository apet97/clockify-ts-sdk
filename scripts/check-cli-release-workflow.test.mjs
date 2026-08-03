import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateCliReleaseWorkflow, validateReleaseWorkflowInvariants } from "./check-release-dispatch-guard.mjs";

const workflow = readFileSync(
    new URL("../.github/workflows/ci-cli-release.yml", import.meta.url),
    "utf8",
);
const makefile = readFileSync(new URL("../Makefile", import.meta.url), "utf8");

const strictFixture = () => `
name: strict release fixture
on:
  push:
    tags: ["cli-v*.*.*"]
  workflow_dispatch: {}
jobs:
  publish:
    steps:
      - name: Initialize release receipt
        working-directory: .
        run: node scripts/release-state.mjs init --file "$RELEASE_STATE_FILE" --package-name "$PACKAGE_NAME" --version "$PACKAGE_VERSION"
      - name: Pack exact artifact
        working-directory: .
        run: |
          npm pack -w @apet97/clockify-cli-115 --json
          PACKAGE_TARBALL=/tmp/cli.tgz
          LOCAL_INTEGRITY=sha512-local
          REMOTE_INTEGRITY="$(npm view @apet97/clockify-cli-115@\"$PACKAGE_VERSION\" dist.integrity)"
          if [ -n "$REMOTE_INTEGRITY" ] && [ "$LOCAL_INTEGRITY" != "$REMOTE_INTEGRITY" ]; then echo "does not match (integrity_mismatch)"; exit 1; fi
      - name: Registry smoke
        working-directory: .
        run: node scripts/registry-smoke.mjs cli --version "$PACKAGE_VERSION" --timeout-ms 120000
      - name: Proof-only dispatch
        working-directory: .
        run: |
          echo proof_only
          if [ "$GITHUB_EVENT_NAME" = workflow_dispatch ]; then node scripts/release-state.mjs proof-only --file "$RELEASE_STATE_FILE"; fi
      - name: Publish to npm
        if: github.event_name == 'push' && github.ref_type == 'tag'
        working-directory: .
        run: |
          MODE=already_present_matching
          node scripts/release-state.mjs publish --file "$RELEASE_STATE_FILE" --mode=published_now --remote-integrity="$REMOTE_INTEGRITY"
          npm publish "$PACKAGE_TARBALL"
      - name: Finalize release receipt
        if: always()
        working-directory: .
        run: |
          node scripts/release-state.mjs registry-smoke --file "$RELEASE_STATE_FILE" --status=passed
          node scripts/release-state.mjs show --file "$RELEASE_STATE_FILE" > "$RUNNER_TEMP/release-receipt.json"
          printf '%s\\n' proof_only >> "$GITHUB_STEP_SUMMARY"
      - name: Upload release receipt
        if: always()
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a
        with:
          name: release-receipt
          path: "$RELEASE_STATE_FILE"
          if-no-files-found: error
`;

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

test("strict exact-artifact release fixture passes", () => {
    assert.deepEqual(validateReleaseWorkflowInvariants(strictFixture(), { label: "fixture" }), []);
});

test("strict release checker rejects an unguarded publish", () => {
    const failures = validateReleaseWorkflowInvariants(
        strictFixture().replace("if: github.event_name == 'push' && github.ref_type == 'tag'", "if: github.ref_type == 'tag'"),
        { label: "fixture" },
    );
    assert.ok(failures.some((failure) => /external write.*pushed-tag-only/i.test(failure)), failures.join("\n"));
});

test("strict release checker rejects branch dispatch claiming published_now", () => {
    const failures = validateReleaseWorkflowInvariants(
        strictFixture().replace("if: github.event_name == 'push' && github.ref_type == 'tag'", "if: github.event_name == 'workflow_dispatch'"),
        { label: "fixture" },
    );
    assert.ok(failures.some((failure) => /published_now|pushed-tag-only/i.test(failure)), failures.join("\n"));
});

test("strict release checker rejects a root helper with the package cwd", () => {
    const failures = validateReleaseWorkflowInvariants(strictFixture().replace("working-directory: .", "working-directory: cli"), { label: "fixture" });
    assert.ok(failures.some((failure) => /root helper.*working-directory/i.test(failure)), failures.join("\n"));
});

test("strict release checker rejects missing local integrity and mismatch handling", () => {
    const withoutLocal = strictFixture().replace("          LOCAL_INTEGRITY=sha512-local\n", "");
    const localFailures = validateReleaseWorkflowInvariants(withoutLocal, { label: "fixture" });
    assert.ok(localFailures.some((failure) => /local integrity/i.test(failure)), localFailures.join("\n"));

    const withoutMismatch = strictFixture().replace('echo "does not match (integrity_mismatch)"; exit 1;', "echo comparison; exit 1;");
    const mismatchFailures = validateReleaseWorkflowInvariants(withoutMismatch, { label: "fixture" });
    assert.ok(mismatchFailures.some((failure) => /mismatch/i.test(failure)), mismatchFailures.join("\n"));
});

test("strict release checker rejects missing receipt upload and arbitrary always steps", () => {
    const withoutUpload = strictFixture().replace(/      - name: Upload release receipt[\s\S]*?          path: \"\$RELEASE_STATE_FILE\"\n/, "");
    const uploadFailures = validateReleaseWorkflowInvariants(withoutUpload, { label: "fixture" });
    assert.ok(uploadFailures.some((failure) => /receipt must be uploaded/i.test(failure)), uploadFailures.join("\n"));

    const withArbitraryAlways = `${strictFixture()}\n      - name: Unnamed cleanup\n        if: always()\n        run: true\n`;
    const alwaysFailures = validateReleaseWorkflowInvariants(withArbitraryAlways, { label: "fixture" });
    assert.ok(alwaysFailures.some((failure) => /arbitrary if: always/i.test(failure)), alwaysFailures.join("\n"));
});

test("strict release checker rejects a receipt upload that silently ignores missing files", () => {
    const withoutMissingFileGuard = strictFixture().replace("          if-no-files-found: error\n", "");
    const failures = validateReleaseWorkflowInvariants(withoutMissingFileGuard, { label: "fixture" });
    assert.ok(failures.some((failure) => /receipt upload.*missing/i.test(failure)), failures.join("\n"));
});

test("strict release checker requires a bounded shared registry smoke", () => {
    const failures = validateReleaseWorkflowInvariants(strictFixture().replace(" --timeout-ms 120000", " --retries 0"), { label: "fixture" });
    assert.ok(failures.some((failure) => /registry smoke.*timeout/i.test(failure)), failures.join("\n"));
});

test("strict release checker rejects a branch ref used as the package version", () => {
    const failures = validateReleaseWorkflowInvariants(strictFixture().replace("\"$PACKAGE_VERSION\" --timeout-ms", '"$GITHUB_REF_NAME" --timeout-ms'), { label: "fixture" });
    assert.ok(failures.some((failure) => /manifest version|branch\/tag ref/i.test(failure)), failures.join("\n"));
});
