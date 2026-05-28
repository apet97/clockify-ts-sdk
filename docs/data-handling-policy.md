# Data Handling Policy

Clockify data can include personal, commercial, billing, scheduling, webhook, and
workspace administration records. This repo must keep examples, tests, support
bundles, live proof, generated evidence, and final receipts useful without
copying customer data into source control or agent handoff artifacts.

## Data classes

| Class | Examples | Handling rule |
|---|---|---|
| Credentials | `CLOCKIFY_API_KEY`, `CLOCKIFY_ADDON_TOKEN`, `NPM_TOKEN`, webhook shared secrets, cookies | Never commit, log, paste, or include in support bundles. Replace with `<redacted>`. |
| Workspace identifiers | Workspace IDs, project IDs, client IDs, tag IDs, entry IDs, invoice IDs, expense IDs | Prefer role placeholders like `workspace_123`; include real IDs only in local proof output that is not committed. |
| Personal data | User names, emails, user IDs, team membership, approvals, time-off requests | Do not place real values in docs, examples, fixtures, or final receipts. Use mock names and sanitized IDs. |
| Work records | Time-entry descriptions, project/task names, scheduling assignments, audit-log entries | Treat as customer data. Use synthetic examples or minimal IDs. |
| Commercial data | Invoice numbers, invoice lines, client names, rates, expenses, receipts, report totals | Treat as sensitive business data. Do not include real amounts or line details in docs or handoffs. |
| Webhook data | Delivery URLs, event payloads, signature tokens, addon installation context | Use local/mock URLs and sanitized payloads. Never include shared secrets. |
| Package-lock metadata | Lockfile version and package count from `package-lock.json` | Support bundles may include summary counts only. Do not include dependency names, resolved tarball URLs, integrity hashes, or `node_modules` entries. |
| Raw live evidence | `spec/evidence/probes/*`, curl captures, live cleanup output | Keep raw captures gitignored; promote only sanitized findings and receipts. |

## Repository rules

- Documentation, snippets, and examples must use synthetic data or placeholders.
- Tests must use mock fixtures or timestamped sacrificial sandbox records.
- Support bundles must include receipts, IDs, status, `requestId`, `changed`,
  `retryable`, and `recovery`, not raw API bodies with customer content.
- First-run support handoffs must start from
  `node scripts/plan.mjs workflow --workflow first-run-support`; preserve only
  safe `safeCommandHints`, not shell output containing env values, tokens,
  workspace IDs, raw logs, or customer data.
- Support bundles may include package-lock summary metadata, but only lockfile
  path, availability, lockfile version, and package count.
- Live proof must run only against a sacrificial sandbox workspace and must
  summarize cleanup by prefix, leftover count, and sanitized IDs.
- Generated API docs may describe schema fields, but hand-written docs must not
  paste production payloads.
- Discrepancy entries should explain behavior with sanitized evidence paths and
  should not embed secrets, customer names, emails, or invoice/expense details.

## Allowed placeholders

Use these placeholders in committed material:

- `workspace_123`, `project_123`, `client_123`, `entry_123`, `invoice_123`,
  `expense_123`, `tag_123`, and `req_123` for IDs.
- `mock@example.com`, `Mock User`, `Example Client`, and `Example Project` for
  synthetic names.
- `<redacted>` for secrets, customer names, private URLs, and omitted payloads.
- `123.45` only as a synthetic amount in examples that need a shape.

## Prohibited committed evidence

Do not commit:

- Real emails, customer workspace names, client names, invoice numbers, invoice
  line items, expense receipt contents, or time-entry descriptions.
- `.env` files, npm auth files, shell history, browser cookies, or CI secret
  configuration.
- Raw live probe JSON/header captures outside ignored `spec/evidence/probes/`.
- Full API responses when the proof only needs status, stable error code,
  request ID, retryability, recovery, and object IDs.
- Raw package-lock dependency names, resolved package tarball URLs, integrity
  hashes, or `node_modules` entries in support bundles or handoff docs.
- Raw output from the first-run support workflow if an operator added env values,
  tokens, workspace IDs, raw logs, or customer data around it.

## Contract-shape rule

Data-handling contract shape is part of privacy readiness. The checker validates schema version, purpose, safe repo-relative paths, typed data-class marker lists, required-doc lists, and supporting-evidence marker lists before trusting policy evidence. A malformed privacy contract is a blocker even if the prose looks reasonable.

## Proof gates

Data handling is guarded by:

- `make data-handling` for this policy and its supporting evidence.
- `make secret-hygiene` for token-shaped source/docs scans.
- `make snippet-safety` for copy-paste examples.
- `make support-bundle` for redacted escalation packets.
- `make workflow-cookbook` for the no-network first-run support workflow map.
- `make live-safety` for sandbox-only mutation and cleanup proof.
- `make receipt-examples` for safe success/error output shapes.
