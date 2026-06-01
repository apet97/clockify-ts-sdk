import { errorResult, successResult } from "../../result.js";
import type { AnyRecord } from "./types.js";
import { defaultRecovery } from "./resolve.js";

export async function runWorkflow(action: string, args: AnyRecord, fn: () => Promise<ReturnType<typeof successResult>>) {
    try {
        return await fn();
    } catch (err) {
        return errorResult(action, err, defaultRecovery(action, args));
    }
}
