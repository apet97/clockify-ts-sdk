import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerClockifyPrompts(server: McpServer): void {
    server.registerPrompt(
        "clockify-workflow-plan",
        {
            title: "Clockify Workflow Plan",
            description: "Plan a safe Clockify workflow using status, workflow tools, receipts, and recovery hints.",
            argsSchema: {
                goal: z.string().optional(),
            },
        },
        ({ goal }) => {
            const normalizedGoal = goal?.trim() || "not specified";

            return {
                messages: [
                    {
                        role: "user" as const,
                        content: {
                            type: "text" as const,
                            text:
                                "Plan a safe Clockify MCP workflow for the user goal below.\n\n" +
                                `Goal: ${normalizedGoal}\n\n` +
                                "Return a numbered plan. Start with clockify_status. Prefer workflow tools " +
                                "before domain tools. Use IDs from receipts instead of re-resolving names. " +
                                "For invoices, expenses, time off, scheduling, and webhooks, include a dry_run " +
                                "preview step before any confirmed write. Include the expected receipt fields " +
                                "and the recovery code to report if the call fails.",
                        },
                    },
                ],
            };
        },
    );
}
