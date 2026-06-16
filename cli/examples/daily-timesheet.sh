#!/usr/bin/env bash
# daily-timesheet: print today's time entries and a per-project total.
#
# Requires CLOCKIFY_API_KEY + CLOCKIFY_WORKSPACE_ID in the environment (use a
# sacrificial sandbox workspace), or CLOCKIFY_BASE_URL pointing at the local mock
# server (see mock-run.sh). Read-only — nothing here mutates.
#
# Expected output: a table of today's entries, then the same data as JSON for
# scripting. Pipe the JSON form into jq for custom rollups.
set -euo pipefail

DAY="${1:-today}"

# Human-readable review of one day (totals, gaps, running timer, missing fields).
clk115 review day --date "$DAY"

# Machine-readable: today's entries as JSON, newest first.
clk115 entries list --date "$DAY" --output json

# Example rollup with jq (uncomment if jq is installed):
# clk115 entries list --date "$DAY" --output json \
#   | jq -r 'group_by(.projectId) | map({project: .[0].projectId, count: length}) '
