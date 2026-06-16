/**
 * Map a resolver clarify (`{ clarify, options? }` from
 * clockify-sdk-ts-115/resolve) into the MCP `clarification` success envelope, so a
 * name in an id slot that is ambiguous/unknown returns a grounded "did you mean?"
 * receipt (real candidate ids) and NEVER reaches the write/list API.
 */
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { successResult } from "../result.js";

export interface ResolverClarify {
    clarify: string;
    options?: Array<{ id: string; label: string }>;
}

export function clarifyResult(
    action: string,
    field: string,
    entityType: string,
    clarify: ResolverClarify,
): CallToolResult {
    return successResult(action, null, undefined, {
        clarification: {
            question: clarify.clarify,
            field,
            candidates: clarify.options?.map((o) => ({ type: entityType, id: o.id, name: o.label })),
        },
    });
}
