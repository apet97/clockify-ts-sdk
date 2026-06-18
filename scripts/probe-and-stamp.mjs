#!/usr/bin/env node
/**
 * Read-only, credentials-optional live probe helper.
 *
 * With CLOCKIFY_API_KEY/CLOCKIFY_WORKSPACE_ID unset, exits 0 as an offline-safe
 * no-op. With sandbox credentials, captures safe read probes to git-ignored
 * spec/evidence/probes/*.json, redacts them into committed fixtures, and prints
 * ledger rows for docs/live-probe-ledger.json.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const apiKey = process.env.CLOCKIFY_API_KEY ?? "";
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID ?? "";
if (!apiKey || !workspaceId) {
    console.log("probe-and-stamp: skipped (CLOCKIFY_API_KEY / CLOCKIFY_WORKSPACE_ID not set). Offline-safe no-op.");
    process.exit(0);
}

const safelist = [
    { name: "projects.list", op: "getWorkspaceProjects", method: "GET", url: `/workspaces/${workspaceId}/projects?page=1&page-size=5`, bucket: "live-success" },
    { name: "clients.list", op: "getClients", method: "GET", url: `/workspaces/${workspaceId}/clients?page=1&page-size=5`, bucket: "live-success" },
    { name: "tags.list", op: "getTags", method: "GET", url: `/workspaces/${workspaceId}/tags?page=1&page-size=5`, bucket: "live-success" },
    { name: "invoices.list", op: "getInvoices", method: "GET", url: `/workspaces/${workspaceId}/invoices?page=1&page-size=5`, bucket: "live-success" },
    { name: "timeoff.requests.search", op: "getTimeOffRequests", method: "POST", url: `/workspaces/${workspaceId}/time-off/requests`, body: { page: 1, pageSize: 5, statuses: ["ALL"] }, bucket: "live-success" },
    { name: "users.me", op: "getAuthenticatedUser", method: "GET", url: "/user", bucket: "live-success" },
];
const requested = new Set(process.argv.slice(2));
const selected = requested.size
    ? safelist.filter((entry) => requested.has(entry.name) || requested.has(entry.op))
    : safelist;
if (requested.size) {
    const known = new Set(safelist.flatMap((entry) => [entry.name, entry.op]));
    const unknown = [...requested].filter((name) => !known.has(name));
    if (unknown.length > 0) {
        console.error(`unknown probe name(s): ${unknown.join(", ")}`);
        console.error(`known probes: ${safelist.map((entry) => `${entry.name} (${entry.op})`).join(", ")}`);
        process.exit(2);
    }
}

const base = (process.env.CLOCKIFY_BASE_URL ?? "https://api.clockify.me/api/v1").replace(/\/$/, "");
const probesDir = path.join(root, "spec/evidence/probes");
fs.mkdirSync(probesDir, { recursive: true });

const rows = [];
const today = new Date().toISOString().slice(0, 10);

for (const entry of selected) {
    const init = {
        method: entry.method,
        headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
    };
    if (entry.body) init.body = JSON.stringify(entry.body);

    let status = 0;
    let json = null;
    try {
        const response = await fetch(`${base}${entry.url}`, init);
        status = response.status;
        json = await response.json().catch(() => null);
    } catch (error) {
        console.error(`probe ${entry.name}: request error (${error.message}) - recording status 0`);
    }

    fs.writeFileSync(path.join(probesDir, `${entry.name}.json`), `${JSON.stringify(json ?? {}, null, 2)}\n`);
    const redact = spawnSync(process.execPath, ["scripts/build-replay-fixtures.mjs", entry.name, "--op", entry.op], {
        cwd: root,
        stdio: "inherit",
    });
    const bucket = status === 200
        ? entry.bucket
        : status === 401 || status === 403
          ? "permission-gated"
          : status === 404 || status === 405
            ? "unsupported"
            : "workspace-state-limited";
    rows.push({
        operationId: entry.op,
        method: entry.method,
        path: entry.url.replace(workspaceId, "{workspaceId}").split("?")[0],
        status,
        bucket,
        probedAt: today,
        fixture: `spec/evidence/fixtures/${entry.name}.json`,
    });
    console.log(`probed ${entry.name} -> HTTP ${status} (${bucket})${redact.status === 0 ? " + redacted fixture" : ""}`);
}

console.log("\nAppend these rows to docs/live-probe-ledger.json `rows`:");
console.log(JSON.stringify(rows, null, 2));
