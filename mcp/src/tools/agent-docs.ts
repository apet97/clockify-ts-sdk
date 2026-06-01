import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { searchAgentDocs } from "../agent-docs/search.js";
import { errorResult, successResult } from "../result.js";

const SNIPPETS = {
    status: {
        sdk: "const clockify = createClockifyClient(); const health = await clockify.health();",
        cli: "clockify115 status --output json",
        mcp: "Call clockify_status with no arguments.",
    },
    pagination: {
        sdk: "for await (const tag of iterAll(clockify.tags.getTags, workspaceId, { pageSize: 50 })) { console.log(tag.id); }",
        cli: "clockify115 api GET /workspaces/{workspaceId}/tags --all --page-size 50 --output ndjson",
        mcp: "Call clockify_tags_list with page and pageSize, then continue while more pages are needed.",
    },
    "safe-write": {
        sdk: "const receipt = await toOperationReceipt(clockify.tags.create({ workspaceId, name }), { action: 'tag.create' });",
        cli: "clockify115 api POST /workspaces/{workspaceId}/tags --body '{\"name\":\"sandbox\"}' --include-headers --output json",
        mcp: "Call the delete/admin tool with dry_run: true, inspect confirm_token, then call again with confirm_token.",
    },
    "raw-api": {
        sdk: "const response = await clockify.fetch('/workspaces/' + workspaceId + '/tags', { method: 'GET' });",
        cli: "clockify115 api GET /workspaces/{workspaceId}/tags --query page=1 --query page-size=20 --output json",
        mcp: "Use clockify_operation_guide before choosing a domain tool for long-tail operations.",
    },
    webhook: {
        sdk: "const event = constructEvent(rawBody, signatureTokenHeader, { secret });",
        cli: "clockify115 webhooks list --output json",
        mcp: "Call clockify_setup_webhook with dry_run: true and inspect URL safety warnings.",
    },
} as const;

type SnippetTopic = keyof typeof SNIPPETS;
type SnippetSurface = keyof (typeof SNIPPETS)[SnippetTopic];

export function registerAgentDocsTools(server: McpServer): void {
    server.registerTool(
        "clockify_docs_search",
        {
            title: "Search Clockify agent docs",
            description:
                "Search compact Clockify SDK, CLI, and MCP guidance for agents. Read-only; returns ranked guidance chunks.",
            inputSchema: {
                query: z.string().min(1),
                max_results: z.number().int().min(1).max(10).optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const results = searchAgentDocs(args.query, args.max_results ?? 5).map((result) => ({
                id: result.chunk.id,
                title: result.chunk.title,
                surface: result.chunk.surface,
                score: result.score,
                excerpt: result.excerpt,
                tools: result.chunk.tools,
                sdk_imports: result.chunk.sdkImports,
                cli_examples: result.chunk.cliExamples,
                next: result.chunk.next,
            }));
            return successResult("clockify_docs_search", { results }, undefined, {
                entity: "agent-docs",
                next:
                    results.length > 0
                        ? [{ tool: "clockify_operation_guide", reason: "Get a task-specific SDK/CLI/MCP path." }]
                        : [
                              {
                                  tool: "clockify_docs_search",
                                  reason: "Retry with terms like status, pagination, webhook, dry_run, or raw api.",
                              },
                          ],
            });
        },
    );

    server.registerTool(
        "clockify_operation_guide",
        {
            title: "Clockify operation guide",
            description:
                "Map a user task, operation, or tool name to the recommended SDK, CLI, and MCP paths. Read-only.",
            inputSchema: {
                task: z.string().min(1).optional(),
                operation: z.string().min(1).optional(),
                tool: z.string().min(1).optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const query = [args.task, args.operation, args.tool].filter(Boolean).join(" ");
            if (!query) {
                return errorResult(
                    "clockify_operation_guide",
                    new Error("Provide task, operation, or tool."),
                    "Pass at least one of task, operation, or tool.",
                );
            }
            const matches = searchAgentDocs(query, 3).map((result) => ({
                id: result.chunk.id,
                title: result.chunk.title,
                surface: result.chunk.surface,
                recommended_tools: result.chunk.tools,
                sdk_imports: result.chunk.sdkImports,
                cli_examples: result.chunk.cliExamples,
                next: result.chunk.next,
            }));
            return successResult("clockify_operation_guide", { query, matches }, undefined, {
                entity: "agent-docs",
                next:
                    matches.length > 0
                        ? [{ tool: "clockify_status", reason: "Confirm workspace and auth before live actions." }]
                        : [
                              {
                                  tool: "clockify_docs_search",
                                  reason: "Search with broader terms before choosing a write tool.",
                              },
                          ],
            });
        },
    );

    server.registerTool(
        "clockify_sdk_snippet",
        {
            title: "Clockify SDK/CLI/MCP snippet",
            description:
                "Return a compact SDK, CLI, or MCP usage snippet for a common Clockify task. Read-only.",
            inputSchema: {
                topic: z.enum(["status", "pagination", "safe-write", "raw-api", "webhook"]),
                surface: z.enum(["sdk", "cli", "mcp"]).optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const surface: SnippetSurface = args.surface ?? "sdk";
            return successResult(
                "clockify_sdk_snippet",
                { topic: args.topic, surface, snippet: SNIPPETS[args.topic][surface] },
                undefined,
                { entity: "agent-docs" },
            );
        },
    );
}
