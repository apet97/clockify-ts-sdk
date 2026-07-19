/**
 * Safe "create or reuse" helpers for the Clockify entities where the API lets you
 * create duplicate names (tags, projects, clients). Clockify does NOT enforce
 * name uniqueness, so a naive "create" re-run silently makes a second "Acme".
 * These helpers list + case-insensitively match BEFORE creating, so a re-run
 * reuses the existing record. Plus `archiveThenDeleteProject`, which encodes the
 * live-verified rule that deleting an ACTIVE project returns 400 — you must
 * archive it first.
 *
 * Pure except for the injected `list`/`create`/`archive`/`delete` callbacks, so
 * the layer is client-agnostic and unit-testable with fixtures — the same shape
 * as `resolve.ts`, whose `matchByName` (case-insensitive, exact, archived-aware)
 * is reused here.
 */
import { matchByName } from "./resolve.js";

/** The minimal shape a find-or-create entity must expose. */
export interface NamedRecord {
    id: string;
    name: string;
    archived?: boolean;
}

/** The outcome of a find-or-create: the entity, its id, and whether it was new. */
export interface EnsureResult<T> {
    /** The entity that now exists — either the reused match or the freshly created one. */
    entity: T;
    /** The resolved id (convenience accessor for `entity.id`). */
    id: string;
    /** `true` when a new entity was created; `false` when an existing one was reused. */
    created: boolean;
}

/** Callbacks a find-or-create needs: list the candidates, create one by name. */
export interface FindOrCreateOptions<T extends NamedRecord> {
    /** The name to find-or-create (matched case-insensitively, exactly). */
    name: string;
    /** List the existing entities (the caller scopes this to the workspace). */
    list: () => Promise<T[]>;
    /** Create a new entity with the given name; returns the created record. */
    create: (name: string) => Promise<T>;
    /** Match archived entities too (default: active-only, so a reuse re-activates nothing). */
    includeArchived?: boolean;
    /** Optional in-process single-flight key. Concurrent calls with the same key share one operation. */
    scopeKey?: string;
}

const ensureFlights = new Map<string, Promise<EnsureResult<NamedRecord>>>();

/**
 * Find an entity by name or create it. Throws on an ambiguous match (more than one
 * active entity with the same name) rather than guessing — the caller should
 * resolve the duplicate explicitly. Idempotent: a second call with the same name
 * reuses the first result.
 */
async function findOrCreate<T extends NamedRecord>(
    noun: string,
    opts: FindOrCreateOptions<T>,
): Promise<EnsureResult<T>> {
    if (opts.scopeKey) {
        const current = ensureFlights.get(opts.scopeKey);
        if (current) return (await current) as EnsureResult<T>;
        const { scopeKey: _scopeKey, ...unscoped } = opts;
        const flight = findOrCreate(noun, unscoped);
        ensureFlights.set(opts.scopeKey, flight);
        try {
            return await flight;
        } finally {
            if (ensureFlights.get(opts.scopeKey) === flight) ensureFlights.delete(opts.scopeKey);
        }
    }
    const match = matchByName(
        await opts.list(),
        opts.name,
        opts.includeArchived !== undefined ? { includeArchived: opts.includeArchived } : {},
    );
    if (match.kind === "one") return { entity: match.entity, id: match.entity.id, created: false };
    if (match.kind === "many") {
        throw new Error(
            `More than one ${noun} is named "${opts.name}"; resolve the duplicate explicitly before ensuring it.`,
        );
    }
    const entity = await opts.create(opts.name);
    return { entity, id: entity.id, created: true };
}

/**
 * Find a tag by name (case-insensitive) or create it. Idempotent.
 *
 * @example
 * ```ts
 * const tag = await ensureTag({
 *   name: "Billable",
 *   list: () => client.tags.list({ workspaceId }),
 *   create: (name) => client.tags.create({ workspaceId, name }),
 * });
 * ```
 */
export function ensureTag<T extends NamedRecord>(
    opts: FindOrCreateOptions<T>,
): Promise<EnsureResult<T>> {
    return findOrCreate("tag", opts);
}

/** Find a project by name (case-insensitive) or create it. Idempotent. */
export function ensureProject<T extends NamedRecord>(
    opts: FindOrCreateOptions<T>,
): Promise<EnsureResult<T>> {
    return findOrCreate("project", opts);
}

/** Find a client by name (case-insensitive) or create it. Idempotent. */
export function ensureClient<T extends NamedRecord>(
    opts: FindOrCreateOptions<T>,
): Promise<EnsureResult<T>> {
    return findOrCreate("client", opts);
}

/**
 * The outcome of an archive-then-delete: which steps actually ran, plus the id
 * (under both a generic `id` and the entity-specific `projectId`/`clientId` alias
 * the call sites build their receipts from).
 */
export interface ArchiveThenDeleteResult {
    /** The id of the entity that was archived-then-deleted. */
    id: string;
    /** Convenience alias of {@link id} for project call sites. */
    projectId: string;
    /** Convenience alias of {@link id} for client call sites. */
    clientId: string;
    /** `true` if this call archived the entity (it was active); `false` if it was skipped. */
    archived: boolean;
    /** `true` once the DELETE succeeded. */
    deleted: boolean;
}

/** Stable identity passed to every archive-then-delete adapter callback. */
export interface ArchiveThenDeleteTarget {
    workspaceId: string;
    id: string;
}

