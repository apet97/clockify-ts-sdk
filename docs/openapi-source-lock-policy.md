# OpenAPI Source Lock Policy

`docs/openapi-source-lock.json` binds the corrected OpenAPI snapshot in this
repository to one exact, publicly resolvable upstream commit in
`apet97/go-clockify`. It exists so that "what commit is our snapshot derived
from" is an answerable, checkable question instead of an implicit claim in a
roadmap receipt.

## What the lock records

Shape is defined in `docs/openapi-source-lock.schema.json` and enforced
offline by `scripts/lib/openapi-source-lock.mjs`:

- `repositoryUrl` — an HTTPS `github.com/<owner>/<repo>` URL. No other host,
  no embedded credentials.
- `commit` — the full 40-character lowercase hex commit SHA. Never a branch
  (`main`), a tag, or a short SHA — those are mutable or ambiguous pointers,
  not locks.
- `sourcePath` — the canonical OpenAPI document's path within that repository.
- `sourceBytes` / `sourceSha256` — the exact byte length and SHA-256 of that
  file at the locked commit.
- `composerPath` — the generator/composer tool's path within that repository.
  Always required: it is what a verifier fetches.
- `composerVersion` **or** `composerSha256` — exactly one. `composerVersion`
  is a declarative pointer (not independently checkable by hash);
  `composerSha256` is a verifiable content hash of the file at `composerPath`.
- `approvedBy` / `approvedAt` — the human approval identity and date. This is
  the `H01-LOCK` checkpoint: a coding agent may verify these values are real
  and publicly fetchable, but may never invent, infer, or self-approve them.

## Two layers of proof

1. **Shape** (`scripts/lib/openapi-source-lock.mjs`, exercised by
   `scripts/openapi-source-lock.test.mjs`) — pure, deterministic, no network
   access. Rejects malformed values: wrong-length hashes, branch/tag names in
   `commit`, absolute or parent-traversing paths, placeholder text, and
   supplying both or neither composer pin form.
2. **Network** (`scripts/lib/openapi-source-lock-verify.mjs`, exercised
   offline by `scripts/openapi-source-lock-verify.test.mjs` via an injected
   fetcher, and for real by `make openapi-source-lock` /
   `scripts/verify-openapi-source-lock.mjs`) — fetches the exact commit
   through immutable, commit-addressed GitHub URLs
   (`raw.githubusercontent.com/<owner>/<repo>/<commit>/<path>`) plus a
   repository/commit existence check via the GitHub commits API, and
   confirms byte count, SHA-256, and composer identity against what the lock
   claims. Any redirect, non-2xx response, or mismatch fails closed.

`make openapi-source-lock` is a **networked proof, not part of ordinary
offline verification** (`contract-gates`, `perfect-fast`, `perfect-full`).
Run it manually, in scheduled contract monitoring, or before a release
candidate that changes the lock — never assume it ran just because
`perfect-fast` was green.

The verifier prints only safe metadata: check labels, pass/fail, byte counts,
and hash values. It never prints raw file contents or credentials.

## Changing the lock

Only a human may approve a new `commit` (or a repository/path change) —
that is `H01-LOCK`. To change the lock:

1. Land the upstream change in `apet97/go-clockify` first.
2. Gather candidate values (repository URL, full commit SHA, source path,
   byte count, SHA-256, composer identity) and verify them independently
   against the public GitHub remote — a raw-content fetch and a commits-API
   lookup, not just local git objects.
3. Get explicit human approval of those exact values (identity + date).
4. Write `docs/openapi-source-lock.json`, run `node --test
   scripts/openapi-source-lock.test.mjs scripts/openapi-source-lock-verify.test.mjs`,
   then `make openapi-source-lock` for the real networked proof.

Downstream snapshot synchronization (`spec/corrected/clockify.corrected.openapi.yaml`)
consumes only this verified lock — never an ambient `../GOCLMCP` sibling
checkout as release authority.
