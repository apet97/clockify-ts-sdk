# Contributing to clockify-sdk-ts-115

Thanks for considering a contribution. This repo is the human
onboarding entry; the **canonical contributor + agent contract is
[AGENTS.md](./AGENTS.md)** — every rule there applies to humans
too. Skim it before opening a non-trivial PR.

## Quick start

```bash
git clone https://github.com/apet97/clockify-ts-sdk.git
cd clockify-ts-sdk

npm ci

# Generate the local SDK core into output/ts-sdk/ and sync wrapper/src/.
make sdk-codegen

# Type-check + dual build + verify ESM + CJS surface
npm run type-check -w clockify-sdk-ts-115
npm run build -w clockify-sdk-ts-115
npm run build:smoke -w clockify-sdk-ts-115

# Test (unit tests + live sandbox flows; live ones skip if
# CLOCKIFY_API_KEY / CLOCKIFY_WORKSPACE_ID are absent)
npm test -w clockify-sdk-ts-115
```

For the full build chain (regenerating from the canonical
OpenAPI), see [AGENTS.md §3](./AGENTS.md#3-the-build-chain-top-to-bottom).

## What ships, what doesn't

- ✅ **Hand-written modules** under `wrapper/` root (`index.ts`,
  `create-client.ts`, `composed-fetch.ts`, `iter.ts`, `webhooks.ts`,
  `pagination.ts`) — edit freely; tests in `wrapper/tests/` cover them.
- ❌ **Synced SDK** under `wrapper/src/**` — wiped on every
  `make sdk-codegen`. Don't edit; fix generated shape in the local
  generator (`scripts/generate-sdk-from-openapi.mjs`) or fix API truth
  in the spec-generator at
  [apet97/go-clockify](https://github.com/apet97/go-clockify).
- ❌ **OpenAPI snapshot** at `spec/corrected/clockify.corrected.openapi.yaml`
  — regenerable; edits land in the upstream sources at
  `../GOCLMCP/docs/openapi/sources/**` or in the generator script.

## Local-API testing

The live test suite in `wrapper/tests/sandbox.test.ts` exercises
flows against the real Clockify API. **Never run it against a
production workspace** — CRUD round-trips create + delete real
records.

Set up a sandbox:

```bash
export CLOCKIFY_API_KEY="..."        # from your sandbox workspace
export CLOCKIFY_WORKSPACE_ID="..."   # the sandbox workspace ID
npm test
```

Without these, the live tests skip cleanly and only the deterministic
unit tests run.

## Conventions

### Commit messages

[Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`,
`build:`. Subject ≤ 72 chars. Body wrapped at 72.

```
feat(wrapper): add createClockifyClient() factory

The factory hides the addonToken cast workaround...
```

### Pull requests

- Run `npm run type-check && npm run build && npm run build:smoke
  && npm test && npm pack --dry-run` locally before opening a PR.
- Reference the relevant AGENTS.md section in the description.
- For any spec/runtime discrepancy your change touches, add or
  update an entry in
  [`spec/evidence/discrepancies.md`](./spec/evidence/discrepancies.md)
  using the five-question format.
- The PR template at `.github/pull_request_template.md` has the
  full check-list.

### Code style

- TypeScript strict mode, ES2022 target, NodeNext module resolution.
- 4-space indentation in hand-written modules (matches the synced
  SDK).
- No `console.log` in shipped code. `console.warn` for best-effort
  failures (hook fallbacks). `console.error` only in scripts /
  examples.
- No `it.skip` / `test.skip` / `xit` / `xdescribe` in
  `wrapper/tests/`. Use the env-gated `describe.skip` pattern from
  `tests/sandbox.test.ts` for live tests, but never skip silently.

### Adding a new hand-written module

The exact recipe is in [CLAUDE.md](./CLAUDE.md) under "Where to
look first" → "Add a new hand-written module to the npm surface."
Summary:

1. Drop the `.ts` at `wrapper/` root (outside `src/`).
2. Add it to `tsconfig.json` `include`,
   `tsconfig.esm.json` `include`, `tsconfig.cjs.json` `include`.
3. Add a subpath entry in `package.json` `exports` with both
   `import` and `require` conditions (each with `types` + `default`).
4. Re-export from `wrapper/index.ts` for the one-import-fits-all DX.
5. Add the symbol names to `scripts/verify-dual-build.sh`'s
   `surface` array so the CI smoke catches missing exports.
6. Write tests at `wrapper/tests/<module>.test.ts`.

The twin `tsc` build picks up the new file automatically.

### Deprecating a public symbol

Two-phase soft removal: add the warning in the version that intends
to break, then delete the symbol in the next major.

1. Tag the declaration with a JSDoc `@deprecated` note in the form
   `@deprecated since vX.Y.Z — use <replacement> instead.` Tooling
   (IDE strikethrough, tsdoc, generated docs) picks this up
   automatically.
2. At the runtime entry of the deprecated function, call
   `warnOnce(key, message)` from `clockify-sdk-ts-115/deprecation`:

   ```ts
   import { warnOnce } from "clockify-sdk-ts-115/deprecation";

   /** @deprecated since v0.7.0 — use `newName` instead. */
   export function oldName(...args: A): R {
       warnOnce(
           "oldName",
           "`oldName` is deprecated; use `newName` instead (since v0.7.0)",
       );
       return newName(...args);
   }
   ```

   `key` is an opaque dedup token — typically the deprecated symbol's
   name. Fires `console.warn` at most once per process per key.
   Silent under `NODE_ENV === "test"`.
3. Land the rename in the same commit as the deprecation; the
   `[Unreleased]` CHANGELOG entry goes under **Deprecated** with a
   one-liner pointing to the replacement.
4. Remove the symbol entirely in the next major version. The
   matching CHANGELOG entry goes under **Removed**.

### Releasing a new version

Tag-day checklist. Every step matters; CI gates most of it but the
sequencing is human.

1. **Drain `[Unreleased]`** — every commit since the last tag
   should have a corresponding CHANGELOG entry. Rename the section
   to `[X.Y.Z] — YYYY-MM-DD` (today's date) and create a fresh
   empty `[Unreleased]` above it.
2. **Bump the version** in `wrapper/package.json`. If the bump
   adds public API surface but no breaking changes, it's a SemVer
   minor (`0.6.0 → 0.7.0`). If it changes default behavior or
   removes any export, it's a major (`0.6.0 → 1.0.0` once we
   leave the 0.x line).
3. **Bump `PACKAGE_VERSION`** in `wrapper/composed-fetch.ts` so the
   `User-Agent` header advertises the right version. This is
   manual — there's no build-time substitution.
4. **Run the full chain locally**:
   ```bash
   cd wrapper
   npm run prepublishOnly   # sync + type-check + clean + build + smoke
   npm test                 # 11 files, 152+ unit cases
   npm run test:types       # 12 type assertions
   npm run lint             # eslint clean
   npm run size             # bundle ceilings green
   ```
5. **Open a `chore(release): vX.Y.Z` PR**. Title + body match the
   CHANGELOG entry. Wait for all CI checks to pass — including the
   Node 20 + 22 matrix, CodeQL, Bun smoke, Deno smoke, spec check,
   size, lint, type tests, and the pack snapshot.
6. **Merge** (squash). Pull `main`.
7. **Tag + push** the version:
   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```
   The `release.yml` workflow fires on the tag push and publishes
   to npm with provenance (OIDC), generates an SBOM (SPDX JSON),
   and attaches it to the GitHub release.
8. **Verify on npm**:
   ```bash
   npm view clockify-sdk-ts-115 version  # should be vX.Y.Z
   npm view clockify-sdk-ts-115 dist.signatures  # provenance present
   ```
9. **TypeDoc → Pages** auto-deploys via `docs.yml` on the same
   tag push. Wait ~2 minutes, then verify at the project's
   GitHub Pages URL.

### Debugging tips

- **Live test failures**: `tests/sandbox.test.ts` skips cleanly
  when `CLOCKIFY_API_KEY` / `CLOCKIFY_WORKSPACE_ID` are absent.
  When debugging a live failure, run only that file:
  `npx vitest run tests/sandbox.test.ts -t "<test name>"`. The
  test logs the workspace ID it's hitting; double-check it's a
  sandbox before re-running.
- **Correlating a failure with server logs**: every request
  carries an auto-generated `X-Request-Id`. Catch the error and
  extract it:
  ```ts
  catch (err) {
      console.error("request id:", getRequestIdFromError(err));
  }
  ```
  Forward that ID to Clockify support for fastest triage.
- **Reproducing a sync drift**: if a `wrapper/src/**` change broke
  something, the most reliable repro is to roll the GOCLMCP
  generator back to the prior commit, regen, and `npm run sync`
  to see the old shape side-by-side.
- **Bundle size regression**: `npm run size` shows the current
  size per entrypoint. If it failed, the offending file path is
  in the output — usually it's a stray heavy import in a
  hand-written module.
- **Tarball drift**: `npm pack --dry-run` shows what would ship.
  Diff against `.packsnapshot` (the CI gate) to see the delta.
  Intentional additions: regenerate the snapshot
  (`npm pack --dry-run --json | node -e ... > .packsnapshot`).

## Reporting bugs / requesting features

Use the issue templates at
`.github/ISSUE_TEMPLATE/`. Form-based — they prompt for the SDK
version, Node version, repro, etc., so we don't have to chase
those down in a follow-up.

For **security** issues, follow [SECURITY.md](./SECURITY.md) —
**not** a public issue.

## Code of Conduct

Be kind. Disagree with code, not people. Assume good faith.
Specific incidents → `petkovic.aleksandar037@gmail.com`.
