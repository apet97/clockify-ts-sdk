/**
 * Time-off tool surface. The four sibling modules follow the four SDK
 * resource groups that share one workflow: policies define the rules,
 * balances expose what is available, balance assignments hold the
 * per-(user, policy) record, and requests are the actual time-off events.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { Context } from "../../client.js";

import { registerTimeOffBalanceAssignmentsTools } from "./balance-assignments.js";
import { registerTimeOffBalancesTools } from "./balances.js";
import { registerTimeOffPoliciesTools } from "./policies.js";
import { registerTimeOffRequestsTools } from "./requests.js";

export function registerTimeOffTools(server: McpServer, ctx: Context): void {
    registerTimeOffRequestsTools(server, ctx);
    registerTimeOffPoliciesTools(server, ctx);
    registerTimeOffBalancesTools(server, ctx);
    registerTimeOffBalanceAssignmentsTools(server, ctx);
}
