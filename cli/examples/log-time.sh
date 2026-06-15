#!/usr/bin/env bash
# time-entry: log a finished entry. Duration accepts 1h30m / 90m / PT1H30M.
#
# `clk115 log` takes project/task/tag IDs (run list-projects.sh to find one).
# `clk115 start` is the sibling that resolves project/task/tag NAMES to ids
# case-insensitively — e.g. `clk115 start "Focus" --project "Acme"`.
set -euo pipefail

PROJECT_ID="${1:-<project-id>}" # pass an id as $1, or replace the placeholder

clk115 log 1h30m "Sprint planning" --project "$PROJECT_ID" --billable
