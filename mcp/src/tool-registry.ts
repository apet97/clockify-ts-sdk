import type { McpServer, RegisteredTool } from "@modelcontextprotocol/server";

const toolRegistries = new WeakMap<McpServer, Map<string, RegisteredTool>>();
const EMPTY_REGISTRY: ReadonlyMap<string, RegisteredTool> = new Map();

/** Record the public handle returned by `McpServer.registerTool`. */
export function recordRegisteredTool(
    server: McpServer,
    name: string,
    tool: RegisteredTool,
): void {
    let registry = toolRegistries.get(server);
    if (registry === undefined) {
        registry = new Map();
        toolRegistries.set(server, registry);
    }
    registry.set(name, tool);
}

/** Read this package's registered tools without depending on SDK internals. */
export function registeredToolsFor(
    server: McpServer,
): ReadonlyMap<string, RegisteredTool> {
    return toolRegistries.get(server) ?? EMPTY_REGISTRY;
}
