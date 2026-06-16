#!/usr/bin/env bash
# export-json: export workspace data as machine-readable JSON / NDJSON for piping.
#
# Requires CLOCKIFY_API_KEY + CLOCKIFY_WORKSPACE_ID in the environment (use a
# sacrificial sandbox workspace), or CLOCKIFY_BASE_URL pointing at the local mock
# server (see mock-run.sh). Read-only — nothing here mutates.
#
# Expected output: project/client/tag lists as JSON, plus an NDJSON stream of all
# projects (one object per line) suitable for `jq -c` or streaming consumers.
set -euo pipefail

OUT_DIR="${1:-.}"

# One-shot JSON snapshots.
clk115 projects list --output json > "$OUT_DIR/projects.json"
clk115 clients list  --output json > "$OUT_DIR/clients.json"
clk115 tags list     --output json > "$OUT_DIR/tags.json"

# Stream every page as NDJSON (one project per line) for large workspaces.
clk115 api GET "/workspaces/$CLOCKIFY_WORKSPACE_ID/projects" --all --output ndjson \
  > "$OUT_DIR/projects.ndjson"

echo "Wrote projects.json, clients.json, tags.json, projects.ndjson to $OUT_DIR"
