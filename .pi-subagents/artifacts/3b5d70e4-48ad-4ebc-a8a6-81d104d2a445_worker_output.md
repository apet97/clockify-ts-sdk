## Completed

Completed the WEBHOOKS group audit in the adversarial Clockify OpenAPI discrepancy audit. All five ledger entries were adjudicated with static cross-spec comparison (corrected spec vs repo official snapshot vs fresh official-live.json vs generator PHANTOM_PATHS) plus a full mandated live-probe campaign against the sacrificial sandbox (DSAUDIT-prefixed, cleaned up, Leftovers:0).

Key results:
- **webhook.signature-scheme.shared-secret-not-hmac-doc-only** — no spec discrepancy; corrected spec + wrapper code consistently document 32-char shared secret / `Clockify-Signature-Token` / NOT-HMAC; zero "HMAC secret" docstrings remain in the SDK. Delivery-header capture still pending (unprobeable from sandbox).
- **webhook.create.name-required-on-api-key-not-addon** — live-confirmed: no-name API-key create → 400 `{"message":"Webhook already exists","code":501}`; with name → 201. official-live.json omits `name` from `required[]` (addon path); corrected spec's required-name matches the API-key SDK.
- **webhooks.logs.method-is-post-not-get** — re-verified: GET → 405 + `Allow: POST`; POST real id → 200 `[]`; POST fake id → 400. Both official sources document POST only; corrected spec has POST only with GET quarantined. RESOLVED stands.
- **webhooks.generateNewToken.phantom** — re-verified: PATCH /generateNewToken → 404 `No static resource`; PATCH /token fake → 400 (route exists), real → 200 (status recorded, token redacted). Quarantine in place and confirmed correct.
- **getWebhookEventStatusesWithLatestLog** — live 200; corrected spec carries it (probe-fragment); **official-live.json also now carries it** (identical opId/schema/params) — the ledger's "absent from all GOCLMCP sources" claim is stale vs the current official pull.
- 5 unledgered differences recorded (operationId drift on /token, schema naming drift, /test 404 probe, stale "DOCUMENTED BUT BROKEN" source op, type=SYSTEM 500 note).

Findings written to `/tmp/clockify-openapi-audit/findings/webhooks.md` (115 lines, API key never printed, all webhook tokens redacted).

## Files Changed
- `/tmp/clockify-openapi-audit/findings/webhooks.md` — created (the only write; repo is untouched)

## Notes
- `gen-clockify-openapi` lives at `/Users/15x/Downloads/WORKING/addons-me/GOCLMCP/scripts/gen-clockify-openapi` (the task's stated path was missing the `addons-me/` segment).
- Probe script used: `/tmp/clockify-openapi-audit/probe-webhooks.sh` (created, run, disposable webhook `6a762a341cfc6b0570ff741d` deleted; DSAUDIT leftovers 0; pre-existing 10 webhooks untouched).
- Key discoveries: official-live.json already documents POST /logs and GET /statuses (repo's Jun-3 official snapshot does not); official-live operationId for PATCH /token is literally `generateNewToken` on the *correct* path.