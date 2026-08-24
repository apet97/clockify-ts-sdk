/**
 * Opt-in progressive tool disclosure.
 *
 * This server registers 163 tools. Every one of them costs context in the
 * client's tool list before the model does any work, and most sessions touch a
 * handful. Discovery mode advertises only the 22 workflow and orientation
 * tools plus one search tool, then enables domain tools as a search turns them
 * up.
 *
 * It is off unless `CLOCKIFY_MCP_DISCOVERY` is set to a truthy value. With it
 * off, this module registers nothing and disables nothing, so the default
 * surface is byte-identical to a server built without it.
 *
 * Every tool is still *registered* either way. Discovery toggles the `enabled`
 * flag the MCP SDK already maintains, which both hides a tool from
 * `tools/list` and makes calling it an error. That keeps the write-safety,
 * risk-metadata, and parity gates reading the same 163-tool surface they
 * always have.
 */
import type { McpServer, RegisteredTool } from "@modelcontextprotocol/server";
import { z } from "zod";

import { defineTool, successResult } from "../result.js";
import { registeredToolsFor } from "../tool-registry.js";

/** Enables discovery mode when set to a truthy value. */
export const DISCOVERY_ENV_VAR = "CLOCKIFY_MCP_DISCOVERY";

/** The one tool discovery adds. Registered always, enabled only in discovery
 *  mode, so every gate sees a single tool surface. */
export const SEARCH_TOOL_NAME = "clockify_tools_search";

/** Most domain tools one search may enable. A model that asks a broad
 *  question should get a shortlist, not the whole surface back. */
export const MAX_TOOLS_PER_SEARCH = 8;

/**
 * The tools that stay advertised in discovery mode: the workflow tools, the
 * orientation tools a model needs before it can search usefully, and the
 * search tool itself.
 *
 * This list is the runtime mirror of the `group: "workflow"` set in
 * `docs/mcp-tool-manifest.json`, which is generated from
 * `docs/mcp-tools.json`. `tests/discovery.test.ts` asserts the two agree, so
 * adding a workflow tool without updating this list fails there rather than
 * silently hiding the new tool.
 */
export const ALWAYS_ADVERTISED_TOOLS: readonly string[] = [
    "clockify_create_work_package",
    "clockify_demo_cleanup",
    "clockify_demo_seed",
    "clockify_docs_search",
    "clockify_doctor",
    "clockify_fix_entry",
    "clockify_invoice_client_work",
    "clockify_log_work",
    "clockify_operation_guide",
    "clockify_plan_change",
    "clockify_record_expense",
    "clockify_request_time_off",
    "clockify_review_day",
    "clockify_review_week",
    "clockify_schedule_work",
    "clockify_sdk_snippet",
    "clockify_setup_webhook",
    "clockify_start_work",
    "clockify_status",
    "clockify_stop_work",
    "clockify_switch_work",
    "clockify_tools_guide",
    SEARCH_TOOL_NAME,
];

/** Refuse to run against a surface this small. Discovery disables tools by
 *  name, so reading an empty or truncated registry would silently advertise
 *  nothing and look like a working server with no tools.
 *
 *  This is a safety floor, not the exact count, so it does not move on every
 *  tool addition. Its one job is to fail closed if central registration stops
 *  recording the public handles returned by the SDK. Exact-count regressions are caught elsewhere — the tool manifest
 *  drift gate and the hand anchors in `tests/server.test.ts` and
 *  `tests/tool-manifest.test.ts`. `tests/discovery.test.ts` keeps this floor
 *  strictly below the real registered count so it can never false-red. */
export const MIN_REGISTERED_TOOLS = 150;

export function discoveryModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    const raw = env[DISCOVERY_ENV_VAR]?.trim().toLowerCase();
    return raw !== undefined && raw !== "" && raw !== "0" && raw !== "false";
}

function readRegistry(server: McpServer): ReadonlyMap<string, RegisteredTool> {
    const registered = registeredToolsFor(server);
    if (registered.size < MIN_REGISTERED_TOOLS) {
        throw new Error(
            `discovery mode read ${registered.size} registered tools (expected >= ${MIN_REGISTERED_TOOLS}). ` +
                "The owned tool registry is missing or under-populated. " +
                "Refusing to disable a surface it cannot see.",
        );
    }
    return registered;
}

