# Live creds, sandbox & MCP scope filters

Repo gotchas extracted from `CLAUDE.md`. The canonical contract is
[`AGENTS.md`](../../AGENTS.md); this file carries the situational detail so
`CLAUDE.md` can stay an index. Indexed from [`docs/README.md`](../README.md).


- `CLOCKIFY_API_KEY` and `CLOCKIFY_WORKSPACE_ID` are live sandbox env
  values. Check presence, never print values. `make sandbox-key-health`
  is the optional live preflight; it exits 0 when creds are blank and
  never prints the key.
- `mcp/src/scope-filter.ts` builds the `{contains, ids, status}`
  user/group scope filter for holidays and time-off. The `status` arg
  splits: time-off **policies** scope `status:"ACTIVE"`
  (`mcp/src/tools/timeOff.ts`), holidays keep the `"ALL"` default
  (`mcp/src/tools/holidays.ts`) — matching the live-verified addon. See
  `spec/evidence/discrepancies.md`
  (`time-off.policies.scope.status-active-not-all`).
