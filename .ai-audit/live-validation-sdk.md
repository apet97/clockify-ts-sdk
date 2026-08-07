# Live SDK Correctness Validation — 2026-08-06

> Subagent 1 of 5 — Live SDK Correctness Validator.
> Scope: W-01, W-02, W-03, W-05, W-08, S-01, S-02 (read-only + live GET).
> Credentials: sacrificial workspace `65b382b606de527a7ee2b60e` (key material not logged).
> Evidence JSON: `/tmp/live-sdk-evidence.json`.

---

## 00 Snapshot

| Field | Value |
|---|---|
| Date (UTC) | 2026-08-06T02:31:50.065Z |
| Git HEAD | `49462f5471eb113ed812e7494bfe0808714d3775` |
| Node | v26.0.0 |
| Workspace | `65b382b606de527a7ee2b60e` (sacrificial) |
| API base | `https://api.clockify.me/api/v1` |
| Spec file | `spec/corrected/clockify.corrected.openapi.yaml` |
| Spec sha256 | `abebc8260c9366769298ee6c8fb609b76b1ea80a9b4924dca8b2330def67a2d0` |
| Spec bytes | 764551 |
| Lock commit | `1dc0392c6a36fe5f636848d7ea0ef5c62bb83c84` |
| Lock sha256 | `aa59a0766bd9043bf634f9cfe09b01c8fb7e86871900b2c26409490de67e9f70` |
| Lock bytes | 736890 |
| GOCLMCP HEAD sha256 | `abebc8260c9366769298ee6c8fb609b76b1ea80a9b4924dca8b2330def67a2d0` |
| GOCLMCP HEAD bytes | 764551 |
| Manifest sha256 | `cf85414138ca4fcaae66ed78afa3864892bba0c55195038b89f320ab83bd17c5` |
| Manifest ops | 168 (live-success=134, probe-documented=19, documented=15) |
| Spec live counts | live-success=161, probe-documented=6, documented=1 (168 total) |

**Scope rule.** This run used read-only GET calls only. No webhook was created or deleted. No tag, project, or client was created. All pageSize probes were GET list calls.

**Method.** For each finding, record observed facts, then supported inferences, then suspected issues, then unverified hypotheses. Use weakest-valid-hypothesis reasoning: generate competing hypotheses and keep the least specific rule that satisfies the evidence.

---

## 01 W-01 Repro — ensure.ts single-flight key

**Claim (ledger W-01).** `wrapper/ensure.ts:48-69` keys the single-flight Map by `scopeKey` alone. Two different names that share one `scopeKey` coalesce. The second caller receives the first entity (`created:false` is wrong, id is wrong). The second name is never created.

**Control flow under test.**

```ts
// wrapper/ensure.ts:60-70
if (opts.scopeKey) {
    const current = ensureFlights.get(opts.scopeKey);
    if (current) return (await current) as EnsureResult<T>;
    const { scopeKey: _scopeKey, ...unscoped } = opts;
    const flight = findOrCreate(noun, unscoped);
    ensureFlights.set(opts.scopeKey, flight);
    try { return await flight; }
    finally { if (ensureFlights.get(opts.scopeKey) === flight) ensureFlights.delete(opts.scopeKey); }
}
```

The Map key is `opts.scopeKey`. The `name` field is not part of the key. Two concurrent calls that use the same `scopeKey` string but different `name` values return the same Promise.

**Reproduction script.** `/tmp/repro-ensure2.ts` (executed with `npx tsx`):

```ts
const opts1 = { name: "Alpha", scopeKey: "shared-key", list: async () => [], create: async (n) => ({id: `id-${n}`, name: n}) };
const opts2 = { name: "Beta",  scopeKey: "shared-key", list: async () => [], create: async (n) => ({id: `id-${n}`, name: n}) };
const [r1, r2] = await Promise.all([ensureTag(opts1), ensureTag(opts2)]);
```

**Observed fact.** Exit code 0. Output:

