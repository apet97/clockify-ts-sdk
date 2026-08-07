// One-off generator for 04-CONTRACT-TRACEABILITY.csv (evidence pack, not shipped).
// Source of truth: spec/corrected/clockify.corrected.openapi.yaml + docs/operation-parity.json.
import fs from "node:fs";
import yaml from "yaml";

const spec = yaml.parse(
  fs.readFileSync("spec/corrected/clockify.corrected.openapi.yaml", "utf8"),
);
const parity = JSON.parse(fs.readFileSync("docs/operation-parity.json", "utf8")).operations;
const byId = new Map(parity.map((r) => [r.operationId, r]));

// Best-effort CLI surface map: x-fern-sdk-group-name -> cli/src/commands file(s).
// Verified against the cli/src/commands/ directory listing. Groups not listed
// here have no dedicated CLI command; `clk115 api` (raw passthrough) remains
// the universal fallback (cli/src/commands/api.ts).
const CLI_GROUP = {
  tags: "tags.ts",
  clients: "clients.ts",
  projects: "projects.ts",
  tasks: "tasks.ts",
  users: "users.ts",
  userGroups: "users.ts (group-level, unverified per-op)",
  webhooks: "webhooks.ts",
  invoices: "invoices.ts",
  invoiceItems: "invoices.ts",
  invoicePayments: "invoices.ts",
  expenses: "expenses.ts",
  expenseCategories: "expenses.ts",
  timeOff: "timeoff.ts",
  timeOffPolicies: "timeoff.ts",
  holidays: "timeoff.ts",
  balances: "timeoff.ts",
  scheduling: "scheduling.ts",
  reports: "reports.ts",
  sharedReports: "sharedReports.ts",
  approvals: "approvals.ts",
  auditLogReport: "auditlog.ts",
  timeEntries: "entries.ts / start.ts / stop.ts / status.ts / log.ts",
};

// Group-level test evidence map (wrapper/cli/mcp test files).
const TEST_GROUP = {
  tags: "wrapper/tests/sandbox.test.ts; cli/tests/crud.test.ts,read-commands-users-tags-shared-reports.test.ts; mcp/tests/tags.test.ts",
  clients: "wrapper/tests/sandbox.test.ts; cli/tests/crud.test.ts; mcp/tests/clients-tool.test.ts",
  projects: "cli/tests/crud.test.ts,read-commands-projects-tasks.test.ts; mcp/tests/projects-next.test.ts,project-memberships.test.ts,archive-then-delete.test.ts",
  tasks: "cli/tests/crud.test.ts,read-commands-projects-tasks.test.ts; mcp/tests/tasks-tool.test.ts,rates.test.ts",
  users: "cli/tests/read-commands-users-tags-shared-reports.test.ts; mcp/tests/users.test.ts,users-status.test.ts,user-refs.test.ts,groups.test.ts",
  userGroups: "mcp/tests/groups.test.ts,groups-get.test.ts",
  webhooks: "wrapper/tests/webhooks.test.ts,webhook-events.test.ts,webhook-fixtures.test.ts,webhook-url.test.ts; cli/tests/read-commands-webhooks.test.ts,webhooks.test.ts; mcp/tests/webhooks-create.test.ts,webhooks-ssrf.test.ts,webhooks-redact.test.ts,webhooks-delivery-diagnose.test.ts",
  invoices: "wrapper/tests/invoice-body.test.ts; cli/tests/invoices.test.ts; mcp/tests/invoices.test.ts,single-op-writes.test.ts",
  invoiceItems: "mcp/tests/invoices.test.ts (group-level)",
  invoicePayments: "mcp/tests/invoices.test.ts (group-level)",
  invoiceSettings: "none found (per-op)",
  expenses: "wrapper/tests/expense-list.test.ts,expense-update-multipart.test.ts; cli/tests/read-commands-expenses.test.ts; mcp/tests/expenses.test.ts",
  expenseCategories: "cli/tests/read-commands-expenses.test.ts; mcp/tests/expenses.test.ts",
  timeOff: "cli/tests/timeoff.test.ts; mcp/tests/time-off-get.test.ts,time-off-half-day.test.ts,timeoff-delete.test.ts,time-off-search-statuses.test.ts,time-off-resolve.test.ts",
  timeOffPolicies: "mcp/tests/time-off-policies.test.ts",
  holidays: "mcp/tests/holidays.test.ts,holidays-resolve.test.ts",
  balances: "mcp/tests/time-off-balances-update.test.ts,balance-assignments.test.ts",
  scheduling: "cli/tests/read-commands-scheduling.test.ts; mcp/tests/scheduling.test.ts,scheduling-copy.test.ts,scheduling-resolve.test.ts,scheduling-totals.test.ts,iter-maxpages.test.ts",
  reports: "wrapper/tests/reports.test.ts; cli/tests/reports.test.ts; mcp/tests/reports.test.ts",
  sharedReports: "cli/tests/read-commands-users-tags-shared-reports.test.ts; mcp/tests/sharedReports.test.ts",
  approvals: "cli/tests/approvals.test.ts; mcp/tests/approvals.test.ts",
  auditLogReport: "cli/tests/auditlog.test.ts; mcp/tests/audit.test.ts",
  timeEntries: "wrapper/tests/iter.test.ts,wire-shape-http.test.ts,generated-retry-delay.test.ts; cli/tests/entries.test.ts,start.test.ts,stop.test.ts,status.test.ts,log.test.ts; mcp/tests/entries.test.ts,work-time-tracking.test.ts",
  customFields: "mcp/tests/customFields.test.ts",
  entityChangesExperimental: "mcp/tests/entityChanges.test.ts",
  memberProfiles: "none found (per-op)",
  workspaces: "mcp/tests/server.test.ts (group-level); cli: none",
};

