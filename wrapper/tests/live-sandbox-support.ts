export interface LiveTagRecord {
    id?: string;
    name?: string;
}

export interface LiveTagOperations {
    create: (name: string, workspaceId: string) => Promise<LiveTagRecord>;
    get: (tagId: string, workspaceId: string) => Promise<LiveTagRecord>;
    update: (tagId: string, name: string, workspaceId: string) => Promise<LiveTagRecord>;
    delete: (tagId: string, workspaceId: string) => Promise<unknown>;
}

export interface LiveTagRoundTripOptions {
    workspaceId: string;
    prefix: string;
    operations: LiveTagOperations;
}

export interface LiveTagRoundTripResult {
    tagId: string;
    createdName: string;
    fetchedName: string;
    updatedName: string;
}

export interface LiveMutationEnvironment {
    apiKey?: string;
    workspaceId?: string;
    workspaceConfirm?: string;
    prefix?: string;
}

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

function requiredText(value: unknown, label: string): string {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`Live tag ${label} is missing.`);
    }
    return value;
}

/**
 * Exercise the mutable tag surface while guaranteeing deletion after creation.
 * The operations are injected so the lifecycle can be proven offline and then
 * bound to the real generated client only inside the env-gated sandbox suite.
 */
export async function runLiveTagRoundTrip(
    options: LiveTagRoundTripOptions,
): Promise<LiveTagRoundTripResult> {
    const createdName = `${options.prefix}sdk-tag`;
    const updatedName = `${options.prefix}sdk-tag-updated`;
    let tagId: string | undefined;

    try {
        const created = await options.operations.create(createdName, options.workspaceId);
        tagId = requiredText(created.id, "create response id");
        const actualCreatedName = requiredText(created.name, "create response name");
        if (actualCreatedName !== createdName) {
            throw new Error("Live tag create response did not preserve the requested name.");
        }

        const fetched = await options.operations.get(tagId, options.workspaceId);
        if (fetched.id !== tagId) {
            throw new Error("Live tag get response returned a different id.");
        }
        const fetchedName = requiredText(fetched.name, "get response name");

        const updated = await options.operations.update(tagId, updatedName, options.workspaceId);
        if (updated.id !== tagId) {
            throw new Error("Live tag update response returned a different id.");
        }
        const actualUpdatedName = requiredText(updated.name, "update response name");
        if (actualUpdatedName !== updatedName) {
            throw new Error("Live tag update response did not preserve the requested name.");
        }

        return {
            tagId,
            createdName: actualCreatedName,
            fetchedName,
            updatedName: actualUpdatedName,
        };
    } finally {
        if (tagId !== undefined) {
            await options.operations.delete(tagId, options.workspaceId);
        }
    }
}