```
r1: {"entity":{"id":"id-Alpha","name":"Alpha"},"id":"id-Alpha","created":true}
r2: {"entity":{"id":"id-Alpha","name":"Alpha"},"id":"id-Alpha","created":true}
creates: [ 'Alpha' ]
BUG CONFIRMED: Beta got Alpha's entity (coalesced incorrectly)
```

`create` was called one time with `"Alpha"`. `"Beta"` was never created. Both callers received `"Alpha"`.

**Second probe — same name, same key (correct coalescing).**

```
r3: {"entity":{"id":"id-Gamma","name":"Gamma"},"id":"id-Gamma","created":true}
r4: {"entity":{"id":"id-Gamma","name":"Gamma"},"id":"id-Gamma","created":true}
creates: [ 'Gamma' ]
CORRECT: coalesced
```

Same-name coalescing works as designed.

**Scoped-client path — does it share the bug?**

`wrapper/scoped-client.ts:228-235`:

```ts
private flightKey(noun: string, name: string): string {
    return [ clientFlightToken(this.client), this.workspaceId, noun, name.trim().toLowerCase() ].join(FLIGHT_KEY_SEPARATOR);
}
```

The scoped key includes `noun` and the case-folded `name`. Two calls `ws.ensureTag("Alpha")` and `ws.ensureTag("Beta")` produce different keys. The `"\u0000"` separator prevents cross-field folding.

**Weakest valid hypothesis.**

- H1 (narrow): The bug affects only direct callers that reuse one `scopeKey` string for different names. Severity low.
- H2 (broad): The bug affects all callers. Severity medium.

Evidence supports H1. The scoped-client path encodes the name in the key. No generated or CLI/MCP caller uses raw `ensureTag({scopeKey})` with a shared key today. The existing test `wrapper/tests/ensure.test.ts:22` uses one name per key, so the suite does not cover the divergent-name case.

**Classification.**

- Observed fact: Direct `ensureTag` with shared `scopeKey` and different `name` coalesces incorrectly (reproduced).
- Supported inference: `ws.ensureTag` / `ws.ensureProject` / `ws.ensureClient` are not affected because `flightKey` includes the name.
- Suspected issue: A future caller that builds its own `scopeKey` without encoding the name will hit silent wrong-entity reuse.
- Unverified hypothesis: No other Map-key collision exists (e.g., separator collision). The `\u0000` choice makes this unlikely, but not formally proved across all possible workspaceId encodings.

**W-01 validation result: CONFIRMED for the direct API; NOT REPRODUCED via the scoped-client path.**

---

## 02 W-02 Check — scoped-client missing balanceAssignment

**Claim (ledger W-02).** The workspace scoped client exposes 29 resource getters. The generated `ClockifyApiClient` exposes 30. The missing entry is `balanceAssignment`. Access via `ws.balanceAssignment` is `undefined` at runtime.

**Observed facts.**

```sh
grep -c "balanceAssignment" wrapper/scoped-client.ts  -> 0
grep -c "balanceAssignment" wrapper/src/Client.ts     -> 3 (import, field, getter at line 81)
```

Getter counts from source:

- `wrapper/src/Client.ts`: 30 getters — approvals, auditLogReport, **balanceAssignment**, balances, clients, customFields, entityChangesExperimental, expenseCategories, expenseReport, expenses, files, holidays, invoiceItems, invoicePayments, invoiceSettings, invoices, memberProfiles, projects, reports, scheduling, sharedReports, tags, tasks, timeEntries, timeOff, timeOffPolicies, userGroups, users, webhooks, workspaces.
- `wrapper/scoped-client.ts`: 29 getters — same list without `balanceAssignment`.

Repro script `/tmp/repro-scoped.ts` (exit 0) confirmed:

```
Scoped getters (29): approvals, auditLogReport, balances, ...
Client getters (30): approvals, auditLogReport, balanceAssignment, balances, ...
Missing in scoped-client: balanceAssignment
```

`docs/resources/README.md` says 30. `wrapper/README.md:11` says 29. The counts disagree in the expected direction.

