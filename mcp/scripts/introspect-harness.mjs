// Shared offline introspection harness. The tool-manifest generator
// (scripts/generate-tool-manifest.mjs) and its test (tests/tool-manifest.test.ts)
// both build the real MCP server with a Context whose `client` is a Proxy that
// throws on any property access or call. That lets buildServer(ctx) register
// every tool structurally without a network/SDK call.
//
// Keep this as plain .mjs under scripts/ so it loads from both the tsx-run
// generator and the vitest-run test without entering the published package.
export function fakeContext() {
    const guard = new Proxy(function () {
        throw new Error("tool handler must not be called during introspection");
    }, {
        get: () => guard,
        apply: () => {
            throw new Error("tool handler must not be called during introspection");
        },
    });
    return { workspaceId: "ws-introspect", client: guard };
}
