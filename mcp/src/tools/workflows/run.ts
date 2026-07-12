import { errorResult, successResult } from "../../result.js";

import { AmbiguousNameError, defaultRecovery } from "./resolve.js";
import type { AnyRecord } from "./types.js";

export async function prepareWorkflow<T>(
    action: string,
    args: AnyRecord,
    fn: () => Promise<T>,
): Promise<T | ReturnType<typeof successResult>> {
    try {
        return await fn();
    } catch (err) {
        if (err instanceof AmbiguousNameError) {
            return successResult(action, null, undefined, {
                clarification: {
                    question: `More than one ${err.field} is named ${JSON.stringify(err.value)}. Which one?`,
                    field: err.field,
                    candidates: err.candidates,
                },
            });
        }
        return errorResult(action, err, defaultRecovery(action, args));
    }
}

export async function runWorkflow(
    action: string,
    args: AnyRecord,
    fn: () => Promise<ReturnType<typeof successResult>>,
) {
    try {
        return await fn();
    } catch (err) {
        if (err instanceof AmbiguousNameError) {
            // An ambiguous name is not a failure: surface a grounded "did you mean?"
            // receipt with the real candidate ids so the caller can re-invoke with the
            // chosen id instead of guessing a name that maps to the wrong entity.
            return successResult(action, null, undefined, {
                clarification: {
                    question: `More than one ${err.field} is named ${JSON.stringify(err.value)}. Which one?`,
                    field: err.field,
                    candidates: err.candidates,
                },
            });
        }
        return errorResult(action, err, defaultRecovery(action, args));
    }
}
