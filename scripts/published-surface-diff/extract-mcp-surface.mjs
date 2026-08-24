// MCP surface extractor. Current builds expose the registry owned by
// buildServer(). Older published builds predate that API, so they are queried
// through tools/list and reconciled with their exhaustive risk registry. The
// only permitted risk-only name is that package's declared, disabled discovery
// tool. Private SDK state is never inspected on either path.
//
// `fakeContext()` (mcp/scripts/introspect-harness.mjs) is reused AS-IS from
// this repo's own scripts/ -- not shipped by either package, and
// deliberately version-independent: it is a plain `{ workspaceId, client }`
// object with a throw-on-any-access Proxy for `client`, so it registers
// every tool structurally without a network/SDK call regardless of which
// buildServer() (candidate or published) consumes it. See that file's own
// header comment.
import path from "node:path";
import { pathToFileURL } from "node:url";
import fs from "node:fs";

import { fakeContext } from "../../mcp/scripts/introspect-harness.mjs";

const MIN_REGISTERED_TOOLS = 1;

async function listToolsThroughProtocol(server) {
    const [{ Client }, { InMemoryTransport }] = await Promise.all([
        import("@modelcontextprotocol/sdk/client/index.js"),
        import("@modelcontextprotocol/sdk/inMemory.js"),
    ]);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "published-surface-diff", version: "0.0.0" });
    const names = [];

    try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        let cursor;
        do {
            const page = await client.listTools(cursor ? { cursor } : undefined);
            names.push(...page.tools.map((tool) => tool.name));
            cursor = page.nextCursor;
        } while (cursor);
    } finally {
        await Promise.allSettled([client.close(), server.close()]);
    }

    if (new Set(names).size !== names.length) {
        throw new Error("tools/list returned duplicate tool names");
    }
    return names;
}

async function listLegacyRegisteredTools(packageRoot, server) {
    const publicNames = await listToolsThroughProtocol(server);
    const riskPath = path.join(packageRoot, "dist", "tool-risk.js");
    const discoveryPath = path.join(packageRoot, "dist", "tools", "discovery.js");
    const missingArtifacts = [riskPath, discoveryPath].filter((artifactPath) => !fs.existsSync(artifactPath));
    if (missingArtifacts.length > 0) {
        throw new Error(
            `legacy MCP package cannot reconcile disabled tools; missing: ${missingArtifacts
                .map((artifactPath) => path.relative(packageRoot, artifactPath))
                .join(", ")}`,
        );
    }

    const [{ TOOL_RISK_BY_NAME }, { SEARCH_TOOL_NAME }] = await Promise.all([
        import(pathToFileURL(riskPath).href),
        import(pathToFileURL(discoveryPath).href),
    ]);
    if (TOOL_RISK_BY_NAME === null || typeof TOOL_RISK_BY_NAME !== "object" || Array.isArray(TOOL_RISK_BY_NAME)) {
        throw new Error("legacy MCP package has no usable TOOL_RISK_BY_NAME registry");
    }
    if (
        typeof SEARCH_TOOL_NAME !== "string" ||
        SEARCH_TOOL_NAME.trim().length === 0 ||
        !Object.hasOwn(TOOL_RISK_BY_NAME, SEARCH_TOOL_NAME)
    ) {
        throw new Error("legacy MCP package has no usable governed SEARCH_TOOL_NAME");
    }

    const governedNames = Object.keys(TOOL_RISK_BY_NAME);
    const governed = new Set(governedNames);
    const unclassifiedPublic = publicNames.filter((name) => !governed.has(name));
    const intentionallyHidden = governedNames.filter((name) => !publicNames.includes(name));
    if (unclassifiedPublic.length > 0) {
        throw new Error(`tools/list returned unclassified tools: ${unclassifiedPublic.sort().join(", ")}`);
    }
    if (intentionallyHidden.length > 1 || intentionallyHidden[0] !== SEARCH_TOOL_NAME) {
        throw new Error(
            `legacy risk registry hides unexpected tools: ${intentionallyHidden.sort().join(", ") || "none"}`,
        );
    }
    return governedNames;
}

/**
 * @param {string} packageRoot absolute path to the package root
 * @returns {Promise<{ version: string, tools: string[] }>} `tools` is the
 *   sorted list of registered MCP tool names.
 */
export async function extractMcpSurface(packageRoot) {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));

    const serverPath = path.join(packageRoot, "dist", "server.js");
    const { buildServer, registeredToolsFor } = await import(pathToFileURL(serverPath).href);

    // Surface extraction must not inherit a developer's local stdio setting.
    // Published builds that predate BuildServerOptions read process.env and
    // ignore the extra argument, so clear the setting while registration runs.
    const ambientDiscovery = process.env.CLOCKIFY_MCP_DISCOVERY;
    delete process.env.CLOCKIFY_MCP_DISCOVERY;
    let server;
    try {
        server = buildServer(fakeContext(), { discoveryEnv: {} });
    } finally {
        if (ambientDiscovery === undefined) {
            delete process.env.CLOCKIFY_MCP_DISCOVERY;
        } else {
            process.env.CLOCKIFY_MCP_DISCOVERY = ambientDiscovery;
        }
    }
    const tools =
        typeof registeredToolsFor === "function"
            ? [...registeredToolsFor(server).keys()]
            : await listLegacyRegisteredTools(packageRoot, server);
    if (tools.length < MIN_REGISTERED_TOOLS) {
        throw new Error(
            `extractMcpSurface(${packageRoot}): read ${tools.length} registered tools. ` +
                "The owned registry and public tools/list fallback yielded no surface. " +
                "Refusing to report a silently-empty surface as ground truth.",
        );
    }

    return { version: pkg.version, tools: tools.sort() };
}
