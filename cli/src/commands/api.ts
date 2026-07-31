/**
 * `clk115 api <method> <path>` — a scriptable raw API tier for endpoints
 * without a curated command. Calls go through the generated SDK client's
 * `fetch`, so auth, base URL, retries, and timeouts are already applied.
 */
import { readFileSync } from "node:fs";

import type { Command } from "commander";
import pc from "picocolors";

import type { ClockifyClient } from "../client.js";
import { printJson, printNdjson, type OutputOptions } from "../output.js";

import { parseIntArg, resolveBaseContext } from "./helpers.js";
import { leafCommand } from "./leaf-command.js";
import type { Registrar } from "./types.js";

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

interface ApiOptions {
    query: string[];
    header: string[];
    body?: string;
    all: boolean;
    pageSize: number;
    maxPages: number;
    includeHeaders: boolean;
}

export const registerApiCommand: Registrar = (program, services) => {
    leafCommand(program, "api", "destructive")
        .description("Call a Clockify API path directly through the SDK client.")
        .argument("<method>", "HTTP method: GET, POST, PUT, PATCH, or DELETE.")
        .argument("<path>", "API path, e.g. /workspaces/{workspaceId}/tags.")
        .option("-q, --query <key=value>", "Query parameter (repeatable).", collect, [])
        .option("-H, --header <key=value>", "Request header (repeatable).", collect, [])
        .option("--body <json|@file|->", "JSON body: inline, @file, or - for stdin.")
        .option("--all", "Walk page/page-size pagination, honoring Last-Page when present.", false)
        .option("--page-size <n>", "Page size for --all.", parseIntArg, 50)
        .option("--max-pages <n>", "Maximum pages for --all.", parseIntArg, 20)
        .option("--include-headers", "Include status and response headers in output.", false)
        .action(async function (this: Command, methodArg: string, pathArg: string, options: ApiOptions) {
            const { client, config, output } = await resolveBaseContext(this, services);
            const method = methodArg.toUpperCase();
            if (!METHODS.has(method)) {
                throw new Error(`Unsupported method "${methodArg}". Provide one of: GET, POST, PUT, PATCH, DELETE.`);
            }

            const path = resolvePath(pathArg, config.workspaceId);
            const query = parsePairs(options.query);
            const headers = parsePairs(options.header);

            if (options.all) {
                if (method !== "GET") {
                    throw new Error("--all is only supported for GET requests.");
                }
                if (options.includeHeaders) {
                    throw new Error(
                        "--include-headers is not supported with --all; each page's status and headers are consumed by the pagination walk.",
                    );
                }
                const { items, truncated } = await fetchAllPages(
                    client,
                    path,
                    query,
                    headers,
                    options.pageSize,
                    options.maxPages,
                );
                // A truncated walk is indistinguishable from a complete one on
                // stdout, so a script would treat a cut-off collection as the
                // whole set. Warn on stderr and leave stdout byte-identical, so
                // piping into jq keeps working.
                if (truncated) {
                    const prefix = output.color ? pc.yellow("WARN") : "WARN";
                    console.error(
                        `${prefix} --all stopped at the --max-pages limit (${options.maxPages}); the results are incomplete. Re-run with a larger --max-pages.`,
                    );
                }
                printApiOutput(items, output);
                return;
            }

            const body = readBody(options.body);
            const response = await client.fetch(buildPath(path, query), requestInit(method, headers, body));
            const data = await readResponseData(response);
            // Fail loudly on HTTP errors so scripts can rely on the exit code,
            // unless --include-headers asked for the raw status-bearing payload.
            if (!response.ok && !options.includeHeaders) {
                throw Object.assign(new Error(`HTTP ${response.status}: ${formatBody(data)}`), {
                    statusCode: response.status,
                });
            }
            printApiOutput(responsePayload(response, data, options.includeHeaders), output);
        });
};

function collect(value: string, previous: string[]): string[] {
    previous.push(value);
    return previous;
}

