#!/usr/bin/env bash
# time-entry: log a finished entry. Duration accepts 1h30m / 90m / PT1H30M.
#
# `clk115 log` accepts project/task/tag NAMES or IDs — the same shared
# resolution as `clk115 start`: a 24-char id passes straight through, a name is
# resolved case-insensitively (e.g. `--project "Acme"`).
set -euo pipefail

PROJECT="${1:-Acme}" # a project NAME (resolved) or a 24-char id

clk115 log 1h30m "Sprint planning" --project "$PROJECT" --billable