**Live check.** `GET /workspaces/{id}/balance-assignments` returned 404 `No static resource`. The real paths are `.../time-off/balance/assignment...` (three ops under `/time-off/balance/assignment`). The generated client path is not `balance-assignments`.

**Weakest valid hypothesis.**

- H1 (oversight): The generator or sync step added `balanceAssignment` after the scoped client was last updated, and no set-equality test failed because none exists. Severity medium.
- H2 (intentional): The endpoint was deemed out of scope for the scoped surface. No evidence supports this — no comment, ADR, or changelog entry explains the omission.

Evidence supports H1.

**Classification.**

- Observed fact: Count and set mismatch (29 vs 30, one missing entry named above).
- Supported inference: `ws.balanceAssignment` is undefined; any caller that uses the scoped client for balance assignments will throw `TypeError`.
- Suspected issue: CLI/MCP bypass the scoped client, so the gap was not caught by their gates. No existing test compares the two getter sets.
- Unverified hypothesis: Adding the getter is sufficient (the underlying resource path and auth are correct for the scoped workspace). No live write was attempted.

**W-02 validation result: CONFIRMED.**

---

## 03 W-08 Live Probe — iterPages pageSize max 200 doc vs code

**Claim (ledger W-08).** `wrapper/iter.ts:41-42` documents `max 200` for `pageSize`. No runtime cap is enforced. The value goes to the wire.

**Code check.**

```ts
// wrapper/iter.ts:41-42 doc
/** Page size to request. Default 50 (matches Clockify default; max 200). */

// wrapper/iter.ts:225-230 — runtime validation
const pageSize = options.pageSize ?? 50;
if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new RangeError(`iterPages: pageSize must be a positive integer (got ${pageSize})`);
}
```

No upper-bound check. The comment and the code disagree.

**Live probes (GET only, workspace 65b382b606de527a7ee2b60e, resource tags).**

| pageSize | HTTP status | Items returned | last-page header | Note |
|---|---|---|---|---|
| 1 | 200 | 1 | false | |
| 50 | 200 | 50 | false | |
| 200 | 200 | 118 | true | At documented max; 118 total tags in workspace |
| 201 | 200 | 118 | true | Above documented max; server accepted |
| 500 | 200 | 118 | true | Server accepted; also tested via SDK `iterPages` and `client.tags.list` |
| 1000 | 200 | 118 | true | Server accepted |
| 5000 | 200 | 118 | true | Server accepted (observed upper limit) |
| 5001 | 400 | — | — | `{"message":"Page size cannot be larger than 5,000.","code":501}` |
| 9999 | 400 | — | — | Same 400 as 5001 |

Projects with `page-size=500` also returned 200 with 292 items (different resource, same behavior).

**SDK-level probes (via `wrapper/dist/esm`).**

```ts
for await (const page of iterPages(listTags, {workspaceId}, {pageSize: 500})) // -> page 1: 118 items, hasNextPage=false
await client.tags.list({workspaceId, "page-size": 500}) // -> 118 items, 200 OK
await client.tags.list({workspaceId, "page-size": 9999}) // -> BadRequestError 400 "cannot be larger than 5,000"
```

**Weakest valid hypothesis.**

- H1 (doc stale): The server cap was raised from 200 to 5000 after the doc was written. The SDK should either clamp to 200 for backward compatibility or raise the doc to 5000. Severity low.
- H2 (resource-varying cap): Different resources cap at different values. Evidence weakly supports a single global cap of 5000 — tags and projects both accepted 500, both rejected 5001 with the same message — but not all 14 paginated resources were probed.

H1 best satisfies the evidence with the fewest assumptions.

**Classification.**

- Observed fact: Doc says max 200; code enforces no max; server enforces 5000 and accepts 201–5000.
- Supported inference: Callers that rely on the SDK to cap at 200 will send 201–5000 to the wire and receive 200 (not 400) until 5000.
- Suspected issue: A caller that assumes 200 is the largest useful value may over-fetch, but no data loss occurs because the server returns all matching items in one page when `page-size >= total-count`.
- Unverified hypothesis: All remaining paginated endpoints share the same 5000 cap. Only tags and projects were probed live.