function parsePairs(values: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const value of values) {
        const index = value.indexOf("=");
        if (index <= 0) {
            throw new Error(`Expected key=value, received "${value}".`);
        }
        const key = value.slice(0, index).trim();
        if (!key) {
            throw new Error(`Expected non-empty key in "${value}".`);
        }
        result[key] = value.slice(index + 1);
    }
    return result;
}

function resolvePath(path: string, workspaceId?: string): string {
    if (!path.startsWith("/")) {
        throw new Error("API path must start with /.");
    }
    if (path.includes("{workspaceId}")) {
        if (!workspaceId) {
            throw new Error("Path uses {workspaceId}; provide --workspace or CLOCKIFY_WORKSPACE_ID.");
        }
        return path.replaceAll("{workspaceId}", workspaceId);
    }
    return path;
}

// makePassthroughRequest ignores requestOptions.queryParams, so the query
// string must be folded into the path before it reaches client.fetch. If the
// caller already put a query on the path, merge both sides into one search
// string (the -q params win on a key clash) instead of emitting a malformed
// double-`?`.
function buildPath(path: string, query: Record<string, string>): string {
    const qIndex = path.indexOf("?");
    const base = qIndex === -1 ? path : path.slice(0, qIndex);
    const params = new URLSearchParams(qIndex === -1 ? "" : path.slice(qIndex + 1));
    for (const [key, value] of Object.entries(query)) params.set(key, value);
    const search = params.toString();
    return search ? `${base}?${search}` : base;
}

function requestInit(method: string, headers: Record<string, string>, body?: string): RequestInit {
    const merged: Record<string, string> = { ...headers };
    const init: RequestInit = { method, headers: merged };
    if (body !== undefined) {
        init.body = body;
        if (!Object.keys(merged).some((key) => key.toLowerCase() === "content-type")) {
            merged["Content-Type"] = "application/json";
        }
    }
    return init;
}

function readBody(body?: string): string | undefined {
    if (body === undefined) {
        return undefined;
    }
    if (body === "-") {
        return readFileSync(0, "utf8");
    }
    if (body.startsWith("@")) {
        return readFileSync(body.slice(1), "utf8");
    }
    return body;
}

async function fetchAllPages(
    client: ClockifyClient,
    path: string,
    query: Record<string, string>,
    headers: Record<string, string>,
    pageSize: number,
    maxPages: number,
): Promise<{ items: unknown[]; truncated: boolean }> {
    const items: unknown[] = [];
    // True until a page proves the walk reached the end. Falling out of the
    // loop because `page > maxPages` leaves it set, which is exactly the
    // silently-truncated case. `parseIntArg` keeps maxPages >= 1, so the loop
    // always runs at least once.
    let truncated = true;
    for (let page = 1; page <= maxPages; page += 1) {
        const pagePath = buildPath(path, { ...query, page: String(page), "page-size": String(pageSize) });
        const response = await client.fetch(pagePath, requestInit("GET", headers));
        const data = await readResponseData(response);
        if (!response.ok) {
            throw Object.assign(new Error(`HTTP ${response.status} on page ${page}: ${formatBody(data)}`), {
                statusCode: response.status,
            });
        }
        if (!Array.isArray(data)) {
            throw new Error("--all expects each page to return a JSON array.");
        }
        const lastPage = parseLastPageHeader(response.headers.get("Last-Page"));
        items.push(...data);
        if (lastPage === true) {
            truncated = false;
            break;
        }
        if (lastPage === false) {
            continue;
        }
        if (data.length === 0 || data.length < pageSize) {
            truncated = false;
            break;
        }
    }
    return { items, truncated };
}

function parseLastPageHeader(value: string | null): boolean | undefined {
    if (value == null) return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    return undefined;
}

function formatBody(data: unknown): string {
    return typeof data === "string" ? data : JSON.stringify(data);
}

async function readResponseData(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) {
        return null;
    }
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function responsePayload(response: Response, data: unknown, includeHeaders: boolean): unknown {
    if (!includeHeaders) {
        return data;
    }
    return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        data,
    };
}

function printApiOutput(value: unknown, output: OutputOptions): void {
    if (output.mode === "ndjson") {
        printNdjson(value, output);
        return;
    }
    printJson(value, output);
}
