# Transcript: "invoice Acme"

A billing flow — a high-risk write, so it uses the `dry_run` -> `confirm_token`
handshake. The preview returns a short-lived, single-use token; you re-call the
same tool with that token to execute.

## 1. Plan (read-only)

```json
{ "name": "clockify_plan_change", "arguments": { "goal": "invoice Acme", "entity": "client" } }
```

The plan marks `clockify_invoice_client_work` as `mutates: true,
requiresConfirmation: true`.

## 2. Dry run (preview, no write)

```json
{ "name": "clockify_invoice_client_work", "arguments": {
  "client": "Acme", "currency": "USD", "issued_date": "2026-06-16", "due_date": "2026-06-30",
  "dry_run": true } }
```

Receipt carries the preview plus a `confirm_token` and the exact next call:

```json
{ "ok": true, "action": "clockify_invoice_client_work",
  "data": { "preview": { "client": "Acme", "currency": "USD", "lineItems": "..." },
            "confirm_token": "tok_…", "expires_at": "…", "preview_hash": "…" },
  "next": [{ "tool": "clockify_invoice_client_work",
             "args": { "client": "Acme", "currency": "USD", "issued_date": "2026-06-16",
                       "due_date": "2026-06-30", "confirm_token": "tok_…" } }] }
```

## 3. Confirm (execute the previewed write)

```json
{ "name": "clockify_invoice_client_work", "arguments": {
  "client": "Acme", "currency": "USD", "issued_date": "2026-06-16", "due_date": "2026-06-30",
  "confirm_token": "tok_…" } }
```

Receipt: `{ "ok": true, "ids": { "invoiceId": "inv1" }, "changed": { "created": [{ "type": "invoice", "id": "inv1" }] } }`.

If the token is missing/expired/altered, you get
`{ "ok": false, "error": { "code": "invalid_request" } }` — re-run the dry_run to
get a fresh token.

## Ambiguous client name → clarification receipt

If "Acme" matches more than one client, the dry_run returns a `clarification`
instead of a token:

```json
{ "ok": true, "action": "clockify_invoice_client_work",
  "clarification": { "question": "More than one client is named \"Acme\". Which one?",
    "field": "client",
    "candidates": [{ "type": "client", "id": "c1", "name": "Acme Inc" },
                   { "type": "client", "id": "c2", "name": "Acme LLC" }] } }
```

Re-call with `client_id` set to the chosen candidate.