**W-08 validation result: CONFIRMED — doc and code diverge; server cap is 5000, not 200.**

---

## 04 S-01 Bytes — source lock vs shipped spec divergence

**Claim (ledger S-01).** The source lock and live-evidence manifest attest GOCLMCP commit `1dc0392` (736,890 B, sha256 `aa59a0...`). The shipped snapshot is 764,551 B (sha256 `abebc8...`) from later commits. `check-live-evidence-manifest.mjs` compares manifest to lock only, never lock to shipped bytes. All gates pass while the lock answers for the wrong commit.

**Observed facts (bytes and hashes).**

```sh
shasum -a 256 docs/openapi-source-lock.json
  -> 960b1bcb75595022f7e82bab608d36aa258076bfb4f4e68df66dbadfe397d487  506 B

shasum -a 256 spec/corrected/clockify.corrected.openapi.yaml
  -> abebc8260c9366769298ee6c8fb609b76b1ea80a9b4924dca8b2330def67a2d0  764551 B

shasum -a 256 ../GOCLMCP/docs/openapi/clockify-openapi.yaml
  -> abebc8260c9366769298ee6c8fb609b76b1ea80a9b4924dca8b2330def67a2d0  764551 B
```

`docs/openapi-source-lock.json`:

```json
{ "commit": "1dc0392c6a36fe5f636848d7ea0ef5c62bb83c84", "sourceBytes": 736890, "sourceSha256": "aa59a0766bd9043bf634f9cfe09b01c8fb7e86871900b2c26409490de67e9f70" }
```

`spec/evidence/live-evidence-manifest.json`:

```json
{ "canonicalCommit": "1dc0392c6a36fe5f636848d7ea0ef5c62bb83c84", "canonicalOpenApiSha256": "aa59a0766bd9043bf634f9cfe09b01c8fb7e86871900b2c26409490de67e9f70" }
```

Equality checks:

- `shipped sha256 == GOCLMCP HEAD sha256` — true (shipped was copied from GOCLMCP HEAD, not from the locked commit).
- `lock sha256 == shipped sha256` — false (736,890 B vs 764,551 B).
- `manifest canonical == lock` — true (both point at 1dc0392).
- `manifest canonical == shipped` — false.

**Checker analysis.** `scripts/check-live-evidence-manifest.mjs:276-289`:

```ts
if (manifest.canonicalCommit !== sourceLock.commit) { errors.push(...) }
if (manifest.canonicalOpenApiSha256 !== sourceLock.sourceSha256) { errors.push(...) }
```

The checker validates manifest-to-lock only. No line compares `sourceLock` to the bytes on disk at `spec/corrected/clockify.corrected.openapi.yaml` or to `docs/openapi-operations.json`. The operation inventory check (lines 294–331) validates operation-key equality, but not byte identity.

**Spec headline vs manifest counts (S-02 context).**

- Spec `x-clockify-live-status` Counter: live-success 161, probe-documented 6, documented 1 (168 total).
- Manifest Counter: live-success 134, probe-documented 19, documented 15 (168 total).
- Both files have 168 operations. The 27-row promotion delta (134 -> 161) is not explained by the manifest.

**Weakest valid hypothesis.**

- H1 (lock not re-approved): The spec was refreshed from GOCLMCP HEAD (`abebc826`) without re-running `H01-LOCK` approval, so lock and manifest still reference the prior attested commit (`1dc0392`). Gates stay green because the only cross-file check is manifest-to-lock.
- H2 (intentional divergence): The lock intentionally pins an older good commit while the spec tracks HEAD for development convenience. No document states this dual-track policy, and `scripts/check-live-evidence-manifest.mjs` would be expected to encode it if it were intentional.

Evidence supports H1.