/** Rank tools by how often the query's terms appear in the searchable text.
 *  The name is worth more than the prose: a model that already half-knows the
 *  tool it wants should find it first.
 *
 *  Ranks over every searchable tool, loaded or not, so the same query always
 *  gives the same answer. Ranking only the still-hidden ones would make each
 *  repeat return the *next* eight matches, which reads as a paging API that
 *  nobody asked for and makes a re-run look like a different surface. */
function rankTools(
    registry: ReadonlyMap<string, RegisteredTool>,
    query: string,
    searchable: ReadonlySet<string>,
): Array<{ name: string; description: string; score: number }> {
    const terms = Array.from(
        new Set(
            query
                .toLowerCase()
                .split(/[^a-z0-9]+/)
                .filter((term) => term.length > 1),
        ),
    );
    if (terms.length === 0) return [];

    const ranked: Array<{ name: string; description: string; score: number }> = [];
    for (const name of searchable) {
        const handle = registry.get(name);
        if (handle === undefined) continue;
        const description = handle.description ?? handle.title ?? "";
        const haystack = `${name} ${handle.title ?? ""} ${description}`.toLowerCase();
        let score = 0;
        for (const term of terms) {
            score += occurrences(name.toLowerCase(), term) * 3 + occurrences(haystack, term);
        }
        if (score > 0) ranked.push({ name, description, score });
    }
    return ranked.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function occurrences(haystack: string, term: string): number {
    let count = 0;
    let index = haystack.indexOf(term);
    while (index !== -1) {
        count += 1;
        index = haystack.indexOf(term, index + term.length);
    }
    return count;
}

/**
 * Register the search tool and, in discovery mode, hide the domain tools it
 * brings back.
 *
 * Call once, after every other tool is registered.
 *
 * `clockify_tools_search` is registered either way, so the risk registry, the
 * tool manifest, and the parity gates all read one surface rather than one per
 * environment. Outside discovery mode it is registered **disabled**, which
 * keeps it out of `tools/list` and makes calling it an error — so the tools a
 * client can actually see are unchanged.
 */
export function registerDiscoveryTools(
    server: McpServer,
    env: NodeJS.ProcessEnv = process.env,
): void {
    const enabled = discoveryModeEnabled(env);
    const registry = readRegistry(server);
    const advertised = new Set(ALWAYS_ADVERTISED_TOOLS);
    const searchable = new Set<string>();
    const hidden = new Set<string>();

    for (const [name, handle] of registry) {
        if (advertised.has(name)) continue;
        searchable.add(name);
        hidden.add(name);
        if (enabled) handle.disable();
    }

    defineTool(
        server,
        SEARCH_TOOL_NAME,
        {
            title: "Find Clockify tools",
            description:
                `Search this server's ${searchable.size} domain tools and load the best matches, ` +
                "which then appear in your tool list. Search by what you want to do " +
                '("archive a project", "weekly report", "invoice payment"), not by tool name. ' +
                "Workflow tools are always available — try those first.",
            inputSchema: {
                query: z
                    .string()
                    .min(2)
                    .describe('What you are trying to do, for example "log time against a task".'),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(MAX_TOOLS_PER_SEARCH)
                    .optional()
                    .describe(`Most tools to load. Default and maximum ${MAX_TOOLS_PER_SEARCH}.`),
            },
        },
        (args) => {
            const limit = args.limit ?? MAX_TOOLS_PER_SEARCH;
            const matches = rankTools(registry, args.query, searchable).slice(0, limit);

            for (const match of matches) {
                // enable() on an already-enabled tool is a no-op, so re-running
                // a query neither double-loads nor grows the surface.
                registry.get(match.name)?.enable();
                hidden.delete(match.name);
            }

            return successResult(
                SEARCH_TOOL_NAME,
                {
                    loaded: matches.map((match) => ({
                        tool: match.name,
                        description: match.description,
                    })),
                    remainingHidden: hidden.size,
                },
                undefined,
                {
                    next:
                        matches.length === 0
                            ? [
                                  {
                                      tool: "clockify_tools_guide",
                                      reason: "No tool matched. Browse the surface, or search different words.",
                                  },
                              ]
                            : matches.map((match) => ({
                                  tool: match.name,
                                  reason: "Loaded by this search and callable now.",
                              })),
                },
            );
        },
    );

    if (!enabled) {
        readRegistry(server).get(SEARCH_TOOL_NAME)?.disable();
    }
}
