# Transcript: "clean demo data"

A destructive cleanup flow. It is idempotent (safe to re-run) and uses the
`dry_run` -> `confirm_token` handshake because it deletes.

## 1. Plan (read-only)

```json
{ "name": "clockify_plan_change", "arguments": { "goal": "clean demo data" } }
```

The plan shows a read step (`clockify_review_day`) then `clockify_demo_cleanup`
marked `mutates: true, requiresConfirmation: true`.

## 2. Dry run (preview what would be deleted)

```json
{ "name": "clockify_demo_cleanup", "arguments": { "prefix": "sdk-demo-", "dry_run": true } }
```

Receipt lists the objects that match the prefix plus a `confirm_token`:

```json
{ "ok": true, "action": "clockify_demo_cleanup",
  "data": { "preview": { "entries": 3, "projects": 1, "tags": 2 }, "confirm_token": "tok_…" },
  "next": [{ "tool": "clockify_demo_cleanup", "args": { "prefix": "sdk-demo-", "confirm_token": "tok_…" } }] }
```

## 3. Confirm (execute the deletion)

```json
{ "name": "clockify_demo_cleanup", "arguments": { "prefix": "sdk-demo-", "confirm_token": "tok_…" } }
```

Receipt reports what was removed and continues through partial failures:

```json
{ "ok": true, "action": "clockify_demo_cleanup",
  "changed": { "deleted": [{ "type": "time_entry", "id": "e1" }, { "type": "project", "id": "p1" }] },
  "warnings": [{ "code": "partial", "message": "tag t9 already gone; skipped" }] }
```

Re-running is safe: already-deleted objects are skipped, not re-reported as
failures. (`clockify_demo_seed` with the same prefix recreates the fixtures.)
