# Agent-mode guide (compact)

A dense, LLM-context-friendly operating guide for `@clockify115/mcp-server`. The
human README has the full prose; this is the short version an agent should follow.

## Order of operations

1. `clockify_status` — confirm credentials, workspace, running timer.
2. `clockify_plan_change { goal }` — read-only: get the tool sequence before mutating.
3. Workflow tools first (below); drop to domain tools only when a workflow points there.

## Receipts are uniform — pattern-match on them

Every success: `{ ok:true, action, data, ids?, changed?, warnings?, clarification?, next? }`.
Every error: `{ ok:false, action, error:{ code, message }, recovery?:{ hint, tool, args, retryable } }`.

- `ids` — reuse these on the next call instead of re-resolving names.
- `changed` — `created`/`updated`/`deleted`/`reused` entity refs.
- `next` — the recommended next tool(s); follow them.
- `clarification` — an ambiguous name; pick a candidate id and re-call.
- `recovery.tool` — on error, call this; `error.code` is stable (see recover-from-not-found.md).

## Writes are two-step

High-risk workflow writes (`invoice_client_work`, `record_expense`,
`request_time_off`, `schedule_work`, `setup_webhook`) and destructive domain
deletes (`entries/projects/clients/tags/tasks/webhooks _delete`) require
`dry_run:true` → returns a single-use `confirm_token` → re-call with the token.
Never fabricate a token.

## Names, not ids

Pass human names (`project:"Website"`, `client:"Acme"`, `date:"yesterday"`); the
server resolves them. Ambiguous/missing names come back as a `clarification`, not a
wrong id.

## Read-only discovery tools

`clockify_status`, `clockify_tools_guide`, `clockify_plan_change`,
`clockify_docs_search`, `clockify_operation_guide`, `clockify_sdk_snippet`, and the
`clockify_review_*` tools never mutate — use them freely to orient.

## Resources

`clockify://guide/{axioms,workflows,safety,agent-mode,which-tool}` and
`clockify://mcp/doctor`. The `which-tool` guide is an intent → first-tool tree.
