# Transcript: "recover from not_found"

How an agent recovers when a tool returns a `not_found` error — the error
envelope carries a stable `error.code` and a `recovery` hint with the next tool to
call, so recovery is mechanical.

## 1. A call fails with not_found

```json
{ "name": "clockify_entries_get", "arguments": { "entry_id": "does-not-exist" } }
```

Error receipt (`isError: true`):

```json
{
  "ok": false,
  "action": "clockify_entries_get",
  "error": { "code": "not_found", "message": "Time entry not found" },
  "recovery": { "hint": "List entries for the day, then retry with a real id.",
                "tool": "clockify_entries_list", "retryable": false }
}
```

## 2. Follow the recovery hint

```json
{ "name": "clockify_entries_list", "arguments": { "date": "today" } }
```

Pick the real id from the returned list, then retry the original call with it.

## Other recoverable codes

| `error.code` | What it means | Typical recovery |
|---|---|---|
| `not_found` | id/name does not resolve | list, then retry with a real id |
| `auth_or_permission` | 401/403 | check `CLOCKIFY_API_KEY` / workspace access (`clockify_status`) |
| `rate_limited` | 429 | back off; `recovery.retryAfterSeconds` when present |
| `invalid_request` | bad input or a stale/forged `confirm_token` | fix the field, or re-run the dry_run for a fresh token |
| `unsupported` | the route has no live endpoint | use the alternative the message names |

The `next`/`recovery.tool` fields mean an agent rarely has to guess the recovery
path — call what the envelope points at.
