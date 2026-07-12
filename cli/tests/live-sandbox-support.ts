export interface CliLiveResources {
    entryId?: string;
    invoiceId?: string;
    task?: { projectId: string; taskId: string };
    projectId?: string;
    clientId?: string;
    tagId?: string;
}

export interface CliLiveCleanupOperations {
    deleteEntry: (entryId: string) => Promise<unknown>;
    deleteInvoice: (invoiceId: string) => Promise<unknown>;
    deleteTask: (task: { projectId: string; taskId: string }) => Promise<unknown>;
    deleteProject: (projectId: string) => Promise<unknown>;
    deleteClient: (clientId: string) => Promise<unknown>;
    deleteTag: (tagId: string) => Promise<unknown>;
}

export interface LiveMutationEnvironment {
    apiKey?: string;
    workspaceId?: string;
    workspaceConfirm?: string;
    prefix?: string;
}

export type EntitlementMarker =
    | "CLOCKIFY_LIVE_ENTITLEMENT:feature_unavailable"
    | "CLOCKIFY_LIVE_ENTITLEMENT:http_402";

function trimmed(value: string | undefined): string {
    return value?.trim() ?? "";
}

/** Return undefined for an offline run; reject any partially armed live mutation run. */
export function resolveLiveMutationPrefix(env: LiveMutationEnvironment): string | undefined {
    const apiKey = trimmed(env.apiKey);
    const workspaceId = trimmed(env.workspaceId);
    if (!apiKey && !workspaceId) return undefined;
    if (!apiKey || !workspaceId) {
        throw new Error("Live mutation credentials are incomplete.");
    }
    const prefix = trimmed(env.prefix);
    if (!/^clockify115-live-[A-Za-z0-9][A-Za-z0-9._:-]*-[A-Za-z0-9]+-$/.test(prefix)) {
        throw new Error("Live mutation prefix is missing or invalid.");
    }
    if (trimmed(env.workspaceConfirm) !== workspaceId) {
        throw new Error("Live mutation workspace is unconfirmed.");
    }
    return prefix;
}

function objectValue(value: unknown, key: string): unknown {
    if (typeof value !== "object" || value === null) return undefined;
    return (value as Record<string, unknown>)[key];
}

/** Return the root-orchestrator marker for governed entitlement signals only. */
export function entitlementMarker(error: unknown): EntitlementMarker | undefined {
    const message = error instanceof Error ? error.message : String(error);
    if (
        objectValue(error, "code") === "feature_unavailable" ||
        /"code"\s*:\s*"feature_unavailable"/.test(message)
    ) {
        return "CLOCKIFY_LIVE_ENTITLEMENT:feature_unavailable";
    }
    if (objectValue(error, "statusCode") === 402 || objectValue(error, "status") === 402) {
        return "CLOCKIFY_LIVE_ENTITLEMENT:http_402";
    }
    const response = objectValue(error, "response");
    if (objectValue(response, "status") === 402) {
        return "CLOCKIFY_LIVE_ENTITLEMENT:http_402";
    }
    if (/\bHTTP(?:\s+status)?\s*402\b/i.test(message)) {
        return "CLOCKIFY_LIVE_ENTITLEMENT:http_402";
    }
    return undefined;
}

/** Accept only the governed entitlement signals. Permission and not-found errors remain failures. */
export function isEntitlementUnavailable(error: unknown): boolean {
    return entitlementMarker(error) !== undefined;
}

export function requireReceiptId(payload: unknown, key: string): string {
    const ids = objectValue(payload, "ids");
    const id = objectValue(ids, key);
    if (typeof id !== "string" || id.length === 0) {
        throw new Error(`CLI live receipt is missing ${key}.`);
    }
    return id;
}

/**
 * Best-effort, dependency-ordered fallback cleanup for CLI live tests. Every
 * operation is an SDK callback; later resources are still attempted if an
 * earlier cleanup fails, and the aggregate failure remains test-visible.
 */
export async function cleanupCliLiveResources(
    resources: CliLiveResources,
    operations: CliLiveCleanupOperations,
): Promise<void> {
    const failures: unknown[] = [];
    const attempt = async (action: (() => Promise<unknown>) | undefined): Promise<void> => {
        if (action === undefined) return;
        try {
            await action();
        } catch (error) {
            failures.push(error);
        }
    };

    await attempt(
        resources.entryId === undefined
            ? undefined
            : () => operations.deleteEntry(resources.entryId!),
    );
    await attempt(
        resources.invoiceId === undefined
            ? undefined
            : () => operations.deleteInvoice(resources.invoiceId!),
    );
    await attempt(
        resources.task === undefined ? undefined : () => operations.deleteTask(resources.task!),
    );
    await attempt(
        resources.projectId === undefined
            ? undefined
            : () => operations.deleteProject(resources.projectId!),
    );
    await attempt(
        resources.clientId === undefined
            ? undefined
            : () => operations.deleteClient(resources.clientId!),
    );
    await attempt(
        resources.tagId === undefined ? undefined : () => operations.deleteTag(resources.tagId!),
    );

    if (failures.length > 0) {
        throw new AggregateError(failures, "CLI live sandbox cleanup failed.");
    }
}
