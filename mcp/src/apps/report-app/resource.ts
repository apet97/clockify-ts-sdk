import { readFile } from "node:fs/promises";

import type { McpServer } from "@modelcontextprotocol/server";

import {
    REPORTS_APP_MIME_TYPE,
    REPORTS_APP_RESOURCE_NAME,
    REPORTS_APP_RESOURCE_URI,
} from "./constants.js";

let reportsAppHtml: Promise<string> | undefined;

const REPORTS_APP_RESOURCE_META = {
    ui: {
        csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
        prefersBorder: true,
    },
} as const;

export function registerReportsAppResource(
    server: McpServer,
    loadHtml: () => Promise<string> = loadReportsAppHtml,
): void {
    server.registerResource(
        REPORTS_APP_RESOURCE_NAME,
        REPORTS_APP_RESOURCE_URI,
        {
            title: "Clockify Reports Ledger",
            description: "Adaptive ledger view for Clockify summary, detailed, weekly, attendance, and expense reports.",
            mimeType: REPORTS_APP_MIME_TYPE,
            _meta: REPORTS_APP_RESOURCE_META,
        },
        async () => ({
            contents: [
                {
                    uri: REPORTS_APP_RESOURCE_URI,
                    mimeType: REPORTS_APP_MIME_TYPE,
                    text: await loadHtml(),
                    _meta: REPORTS_APP_RESOURCE_META,
                },
            ],
        }),
    );
}

function loadReportsAppHtml(): Promise<string> {
    reportsAppHtml ??= readBuiltOrSourceApp();
    return reportsAppHtml;
}

async function readBuiltOrSourceApp(): Promise<string> {
    const candidates = [
        new URL("../reports-dashboard.html", import.meta.url),
        new URL("../../../dist/apps/reports-dashboard.html", import.meta.url),
    ];
    for (const candidate of candidates) {
        try {
            return await readFile(candidate, "utf8");
        } catch (error) {
            if (!isMissingFile(error)) throw error;
        }
    }
    throw new Error(
        "Reports App bundle is missing. Run `npm run build:app -w @apet97/clockify-mcp-115`.",
    );
}

function isMissingFile(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
    );
}
