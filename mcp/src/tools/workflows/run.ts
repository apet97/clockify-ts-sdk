import type { successResult } from "../../result.js";
import { errorResult } from "../../result.js";

import { defaultRecovery } from "./resolve.js";
import type { AnyRecord } from "./types.js";

export async function runWorkflow(action: string, args: AnyRecord, fn: () => Promise<ReturnType<typeof successResult>>) {
    try {
        return await fn();
    } catch (err) {
        return errorResult(action, err, defaultRecovery(action, args));
    }
}
