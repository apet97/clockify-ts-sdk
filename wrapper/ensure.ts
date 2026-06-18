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
import { warnOnce } from "./deprecation.js";
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
}

/**
 * Find an entity by name or create it. Throws on an ambiguous match (more than one
 * active entity with the same name) rather than guessing — the caller should
 * resolve the duplicate explicitly. Idempotent: a second call with the same name
 * reuses the first result.
 */
async function findOrCreate<T extends NamedRecord>(noun: string, opts: FindOrCreateOptions<T>): Promise<EnsureResult<T>> {
    const match = matchByName(await opts.list(), opts.name, { includeArchived: opts.includeArchived });
    if (match.kind === "one") return { entity: match.entity, id: match.entity.id, created: false };
    if (match.kind === "many") {
        throw new Error(
            `More than one ${noun} is named "${opts.name}"; resolve the duplicate explicitly before ensuring it.`,
        );
    }
    const entity = await opts.create(opts.name);
    return { entity, id: entity.id, created: true };
}

/** Find a tag by name (case-insensitive) or create it. Idempotent. */
export function ensureTag<T extends NamedRecord>(opts: FindOrCreateOptions<T>): Promise<EnsureResult<T>> {
    return findOrCreate("tag", opts);
}

/** Find a project by name (case-insensitive) or create it. Idempotent. */
export function ensureProject<T extends NamedRecord>(opts: FindOrCreateOptions<T>): Promise<EnsureResult<T>> {
    return findOrCreate("project", opts);
}

/** Find a client by name (case-insensitive) or create it. Idempotent. */
export function ensureClient<T extends NamedRecord>(opts: FindOrCreateOptions<T>): Promise<EnsureResult<T>> {
    return findOrCreate("client", opts);
}

/**
 * @deprecated Use {@link ensureClient}. Renamed for consistency with
 * `ensureTag` / `ensureProject`; this alias will be removed in the next
 * major. Delegates to `ensureClient`.
 */
export function findOrCreateClient<T extends NamedRecord>(opts: FindOrCreateOptions<T>): Promise<EnsureResult<T>> {
    warnOnce("findOrCreateClient", "`findOrCreateClient` is deprecated; use `ensureClient` instead (since v0.10.0).");
    return ensureClient(opts);
}

/** The outcome of an archive-then-delete: which steps actually ran. */
export interface ArchiveThenDeleteResult {
    projectId: string;
    /** `true` if this call archived the project (it was active); `false` if it was skipped. */
    archived: boolean;
    /** `true` once the DELETE succeeded. */
    deleted: boolean;
}

/**
 * Delete a project the way the live API actually allows it: archive first, then
 * delete. Deleting an ACTIVE project returns HTTP 400, so `clockify_projects_delete`
 * and any direct SDK caller must archive (PUT `archived: true`) before the DELETE.
 * Pass `alreadyArchived: true` to skip the archive step when the project is known
 * to be archived already.
 */
export async function archiveThenDeleteProject(opts: {
    projectId: string;
    /** Archive the project (PUT update with `archived: true`). */
    archiveProject: (projectId: string) => Promise<void>;
    /** Delete the (now archived) project. */
    deleteProject: (projectId: string) => Promise<void>;
    /** Skip the archive step when the project is already archived. */
    alreadyArchived?: boolean;
}): Promise<ArchiveThenDeleteResult> {
    let archived = false;
    if (!opts.alreadyArchived) {
        await opts.archiveProject(opts.projectId);
        archived = true;
    }
    await opts.deleteProject(opts.projectId);
    return { projectId: opts.projectId, archived, deleted: true };
}
