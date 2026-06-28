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

    server.registerPrompt(
        "clockify-getting-started",
        {
            title: "Clockify: Getting Started",
            description:
                "First-run setup walkthrough: from API key + workspace to your first logged time entry.",
        },
        () => ({
            messages: [
                {
                    role: "user" as const,
                    content: {
                        type: "text" as const,
                        text:
                            "Walk me through setting up this Clockify MCP server for the first time. " +
                            "Return a short numbered checklist:\n\n" +
                            "1. Confirm CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID are set in the MCP " +
                            "client's env block for @apet97/clockify-mcp-115.\n" +
                            "2. Call clockify_status to confirm credentials, the pinned workspace, the " +
                            "current user, and any running timer.\n" +
                            "3. Read the clockify://guide/which-tool resource to map intent to the first tool.\n" +
                            "4. Use clockify_create_work_package to create or reuse a project, task, or tag.\n" +
                            "5. Log the first entry with clockify_log_work (finished work) or start a live " +
                            "timer with clockify_start_work.\n" +
                            "6. For invoices, expenses, time off, scheduling, or webhooks, preview with " +
                            "dry_run and reuse the returned confirm_token.\n\n" +
                            "If clockify_status fails, report the stable error code and recovery hint instead " +
                            "of retrying blindly.",
                    },
                },
            ],
        }),
    );
}
