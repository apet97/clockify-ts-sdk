# Clockify MCP server (community) — how it compares & a 2-minute quickstart

> Independent, community-built MCP server for the public **Clockify** HTTP API.
> **Not affiliated with, endorsed by, or sponsored by CAKE.com or Clockify.**
> "Clockify" is a trademark of CAKE.com, used here nominatively only to identify
> the upstream API this server integrates against. See [`NOTICE.md`](../NOTICE.md).
> Other product names below belong to their respective owners; mentioning them
> implies no endorsement or relationship.

## Why this server vs other Clockify MCP servers

There is no official Clockify MCP server today. The practical alternatives are
hand-built community MCP servers and general-purpose connector/aggregator
platforms (for example StackOne, Zapier, or Composio) that expose Clockify
through a generic connector. This server is purpose-built and workflow-first.
The table is a factual, nominative comparison to help you choose — capabilities
of third-party tools vary by version and plan, so their columns are hedged.

| Capability | This server (`@clockify115/mcp-server`) | Typical community Clockify MCP | Connector / aggregator platform |
|---|---|---|---|
| Tool design | Workflow-first tools (log work, review day/week, invoice, request time off) **plus** full domain CRUD — see the [Workflow Tools](./README.md#workflow-tools) and [Domain Tools](./README.md#domain-tools) tables | Often a thin 1:1 mirror of the REST API | Generic API passthrough |
| Destructive-write safety | `dry_run` preview returns a single-use `confirm_token`; the write only runs when you replay it | Frequently writes directly, no preview | Varies by connector |
| Webhook URL safety | Offline SSRF guard rejects non-HTTPS URLs, embedded credentials, and private/loopback/link-local/CGNAT/metadata IPs before creating a subscription | Typically none | Varies |
| Result shape | Typed receipts: `ids`, `changed`, `warnings`, `next`, stable error codes, and `recovery` hints | Usually raw JSON passthrough | Usually raw JSON passthrough |
| Diagnostics | No-network `clockify://mcp/doctor` resource + `clockify_status` tool for a safe first check | Usually none | Platform dashboards |
| Credential handling | `CLOCKIFY_API_KEY` / `CLOCKIFY_WORKSPACE_ID` read from the environment, server-side only, never logged | Varies | Stored by the platform vendor |
| Install / run | Local stdio; optional one-click `.mcpb` bundle | Clone + build | Hosted sign-up / OAuth |
| Provenance | Open source, MIT, gate-checked; the Node sibling to a drift-gated Go reference server | Varies | Closed connectors |

Pick this server when you want a local, workflow-complete Clockify MCP with
preview-before-write safety and structured, recoverable receipts. Pick an
aggregator when you are already standardized on that platform and want one connector
surface across many tools.

## 2-minute visual quickstart

Three steps: install, make your first (read-only) call, then log work. The
screenshots below are placeholders until the maintainer captures them (see the
checklist at the end).

### 1. Install & configure

Install the server and give it your Clockify API key and workspace id. The
one-click `.mcpb` bundle prompts for both and stores the key in your OS keychain;
the manual MCP-client config is in the [README](./README.md#configure).

> Screenshot — `media/install-mcpb.png`: the install dialog showing the
> "Clockify API key" and "Clockify workspace ID" fields (values redacted).
<!-- maintainer: after capture, replace the blockquote above with: ![Install dialog with API key and workspace id fields](media/install-mcpb.png) -->

### 2. First call — confirm the connection (read-only)

Ask your assistant to run `clockify_status`. It reports your user, workspace, and
any running timer — a safe, read-only way to prove the connection works.

> Screenshot — `media/first-call-status.png`: the assistant calling
> `clockify_status` and the returned receipt (user/workspace redacted).
<!-- maintainer: after capture, replace the blockquote above with: ![clockify_status receipt](media/first-call-status.png) -->

### 3. Log work

Ask your assistant to log a finished entry, e.g. "log 9:00–10:15 on Website,
Implementation, description 'wire up auth'". The server resolves the names to
ids and returns a typed receipt with the created entry's `ids` and a `next`
suggestion.

> Screenshot — `media/log-work.png`: a `clockify_log_work` call and its success
> receipt (`ids` / `changed` / `next`).
<!-- maintainer: after capture, replace the blockquote above with: ![clockify_log_work success receipt](media/log-work.png) -->

> Full flow GIF — `media/quickstart.gif`: install → `clockify_status` →
> `clockify_log_work`, end to end.
<!-- maintainer: after capture, replace the blockquote above with: ![Install to first logged entry](media/quickstart.gif) -->

## Maintainer: screenshot & GIF capture checklist

Capture these into `mcp/media/` and then swap each placeholder blockquote above
for the `![...]()` line shown in its adjacent HTML comment.

- [ ] `install-mcpb.png` — the install/onboarding dialog with the "Clockify API
      key" and "Clockify workspace ID" fields visible.
- [ ] `first-call-status.png` — a `clockify_status` call and its receipt.
- [ ] `log-work.png` — a `clockify_log_work` call and its success receipt
      (`ids` / `changed` / `next`).
- [ ] `quickstart.gif` — the full install → status → log-work flow.

Capture rules:
- **Redact every secret and identifier**: blur or replace the API key, the
  24-character workspace id, real email addresses, and real client/project/task
  names. Use obviously-fake demo values (e.g. "Acme", "Website").
- Use a sandbox/test workspace, never a customer workspace.
- Target ~1400px wide for PNGs; keep the GIF under ~5 MB and a few seconds long.
- No Clockify logo, wordmark, or brand styling in the captures or the surrounding
  layout — nominative text only (see [`NOTICE.md`](../NOTICE.md)).

---

This page lives in `mcp/` on purpose (co-located with the server it describes and
intentionally not part of the npm tarball). If it is ever moved under `docs/`, it
must be registered in [`docs/README.md`](../docs/README.md) and follow the docs
prose rules (write the SDK as `clockify-sdk-ts-115`; no `TODO`/`TBD`; no stale
counts; no `world-class`/`production-ready`/`best-in-class`-style claims).
