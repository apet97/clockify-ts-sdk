import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it } from "vitest";

import {
    REPORTS_APP_MIME_TYPE,
    REPORTS_APP_RESOURCE_URI,
} from "../src/apps/report-app/constants.js";
import { buildReportsAppHtml } from "../src/apps/report-app/html.js";
import { registerReportsAppResource } from "../src/apps/report-app/resource.js";
import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let closeCurrent: () => Promise<void> = async () => {};
const execFileAsync = promisify(execFile);

afterEach(async () => {
    await closeCurrent();
    closeCurrent = async () => {};
});

describe("Reports MCP App resource", () => {
    it("lists and reads one auditable resource with identical locked-down UI metadata", async () => {
        const server = new McpServer(
            { name: "reports-app-resource-test", version: "1.0.0" },
            { capabilities: { resources: {} } },
        );
        registerReportsAppResource(server, async () => "<!doctype html><title>Ledger</title>");
        const client = await connect(server);

        const listed = (await client.listResources()).resources.find(
            (resource) => resource.uri === REPORTS_APP_RESOURCE_URI,
        );
        expect(listed).toMatchObject({
            uri: REPORTS_APP_RESOURCE_URI,
            mimeType: REPORTS_APP_MIME_TYPE,
            _meta: {
                ui: {
                    prefersBorder: true,
                    csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
                },
            },
        });
        expect(listed?._meta).not.toHaveProperty("ui/resourceUri");
        expect(listed?._meta?.ui).not.toHaveProperty("permissions");
        expect(listed?._meta?.ui).not.toHaveProperty("domain");

        const read = await client.readResource({ uri: REPORTS_APP_RESOURCE_URI });
        expect(read.contents).toHaveLength(1);
        expect(read.contents[0]).toMatchObject({
            uri: REPORTS_APP_RESOURCE_URI,
            mimeType: REPORTS_APP_MIME_TYPE,
            text: "<!doctype html><title>Ledger</title>",
            _meta: listed?._meta,
        });
    });

    it("makes exactly five report tools app-visible and every other tool model-only", async () => {
        const context: Context = {
            workspaceId: "workspace-for-listing",
            client: {} as Context["client"],
        };
        const client = await connect(buildServer(context));
        const tools = (await client.listTools()).tools;
        const appVisible = tools.filter((tool) => {
            const ui = record(tool._meta?.ui);
            return Array.isArray(ui?.visibility) && ui.visibility.includes("app");
        });

        expect(appVisible.map((tool) => tool.name).sort()).toEqual([
            "clockify_reports_attendance",
            "clockify_reports_detailed",
            "clockify_reports_expense",
            "clockify_reports_summary",
            "clockify_reports_weekly",
        ]);
        for (const tool of appVisible) {
            expect(tool._meta).toMatchObject({
                ui: {
                    resourceUri: REPORTS_APP_RESOURCE_URI,
                    visibility: ["model", "app"],
                },
            });
            expect(tool._meta).not.toHaveProperty("ui/resourceUri");
        }
        for (const tool of tools.filter((candidate) => !appVisible.includes(candidate))) {
            expect(tool._meta).toMatchObject({ ui: { visibility: ["model"] } });
        }
    });

    it("builds one self-contained HTML document and rejects incomplete templates", () => {
        const template = [
            "<!doctype html><style>/*__REPORTS_APP_STYLES__*/</style>",
            "<main id=app></main><script>/*__REPORTS_APP_SCRIPT__*/</script>",
        ].join("");
        const html = buildReportsAppHtml({
            template,
            styles: "body{color:CanvasText}",
            script: "document.querySelector('#app').textContent='ready';",
        });

        expect(html).toContain("body{color:CanvasText}");
        expect(html).toContain("textContent='ready'");
        expect(html).not.toContain("__REPORTS_APP_");
        expect(html).not.toMatch(/<(?:link|iframe)\b|<script[^>]+src=/iu);
        expect(() =>
            buildReportsAppHtml({
                template: "<style>/*__REPORTS_APP_STYLES__*/</style>",
                styles: "",
                script: "",
            }),
        ).toThrow(/exactly one.*SCRIPT/u);
    });

    it("keeps browser-only modules in typecheck and esbuild but out of the server emit graph", async () => {
        const tsc = resolve("../node_modules/typescript/bin/tsc");
        const [{ stdout: buildFiles }, { stdout: typecheckFiles }] = await Promise.all([
            execFileAsync(process.execPath, [tsc, "-p", "tsconfig.build.json", "--listFilesOnly"]),
            execFileAsync(process.execPath, [tsc, "-p", "tsconfig.json", "--listFilesOnly"]),
        ]);
        const browserModules = [
            "app-policy.ts",
            "model-validation.ts",
            "renderer.ts",
            "widget.ts",
        ];

        for (const module of browserModules) {
            expect(typecheckFiles).toContain(`/src/apps/report-app/${module}`);
            expect(buildFiles).not.toContain(`/src/apps/report-app/${module}`);
        }
    });
});

async function connect(server: McpServer): Promise<Client> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "reports-app-test-client", version: "1.0.0" });
    await client.connect(clientTransport);
    closeCurrent = async () => {
        await client.close();
        await server.close();
    };
    return client;
}

function record(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value))
        : undefined;
}
