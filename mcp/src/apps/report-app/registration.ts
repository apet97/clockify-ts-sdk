import type { CallToolResult } from "@modelcontextprotocol/server";

import {
    REPORTS_APP_MODEL_META_KEY,
} from "./constants.js";
import type { ReportsAppModelV1 } from "./model-types.js";

export function withReportsAppModel(
    result: CallToolResult,
    createModel: () => ReportsAppModelV1,
): CallToolResult {
    try {
        return {
            ...result,
            _meta: {
                ...(result._meta ?? {}),
                [REPORTS_APP_MODEL_META_KEY]: createModel(),
            },
        };
    } catch {
        // The App is additive. A new or malformed upstream response must not
        // replace the already-built, host-readable success receipt.
        return result;
    }
}
