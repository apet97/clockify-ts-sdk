# Agent task packets

Task-scoped playbooks for AI agents and new contributors. `AGENTS.md` is the full
contract; these packets are the short, do-this-exactly path for the most common
changes, so a weaker agent does not have to read 100+ docs to make one safe edit.

Each packet lists: files to read first, files you may edit, files you must **not**
edit, the required tests/gates, the required docs/changelog updates, and an exact
completion checklist.

| Packet | Use it when you are… |
|---|---|
| [`fix-sdk-helper.md`](./fix-sdk-helper.md) | changing behavior of an existing hand-written SDK helper (no new public name) |
| [`update-public-export.md`](./update-public-export.md) | adding or renaming a public SDK symbol or subpath |
| [`add-cli-command.md`](./add-cli-command.md) | adding a CLI command |
| [`add-mcp-tool.md`](./add-mcp-tool.md) | adding an MCP tool (domain or workflow) |
| [`handle-official-openapi-drift.md`](./handle-official-openapi-drift.md) | reviewing official-vs-custom OpenAPI drift |
| [`handle-live-api-discrepancy.md`](./handle-live-api-discrepancy.md) | recording a spec-vs-live behavior difference |
| [`execute-roadmap-task.md`](./execute-roadmap-task.md) | executing one active roadmap task through implementation, evidence capture, independent approval, and closeout |

## Ground rules that apply to every packet

- Never edit generated/snapshot paths: `wrapper/src/**`, `output/ts-sdk/**`,
  `spec/corrected/**`, `spec/official/**`. Spec-shape changes start in
  `../GOCLMCP`.
- Run `node scripts/repo-doctor.mjs` first on a fresh clone; run
  `make sdk-codegen` before any SDK package gate.
- Prove your change with `make perfect-fast` before claiming it is done. Cite the
  output; do not assert success without it.
- The package name is always `clockify-sdk-ts-115` (never the bare unscoped form).
- Roadmap tasks use the closed lifecycle in
  [`../plan-lifecycle-policy.md`](../plan-lifecycle-policy.md). Stop without a
  completion claim whenever the exact command, tracked receipt, dependency
  evidence, external proof, or required approval remains open.
