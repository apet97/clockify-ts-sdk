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
import type { ClockifyApi, ClockifyRequestBody } from "./requests.js";
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
 * @deprecated Use {@link ensureClient}. Renamed for consistency with
 * `ensureTag` / `ensureProject`; this alias will be removed in the next
 * major. Delegates to `ensureClient`.
 */
export function findOrCreateClient<T extends NamedRecord>(
    opts: FindOrCreateOptions<T>,
): Promise<EnsureResult<T>> {
    warnOnce(
        "findOrCreateClient",
        "`findOrCreateClient` is deprecated; use `ensureClient` instead (since v0.10.0).",
    );
    return ensureClient(opts);
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

/**
 * The minimal SDK-resource surface the archive-then-delete sequence drives. The
 * project (`client.projects`) and client (`client.clients`) resources both satisfy
 * this shape, so the helper takes the resource directly and owns the GET / archive
 * / DELETE wire calls — the call site no longer re-spells them. `get`/`update`/
 * `delete` are duck-typed loosely (see the `any` note below) so both resources fit
 * without leaking their generated request types into this layer.
 */
export interface ArchiveThenDeleteResource {
    // Params are intentionally `any`: the generated `projects`/`clients` clients
    // type `get`/`update`/`delete` with their own required request shapes
    // (`GetProjectsRequest` etc.), and a method whose param is *narrower* than the
    // interface's is not assignable. `any` lets both concrete resources satisfy
    // this seam without leaking their generated request types into this layer; the
    // helper builds correctly-keyed request objects at the call sites below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get: (req: any) => Promise<unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: (req: any) => Promise<unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete: (req: any) => Promise<unknown>;
}

/** What the {@link archiveThenDelete} core needs to run the full sequence. */
interface ArchiveThenDeleteOptions {
    /** Human noun for error messages and the per-entity id key ("project" | "client"). */
    noun: "project" | "client";
    workspaceId: string;
    /** The id of the entity to archive-then-delete. */
    id: string;
    /** The resource (`client.projects` / `client.clients`) whose get/update/delete to drive. */
    resource: ArchiveThenDeleteResource;
    /** Build the archive request from the complete GET response. */
    archiveRequest: (id: string, current: Record<string, unknown> & { name: string }) => unknown;
    /** Skip the GET + archive steps when the entity is already known to be archived. */
    alreadyArchived?: boolean;
}

/** The id key on the GET / DELETE requests for each entity. */
const ID_KEY = { project: "projectId", client: "clientId" } as const;

/**
 * The full archive-then-delete sequence, the way the live Clockify API actually
 * allows it: GET the name → archive (replace-PUT `archived: true`) → DELETE.
 *
 * Deleting an ACTIVE project/client returns HTTP 400 ("Cannot delete an active
 * …", live-verified 2026-06-15/17) and the dedicated `/archive` routes 404, so a
 * direct SDK caller must archive first. The archive is a *replace*-PUT, so the
 * sequence GETs the current name and carries it through — erroring clearly when
 * the entity has no name (otherwise the PUT would blank it). The only per-entity
 * difference is the archive request body, supplied by `archiveRequest`; this core
 * owns the GET-name step, the empty-name guard, the ordering, and the DELETE.
 *
 * @throws if the entity has no name to carry through the replace-PUT archive step.
 */
async function archiveThenDelete(opts: ArchiveThenDeleteOptions): Promise<ArchiveThenDeleteResult> {
    const idKey = ID_KEY[opts.noun];
    let archived = false;
    if (!opts.alreadyArchived) {
        const current = (await opts.resource.get({
            workspaceId: opts.workspaceId,
            [idKey]: opts.id,
        })) as Record<string, unknown>;
        const name = typeof current.name === "string" ? current.name : "";
        if (!name) {
            throw new Error(
                `Cannot archive ${opts.noun} before delete: the ${opts.noun} has no name to carry through the replace-PUT.`,
            );
        }
        await opts.resource.update(opts.archiveRequest(opts.id, { ...current, name }));
        archived = true;
    }
    await opts.resource.delete({ workspaceId: opts.workspaceId, [idKey]: opts.id });
    return { id: opts.id, projectId: opts.id, clientId: opts.id, archived, deleted: true };
}

/** Options for {@link archiveThenDeleteProject} / {@link archiveThenDeleteClient}. */
export interface ArchiveThenDeleteEntityOptions {
    workspaceId: string;
    /** The project/client id to archive-then-delete. */
    id: string;
    /** The SDK resource to drive — `client.projects` or `client.clients`. */
    resource: ArchiveThenDeleteResource;
    /** Skip the GET + archive steps when the entity is already archived. */
    alreadyArchived?: boolean;
}

/**
 * Delete a project the live-allowed way: GET the name → archive (flattened
 * `projects.update({name, archived:true})`, since the project update whitelist HAS
 * `archived`) → DELETE. Owns the empty-name guard. Pass `client.projects` as the
 * `resource`. See `spec/evidence/discrepancies.md` `deletes.archive-first.*`.
 *
 * @example
 * ```ts
 * await archiveThenDeleteProject({ workspaceId, id: projectId, resource: client.projects });
 * ```
 */
export function archiveThenDeleteProject(
    opts: ArchiveThenDeleteEntityOptions,
): Promise<ArchiveThenDeleteResult> {
    return archiveThenDelete({
        noun: "project",
        workspaceId: opts.workspaceId,
        id: opts.id,
        resource: opts.resource,
        ...(opts.alreadyArchived !== undefined ? { alreadyArchived: opts.alreadyArchived } : {}),
        // Flattened: the project update whitelist accepts `archived` directly.
        archiveRequest: (projectId, current) => ({
            workspaceId: opts.workspaceId,
            projectId,
            name: current.name,
            archived: true,
        }),
    });
}

/**
 * Delete a client the live-allowed way: GET the complete editable state → archive
 * with a typed replacement body → DELETE. The generated update type now exposes
 * `archived`, but the endpoint still replaces the document, so every untouched
 * editable value must survive the archive write.
 * Pass `client.clients` as the `resource`. See
 * `spec/evidence/discrepancies.md` `deletes.archive-first.clients-blocked`.
 *
 * @example
 * ```ts
 * await archiveThenDeleteClient({ workspaceId, id: clientId, resource: client.clients });
 * ```
 */
export function archiveThenDeleteClient(
    opts: ArchiveThenDeleteEntityOptions,
): Promise<ArchiveThenDeleteResult> {
    return archiveThenDelete({
        noun: "client",
        workspaceId: opts.workspaceId,
        id: opts.id,
        resource: opts.resource,
        ...(opts.alreadyArchived !== undefined ? { alreadyArchived: opts.alreadyArchived } : {}),
        archiveRequest: (clientId, current) => {
            const body: ClockifyRequestBody<ClockifyApi.UpdateClientsRequest> = {
                name: current.name,
                archived: true,
            };
            for (const key of ["address", "currencyCode", "email", "note"] as const) {
                const value = current[key];
                if (typeof value === "string") body[key] = value;
            }
            return { workspaceId: opts.workspaceId, clientId, body };
        },
    });
}
