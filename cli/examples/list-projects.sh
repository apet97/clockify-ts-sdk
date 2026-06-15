#!/usr/bin/env bash
# pagination: list projects.
#
# `projects list` returns ONE page (tune with --limit, max 200, and --page N).
# To walk EVERY page of any endpoint, use the raw `api` command's --all flag;
# the {workspaceId} placeholder is substituted from CLOCKIFY_WORKSPACE_ID.
set -euo pipefail

clk115 projects list --json                 # first page, JSON
clk115 projects list --limit 200 --page 1   # human table, up to 200 rows

# Walk all pages of the raw projects endpoint:
clk115 api GET '/workspaces/{workspaceId}/projects' --all --json