**Classification.**

- Observed fact: Byte and hash mismatch between lock/manifest and shipped/GOCLMCP HEAD (values above).
- Supported inference: The trust anchor (lock) answers for commit 1dc0392 while the artifact on disk answers for a later commit. A consumer that trusts the lock's commit to describe the spec's contents is misled.
- Suspected issue: A stale lock also makes manifest-to-spec staleness invisible — the manifest and spec disagree on live-success counts (134 vs 161) without any gate failing.
- Unverified hypothesis: Which GOCLMCP commits between 1dc0392 and abebc826 introduced the byte delta, and whether each change was live-probed. That requires a GOCLMCP log diff not run here.

**S-01 validation result: CONFIRMED. S-02 delta (134 vs 161) observed as a corollary.**

---

## 05 Findings Validation

| ID | Ledger claim | Live/static result | Verdict |
|---|---|---|---|
| W-01 | Single-flight keyed by scopeKey alone | Repro exit 0 — Beta received Alpha; scoped-client path not vulnerable | **Confirmed** (narrow: direct API only) |
| W-02 | Scoped client missing balanceAssignment (29 vs 30) | Count 29 vs 30; missing entry is balanceAssignment; scoped access undefined | **Confirmed** |
| W-03 | Two webhook payload models contradict (flat vs envelope) | Flat union (`event`) in `webhook-events.ts`; envelope (`webhookEvent/payloadType/payload`) in fixtures; live management API shape observed; delivery payload not observed | **Confirmed as design contradiction**; **live delivery shape unverified** (requires delivery probe) |
| W-05 | runWithRetries post-loop dead code (lines 601-605) | Control-flow analysis: every loop iteration returns, throws, or continues; post-loop unreachable under valid `maxRetries`; `validateRetryPolicy` is per-request at line 311 | **Confirmed as dead code**; no safety impact |
| W-08 | iterPages doc says max 200, code has no cap | Live: server accepts 201–5000 with 200 OK; rejects 5001+ with 400 `cannot be larger than 5,000`; SDK level same | **Confirmed** — server cap 5000, doc/code diverge |
| S-01 | Lock vs shipped bytes divergence | Lock 736,890 B aa59a0 vs shipped 764,551 B abebc8; shipped == GOCLMCP HEAD; checker only compares manifest-to-lock | **Confirmed** |
| S-02 | Manifest 134/168 vs spec 161/168 | Manifest 134 live-success, spec 161 live-success (168 total both) | **Confirmed as corollary of S-01** |

**Additional note on W-05 and W-14.** W-14 (maxRetries check per-request not at construction) was read as part of W-05. Confirmed: `validateRetryPolicy` runs inside `composedFetchImpl` after `mergeRetryPolicy`, at line 311, not at `composedFetch()` construction time. An invalid `{maxRetries: 2.5}` throws on the first request. The POST/PATCH guard at line 450 is construction-time. The timing split is as documented in ledger W-14.

---

## 06 Unknowns

These items remain unknown after this pass. They require probes not in scope for this subagent.

1. **Webhook delivery payload shape.** The list endpoint `GET /workspaces/{id}/webhooks` returns management records, not delivery bodies. The true delivery JSON (flat `event` vs envelope `webhookEvent+payload`, field `owner` vs `ownerId`, header name canonical form) needs a webhook create against an external sink plus a triggered event. Planned as verification queue Phase 4 item 26. No webhook was created in this pass.

2. **Webhook signature value form.** Whether `Clockify-Signature-Token` carries the bare 32-char `authToken`, a prefixed form, or an HMAC. Helpers assume bare-token constant-time compare. Not live-probed.

3. **Paginated-resource cap uniformity.** Only `tags` (12 pageSize values) and `projects` (one) were probed. Remaining 12 paginated resources may cap differently.

4. **balanceAssignment write path liveness.** The scoped getter was confirmed missing, but no live create/update/delete was attempted for this resource.