const esc = (s) => `"${String(s).replaceAll('"', '""')}"`;
const rows = [];
for (const [path, item] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(item)) {
    if (!op.operationId) continue;
    const p = byId.get(op.operationId);
    const group = op["x-fern-sdk-group-name"] ?? "(derived)";
    const sdkMethod = op["x-fern-sdk-method-name"] ?? op.operationId;
    const mcpTool = p?.tsMcp ?? "";
    const mcpStatus = p?.tsMcp ? "present" : "unexposed";
    const mcpEvidence = p?.tsMcp
      ? `docs/operation-parity.json tsMcp; mcp/src/tools/**`
      : `docs/operation-parity.json tsMcp=null; candidateTools=${(p?.candidateTools ?? []).join("|")}; overrideReason=${p?.overrideReason ?? "null"}`;
    const cliSurface = CLI_GROUP[group];
    const cliStatus = cliSurface
      ? "group-command"
      : "raw-fallback-only (clk115 api)";
    const cliEvidence = cliSurface
      ? `cli/src/commands/${cliSurface}`
      : "cli/src/commands/api.ts";
    const testEvidence = TEST_GROUP[group] ?? "none found (per-op)";
    const docEvidence = "docs/openapi-operations.md; docs/operation-parity.json";
    rows.push([
      op.operationId,
      method.toUpperCase(),
      path,
      group,
      sdkMethod,
      p?.sdkNaming ?? (op["x-fern-sdk-group-name"] ? "explicit" : "operationId-derived"),
      op["x-clockify-live-status"] ?? "unset",
      p?.parity?.sdkGenerated ? "present" : "absent",
      `wrapper/src/api/resources/${group}/client/Client.ts (generated)`,
      mcpTool,
      mcpStatus,
      mcpEvidence,
      cliStatus,
      cliEvidence,
      testEvidence,
      docEvidence,
    ].map(esc));
  }
}
const header = [
  "operationId",
  "method",
  "path",
  "sdkGroup",
  "sdkMethod",
  "sdkNaming",
  "liveStatus",
  "sdkSurface",
  "sdkEvidence",
  "mcpTool",
  "mcpStatus",
  "mcpEvidence",
  "cliSurface",
  "cliEvidence",
  "testEvidence",
  "docEvidence",
].map(esc);
fs.writeFileSync(
  ".ai-audit/04-CONTRACT-TRACEABILITY.csv",
  header.join(",") + "\n" + rows.map((r) => r.join(",")).join("\n") + "\n",
);
console.log(`wrote ${rows.length} rows`);