/** Typed current state passed to the archive callback after the name guard. */
export interface ArchiveThenDeleteArchiveInput<
    TCurrent extends object,
> extends ArchiveThenDeleteTarget {
    current: TCurrent & { name: string };
}

/**
 * Precise boundary between the generic archive-then-delete workflow and an SDK
 * resource. The adapter owns resource-specific request shapes; the workflow owns
 * current-state validation and the get-current -> archive -> delete ordering.
 */
export interface ArchiveThenDeleteAdapter<TCurrent extends object> {
    getCurrent: (target: ArchiveThenDeleteTarget) => Promise<TCurrent>;
    archive: (input: ArchiveThenDeleteArchiveInput<TCurrent>) => Promise<void>;
    delete: (target: ArchiveThenDeleteTarget) => Promise<void>;
}

/** What the {@link archiveThenDelete} core needs to run the full sequence. */
interface ArchiveThenDeleteOptions<TCurrent extends object> {
    /** Human noun for error messages and the per-entity id key ("project" | "client"). */
    noun: "project" | "client";
    workspaceId: string;
    /** The id of the entity to archive-then-delete. */
    id: string;
    /** Typed callbacks that adapt the concrete SDK resource to this workflow. */
    adapter: ArchiveThenDeleteAdapter<TCurrent>;
    /** Skip the GET + archive steps when the entity is already known to be archived. */
    alreadyArchived?: boolean;
}

/**
 * The full archive-then-delete sequence, the way the live Clockify API actually
 * allows it: GET the current replacement state → archive (replace-PUT
 * `archived: true`) → DELETE.
 *
 * Deleting an ACTIVE project/client returns HTTP 400 ("Cannot delete an active
 * …", live-verified 2026-06-15/17) and the dedicated `/archive` routes 404, so a
 * direct SDK caller must archive first. The archive is a *replace*-PUT, so the
 * sequence GETs the current state and carries editable fields through — erroring
 * clearly when the entity has no name (otherwise the PUT would blank it). The
 * resource-specific request translation lives in the adapter; this core owns the
 * current-state guard, ordering, and delete receipt.
 *
 * @throws if the entity has no name to carry through the replace-PUT archive step.
 */
async function archiveThenDelete<TCurrent extends object>(
    opts: ArchiveThenDeleteOptions<TCurrent>,
): Promise<ArchiveThenDeleteResult> {
    const target: ArchiveThenDeleteTarget = {
        workspaceId: opts.workspaceId,
        id: opts.id,
    };
    let archived = false;
    if (!opts.alreadyArchived) {
        const current = await opts.adapter.getCurrent(target);
        const name = "name" in current && typeof current.name === "string" ? current.name : "";
        if (!name) {
            throw new Error(
                `Cannot archive ${opts.noun} before delete: the ${opts.noun} has no name to carry through the replace-PUT.`,
            );
        }
        await opts.adapter.archive({ ...target, current: { ...current, name } });
        archived = true;
    }
    await opts.adapter.delete(target);
    return { id: opts.id, projectId: opts.id, clientId: opts.id, archived, deleted: true };
}

/** Options for {@link archiveThenDeleteProject} / {@link archiveThenDeleteClient}. */
export interface ArchiveThenDeleteEntityOptions<TCurrent extends object> {
    workspaceId: string;
    /** The project/client id to archive-then-delete. */
    id: string;
    /** Resource-specific callbacks for the current state, archive write, and delete. */
    adapter: ArchiveThenDeleteAdapter<TCurrent>;
    /** Skip the GET + archive steps when the entity is already archived. */
    alreadyArchived?: boolean;
}

/**
 * Delete a project the live-allowed way: get current state → archive → delete.
 * Owns the empty-name guard and ordering; the adapter translates those steps to
 * the project's generated request shapes. See `spec/evidence/discrepancies.md`
 * `deletes.archive-first.*`.
 *
 * @example
 * ```ts
 * await archiveThenDeleteProject({ workspaceId, id: projectId, adapter });
 * ```
 */
export function archiveThenDeleteProject<TCurrent extends object>(
    opts: ArchiveThenDeleteEntityOptions<TCurrent>,
): Promise<ArchiveThenDeleteResult> {
    return archiveThenDelete({
        noun: "project",
        workspaceId: opts.workspaceId,
        id: opts.id,
        adapter: opts.adapter,
        ...(opts.alreadyArchived !== undefined ? { alreadyArchived: opts.alreadyArchived } : {}),
    });
}

/**
 * Delete a client the live-allowed way: get current state → archive → delete.
 * Owns the empty-name guard and ordering; the adapter is responsible for the
 * endpoint's replacement semantics and must carry untouched editable values
 * into its archive write. See
 * `spec/evidence/discrepancies.md` `deletes.archive-first.clients-blocked`.
 *
 * @example
 * ```ts
 * await archiveThenDeleteClient({ workspaceId, id: clientId, adapter });
 * ```
 */
export function archiveThenDeleteClient<TCurrent extends object>(
    opts: ArchiveThenDeleteEntityOptions<TCurrent>,
): Promise<ArchiveThenDeleteResult> {
    return archiveThenDelete({
        noun: "client",
        workspaceId: opts.workspaceId,
        id: opts.id,
        adapter: opts.adapter,
        ...(opts.alreadyArchived !== undefined ? { alreadyArchived: opts.alreadyArchived } : {}),
    });
}
