# Live-evidence behaviors & active-entity deletes

Repo gotchas extracted from `CLAUDE.md`. The canonical contract is
[`AGENTS.md`](../../AGENTS.md); this file carries the situational detail so
`CLAUDE.md` can stay an index. Indexed from [`docs/README.md`](../README.md).


- **Live-evidence behaviors (2026-06-21):** the single-project scheduling totals
  GET (`scheduling.listOnProject`) **requires** `start`/`end` — it 400s (code
  3001) without them, so `clockify_scheduling_assignments_list_per_project`
  forwards them on the `projectId` branch. A wrong/missing id 400s with `code:501`
  "doesn't belong to Workspace" and now classifies `not_found` (a status-first
  branch in `wrapper/errors.ts` ahead of the generic 400→`invalid_request`; the
  shared `errorText()` matches message OR body). The time-off submit period is
  policy-unit dependent (DAYS = `start`+`days`, HOURS = `start`+`end`), so
  `clockify_time_off_requests_submit` makes `end` optional and requires one of
  `{end, days}`. See `spec/evidence/discrepancies.md`.
- Deleting an ACTIVE project/task/client 400s (live-verified). The
  project and client archive-then-delete sequences (GET name → archive →
  DELETE, plus the empty-name guard) live once in the wrapper helpers
  `archiveThenDeleteProject` / `archiveThenDeleteClient`
  (`clockify-sdk-ts-115/ensure`); both the CLI (`clk115 projects/clients delete`)
  and MCP (`clockify_projects_delete` / `clockify_clients_delete`) call them.
  The client path is the subtle one: the generated `clients.update` FLATTENED
  form drops `archived` and `clients.archive` 404s, so the helper archives via
  the `clients.update` body envelope (`{...,body:{name,archived:true}}`), which
  bypasses the field whitelist via `core.bodyFromRequest`. `clockify_tasks_delete`
  still marks DONE inline (`tasks.update({status:"DONE"})`) — a different
  replace-PUT shape, not folded into the helper. See
  `spec/evidence/discrepancies.md` (`deletes.archive-first.*`).
