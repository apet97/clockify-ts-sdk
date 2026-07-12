import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

function envelope(result: CallToolResult): Record<string, unknown> {
    const text = (result.content[0] as { text?: string } | undefined)?.text ?? "{}";
    return JSON.parse(text) as Record<string, unknown>;
}

function callToolResult(result: Awaited<ReturnType<Client["callTool"]>>): CallToolResult {
    if (!("content" in result) || !Array.isArray(result.content)) {
        throw new TypeError("guarded test call unexpectedly returned a task result");
    }
    return result as CallToolResult;
}

/** Preview and execute one guarded tool call, preserving schema/preview errors. */
export async function callGuarded(
    client: Client,
    request: { name: string; arguments: Record<string, unknown> },
): Promise<CallToolResult> {
    const preview = callToolResult(
        await client.callTool({
            name: request.name,
            arguments: { ...request.arguments, dry_run: true },
        }),
    );
    if (preview.isError) return preview;
    const token = (envelope(preview).data as { confirm_token?: unknown } | undefined)
        ?.confirm_token;
    if (typeof token !== "string" || token.length === 0) return preview;
    return callToolResult(
        await client.callTool({
            name: request.name,
            arguments: { ...request.arguments, confirm_token: token },
        }),
    );
}
