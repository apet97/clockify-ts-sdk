// P1 MCP surface extractor. Points at a package root's own compiled
// `dist/server.js` (exports `buildServer`) -- the same introspection
// generate-mcp-tool-schemas.mjs (W2a) and generate-tool-manifest.mjs use
// against mcp/src/server.ts, repointed at compiled JS so it works
// identically against the local candidate build and the unpacked published
// tarball.
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

/**
 * @param {string} packageRoot absolute path to the package root
 * @returns {Promise<{ version: string, tools: string[] }>} `tools` is the
 *   sorted list of registered MCP tool names.
 */
export async function extractMcpSurface(packageRoot) {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));

    const serverPath = path.join(packageRoot, "dist", "server.js");
    const { buildServer } = await import(pathToFileURL(serverPath).href);

    const server = buildServer(fakeContext());
    const registered = server._registeredTools ?? {};
    const registeredCount = Object.keys(registered).length;
    if (registeredCount < MIN_REGISTERED_TOOLS) {
        throw new Error(
            `extractMcpSurface(${packageRoot}): read ${registeredCount} registered tools. The private ` +
                "McpServer `_registeredTools` map is missing or empty; most likely a @modelcontextprotocol/sdk " +
                "version skew between this tool and the introspected server renamed that internal field. " +
                "Refusing to report a silently-empty surface as ground truth.",
        );
    }

    const tools = Object.keys(registered).sort();

    return { version: pkg.version, tools };
}
