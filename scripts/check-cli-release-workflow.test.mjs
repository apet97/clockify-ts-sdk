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
jobs:
  publish:
    steps:
      - name: Checkout
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          fetch-depth: 0
      - name: Initialize release receipt
        working-directory: .
        run: node scripts/release-state.mjs init --file "$RELEASE_STATE_FILE" --package-name "$PACKAGE_NAME" --version "$PACKAGE_VERSION"
      - name: Verify release source is on origin/main
        working-directory: .
        run: |
          if [ "$GITHUB_EVENT_NAME" != "push" ] || [ "$GITHUB_REF_TYPE" != "tag" ]; then
            echo "::error::Release workflow requires a pushed tag"
            exit 1
          fi
          if ! git merge-base --is-ancestor "$GITHUB_SHA" refs/remotes/origin/main; then
            echo "::error::Release tag commit $GITHUB_SHA is not reachable from origin/main"
            exit 1
          fi
      - name: Generate and verify the SDK
        working-directory: .
        run: |
          make sdk-codegen
          make sdk-codegen-drift sdk-codegen-test
      - name: Run release-blocking contract proof
        working-directory: .
        run: make contract-gates
      - name: Run release-blocking compatibility proof
        working-directory: .
        run: make release-proof
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
          printf '%s\\n' release_receipt_finalized >> "$GITHUB_STEP_SUMMARY"
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

test("checker rejects a CLI release without SDK drift and fixture proof", () => {
    const failures = validateCliReleaseWorkflow(
        workflow.replace("          make sdk-codegen-drift sdk-codegen-test\n", ""),
    );
    assert.ok(
        failures.some((failure) => /SDK dependency proof.*sdk-codegen-drift|SDK generation proof.*sdk-codegen-drift/i.test(failure)),
        failures.join("\n"),
    );
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

test("release-proof owns one shared breaking type-check for its two consumers", () => {
    assert.match(
        makefile,
        /^release-proof: breaking-typecheck operation-coverage-run breaking-change-review-run consumer-cast-budget-run$/m,
    );
    assert.match(makefile, /^breaking-change-review-run:$/m);
    assert.match(makefile, /^consumer-cast-budget-run:$/m);
    assert.equal(
        makefile.match(/^\tnpm run type-check:breaking -w clockify-sdk-ts-115$/gm)?.length,
        1,
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

test("strict release checker rejects an unguarded step claiming published_now", () => {
    const failures = validateReleaseWorkflowInvariants(
        strictFixture().replace("if: github.event_name == 'push' && github.ref_type == 'tag'", "if: github.event_name == 'push'"),
        { label: "fixture" },
    );
    assert.ok(failures.some((failure) => /published_now|pushed-tag-only/i.test(failure)), failures.join("\n"));
});

test("strict release checker rejects a root helper with the package cwd", () => {
    const failures = validateReleaseWorkflowInvariants(
        strictFixture().replace(
            "      - name: Initialize release receipt\n        working-directory: .",
            "      - name: Initialize release receipt\n        working-directory: cli",
        ),
        { label: "fixture" },
    );
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

test("strict release checker requires full history and canonical main ancestry", () => {
    const shallowFailures = validateReleaseWorkflowInvariants(
        strictFixture().replace("          fetch-depth: 0\n", "          fetch-depth: 1\n"),
        { label: "fixture" },
    );
    assert.ok(
        shallowFailures.some((failure) => /fetch-depth: 0/i.test(failure)),
        shallowFailures.join("\n"),
    );

    const ancestryFailures = validateReleaseWorkflowInvariants(
        strictFixture().replace(
            'git merge-base --is-ancestor "$GITHUB_SHA" refs/remotes/origin/main',
            "git rev-parse HEAD",
        ),
        { label: "fixture" },
    );
    assert.ok(
        ancestryFailures.some((failure) => /ancestry guard/i.test(failure)),
        ancestryFailures.join("\n"),
    );
});

test("strict release checker requires release-proof before exact packing", () => {
    const failures = validateReleaseWorkflowInvariants(
        strictFixture().replace("        run: make release-proof\n", "        run: make perfect-fast\n"),
        { label: "fixture" },
    );
    assert.ok(
        failures.some((failure) => /make release-proof/i.test(failure)),
        failures.join("\n"),
    );
});

test("strict release checker requires contract-gates before release-proof", () => {
    const missing = validateReleaseWorkflowInvariants(
        strictFixture().replace("        run: make contract-gates\n", "        run: make perfect-fast\n"),
        { label: "fixture" },
    );
    assert.ok(missing.some((failure) => /make contract-gates/i.test(failure)), missing.join("\n"));

    const contractStart = strictFixture().indexOf("      - name: Run release-blocking contract proof");
    const compatibilityStart = strictFixture().indexOf(
        "      - name: Run release-blocking compatibility proof",
    );
    const packStart = strictFixture().indexOf("      - name: Pack exact artifact");
    const fixture = strictFixture();
    const contractStep = fixture.slice(contractStart, compatibilityStart);
    const withoutContract = fixture.slice(0, contractStart) + fixture.slice(compatibilityStart);
    const moved = withoutContract.slice(0, packStart - contractStep.length) + contractStep + withoutContract.slice(packStart - contractStep.length);
    const reordered = validateReleaseWorkflowInvariants(moved, { label: "fixture" });
    assert.ok(
        reordered.some((failure) => /contract-gates must precede make release-proof/i.test(failure)),
        reordered.join("\n"),
    );
});
