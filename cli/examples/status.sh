#!/usr/bin/env bash
# auth-status: confirm credentials, workspace, and any running timer.
#
# Requires CLOCKIFY_API_KEY + CLOCKIFY_WORKSPACE_ID in the environment (use a
# sacrificial sandbox workspace), or CLOCKIFY_BASE_URL pointing at the local mock
# server (see mock-run.sh). Nothing here is destructive.
set -euo pipefail

clk115 status          # human-readable table
clk115 status --json   # JSON for scripting
