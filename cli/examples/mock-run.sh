#!/usr/bin/env bash
# Run the CLI against the deterministic mock Clockify server — no network, no key.
#
# Terminal 1 (from the repo root): `make mock-clockify`
#   It prints a base URL, e.g. http://127.0.0.1:45881/api/v1
# Terminal 2: run this script (adjust the port if the mock printed a different one).
set -euo pipefail

export CLOCKIFY_API_KEY="mock"
export CLOCKIFY_WORKSPACE_ID="000000000000000000000001"
export CLOCKIFY_BASE_URL="http://127.0.0.1:45881/api/v1"

clk115 status --json
clk115 projects list --json
clk115 tags list --json