5. **S-02 promotion provenance.** Which of the 27 promoted rows between manifest 134 and spec 161 correspond to which GOCLMCP evidence campaign, and whether any row is stale.

---

## 07 Verification Receipts

Exact commands and exit codes. No key material is logged. All GET probes used the sacrificial workspace id `65b382b606de527a7ee2b60e`.

| # | Command | Exit | Observed |
|---|---|---|---|
| 1 | `npx tsx /tmp/repro-ensure2.ts` | 0 | W-01: Beta got Alpha (BUG CONFIRMED); Gamma coalesced correctly |
| 2 | `npx tsx /tmp/repro-scoped.ts` | 0 | W-02: 29 getters vs 30; missing balanceAssignment |
| 3 | `GET /workspaces/{id}/tags?page=1&page-size=1` | 200 | 1 item, last-page false |
| 4 | `GET /workspaces/{id}/tags?page=1&page-size=50` | 200 | 50 items, last-page false |
| 5 | `GET /workspaces/{id}/tags?page=1&page-size=200` | 200 | 118 items, last-page true |
| 6 | `GET /workspaces/{id}/tags?page=1&page-size=201` | 200 | 118 items, last-page true |
| 7 | `GET /workspaces/{id}/tags?page=1&page-size=500` | 200 | 118 items, last-page true |
| 8 | `GET /workspaces/{id}/tags?page=1&page-size=1000` | 200 | 118 items, last-page true |
| 9 | `GET /workspaces/{id}/tags?page=1&page-size=5000` | 200 | 118 items, last-page true |
| 10 | `GET /workspaces/{id}/tags?page=1&page-size=5001` | 400 | `Page size cannot be larger than 5,000.` |
| 11 | `GET /workspaces/{id}/tags?page=1&page-size=9999` | 400 | Same 400 as above |
| 12 | `GET /workspaces/{id}/projects?page=1&page-size=500` | 200 | 292 items, last-page true |
| 13 | `GET /workspaces/{id}/webhooks` | 200 | `{workspaceWebhookCount:10, webhooks:[{webhookEvent}]}` (management shape) |
| 14 | `GET /workspaces/{id}` | 200 | Workspace WORKSPACE |
| 15 | `shasum -a 256 spec/corrected/clockify.corrected.openapi.yaml` | 0 | `abebc8260c9366769298ee6c8fb609b76b1ea80a9b4924dca8b2330def67a2d0  764551` |
| 16 | `shasum -a 256 ../GOCLMCP/docs/openapi/clockify-openapi.yaml` | 0 | Same hash as shipped (shipped == GOCLMCP HEAD) |
| 17 | `shasum -a 256 docs/openapi-source-lock.json` | 0 | `960b1bcb...` (lock itself, 506 B; inner sha `aa59a076...` 736890 B) |
| 18 | `node scripts/check-live-evidence-manifest.mjs` (read) | — | Compares manifest<>lock only; no lock<>shipped check |
| 19 | `SDK iterPages pageSize 500 via wrapper/dist/esm` | 0 | Page 1: 118 items, hasNextPage false |
| 20 | `SDK client.tags.list page-size 9999` | throw | `BadRequestError 400 Page size cannot be larger than 5,000` |
| 21 | `grep -c balanceAssignment wrapper/scoped-client.ts` | 1 | 0 hits (missing) |
| 22 | `grep -c balanceAssignment wrapper/src/Client.ts` | 0 | 3 hits (import, field, getter) |
| 23 | Control-flow read `wrapper/composed-fetch.ts:495-605` | — | Every loop iteration returns/throws/continues; post-loop unreachable |

**Live call summary.** 12 GET probes (tags x9, projects x1, webhooks x1, workspace x1) plus 2 SDK-level GETs. Total 14 live reads. Zero creates, updates, or deletes.

**Files changed by this validator.** This report (`.ai-audit/live-validation-sdk.md`, created) and evidence JSON (`/tmp/live-sdk-evidence.json`, created/appended). No product file was modified. Credentials were supplied via environment variables and are not recorded in either output.

