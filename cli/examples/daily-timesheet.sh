#!/usr/bin/env bash
# daily-timesheet: print today's time entries and a per-project total.
#
# Requires CLOCKIFY_API_KEY + CLOCKIFY_WORKSPACE_ID in the environment (use a
# sacrificial sandbox workspace), or CLOCKIFY_BASE_URL pointing at the local mock
# server (see mock-run.sh). Read-only — nothing here mutates.
#
# Expected output: today's entries as JSON, then a per-project summary total.
# Pipe the entries JSON into jq for custom rollups.
set -euo pipefail

DAY="${1:-$(date -u +%Y-%m-%d)}"

# Machine-readable: today's entries as JSON, newest first.
clk115 entries list --from "$DAY" --to "$DAY" --output json

# Per-project totals for the same day.
clk115 reports summary --from "$DAY" --to "$DAY" --groups PROJECT --output json

# Example rollup with jq (uncomment if jq is installed):
# clk115 entries list --from "$DAY" --to "$DAY" --output json \
#   | jq -r 'group_by(.projectId) | map({project: .[0].projectId, count: length}) '
