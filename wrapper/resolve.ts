/**
 * Name → id resolution for Clockify entities. A CLI flag or an agent argument is
 * usually a *name* ("Acme"), not a 24-hex id; sending that name to the wire as an
 * id 404s, and matching it case-sensitively misses "acme". These helpers resolve
 * a reference to a real id BEFORE the call, and return a grounded "did you mean?"
 * clarify on a miss or an ambiguous match — never a silently-wrong id.
 *
 * Ported from the ai-assistant addon (which proved the failure modes live: a
 * case-sensitive `===` missed real projects, and a `?? { id: name }` fallback
 * shipped a typo'd name to the wire). Pure except for the `list` callbacks the
 * caller supplies, so the layer is client-agnostic and testable with fixtures.
 */

/** A "did you mean?" option: the real id plus a human label (archived-tagged). */
export interface ClarifyOption {
    id: string;
    label: string;
}

/** A grounded clarify result — a question plus optional resolved options. */
export interface ClarifyResult {
    clarify: string;
    options?: ClarifyOption[];
}

/** The archived filter Clockify list methods accept (the wire defaults to active-only). */
export interface ArchivedFilter {
    archived?: boolean;
}

/** True for a 24-hex Clockify id (so a name in an id slot can be told apart). */
export function looksLikeClockifyId(value: string): boolean {
    return /^[0-9a-f]{24}$/i.test(value.trim());
}

/** The outcome of matching a name against a list: exactly one, several, or none. */
export type NameMatch<T> = { kind: "none" } | { kind: "one"; entity: T } | { kind: "many"; matches: T[] };

/**
 * Case-insensitive EXACT name match (Clockify's own `name` filter is contains+ci).
 * `matchKeys` (default `["name"]`) lets a caller match across extra fields — e.g.
 * `["name","email"]` for users — so the multi-field matching the MCP workflow used
 * to re-derive now lives in this one canonical matcher.
 */
export function matchByName<T extends { name: string; archived?: boolean }>(
    items: T[],
    name: string,
    opts?: { includeArchived?: boolean; matchKeys?: readonly string[] },
): NameMatch<T> {
    const target = name.trim().toLowerCase();
    const keys = opts?.matchKeys ?? ["name"];
    const matches = items.filter(
        (item) =>
            (opts?.includeArchived || !item.archived) &&
            keys.some((key) => {
                const value = (item as Record<string, unknown>)[key];
                return typeof value === "string" && value.trim().toLowerCase() === target;
            }),
    );
    if (matches.length === 0) return { kind: "none" };
    const [first, ...rest] = matches;
    if (rest.length === 0 && first) return { kind: "one", entity: first };
    return { kind: "many", matches };
}

/** Most "did you mean?" options to offer when a named entity isn't found. */
const MAX_SUGGESTIONS = 12;

/** A clarify label that flags archived candidates so duplicates are tellable apart. */
function optionLabel(item: { name: string; archived?: boolean }): string {
    return item.archived ? `${item.name} (archived)` : item.name;
}

/** Build grounded "did you mean?" options, preferring name-contains matches, capped. */
export function suggestOptions<T extends { id: string; name: string; archived?: boolean }>(
    items: T[],
    query: string,
    opts?: { includeArchived?: boolean },
): ClarifyOption[] {
    const candidates = opts?.includeArchived ? items : items.filter((item) => !item.archived);
    const q = query.trim().toLowerCase();
    const contains = q ? candidates.filter((item) => item.name.toLowerCase().includes(q)) : [];
    const pool = contains.length > 0 ? contains : candidates;
    return pool.slice(0, MAX_SUGGESTIONS).map((item) => ({ id: item.id, label: optionLabel(item) }));
}

/** Resolved id (+ entity) or a grounded clarify. */
export type ResolveEntityResult<T> =
    | { ok: true; id: string; name?: string; entity?: T }
    | { ok: false; clarify: ClarifyResult };

/**
 * Fetch active + archived entities explicitly — the real list adapters default
 * to active-only on the wire, so an includeArchived resolution must ask for both
 * states. Deduped by id in case a backend ignores the filter.
 */
async function listBothArchivedStates<T extends { id: string }>(
    list: (filter?: ArchivedFilter) => Promise<T[]>,
): Promise<T[]> {
    const [active, archived] = await Promise.all([list({ archived: false }), list({ archived: true })]);
    const seen = new Set(active.map((item) => item.id));
    return [...active, ...archived.filter((item) => !seen.has(item.id))];
}

/**
 * Resolve a possibly-symbolic entity reference (an id OR a name) to a real id, so
 * an identity mistake becomes a clarify rather than a wrong/failed call.
 *
 * - A 24-hex `id` is trusted as-is (no list call on the happy path).
 * - A non-hex `id` is checked against the listed ids first (fakes/tests use short
 *   ids), then treated as a name.
 * - A `name` resolves via {@link matchByName}; none/many stop and ask with
 *   grounded "did you mean?" options.
 * - `includeArchived` lets destructive/archive verbs target an archived entity by
 *   name; `verifyId` forces a list lookup even for a 24-hex id (so the preview can
 *   show the real name, or a wrong id clarifies instead of 404ing at commit).
 * - `notFoundHint` appends a caller-specific sentence to the none-match clarify.
 */
export async function resolveEntityRef<T extends { id: string; name: string; archived?: boolean }>(
    ref: { id?: string; name?: string },
    opts: {
        noun: string;
        verb: string;
        list: (filter?: ArchivedFilter) => Promise<T[]>;
        includeArchived?: boolean;
        notFoundHint?: string;
        verifyId?: boolean;
    },
): Promise<ResolveEntityResult<T>> {
    const rawId = ref.id?.trim();
    const isHexId = !!rawId && looksLikeClockifyId(rawId);
    if (rawId && isHexId && !opts.verifyId) return { ok: true, id: rawId, name: ref.name };
    const query = (ref.name ?? rawId ?? "").trim();
    const includeArchived = opts.includeArchived === true;
    const items = includeArchived ? await listBothArchivedStates(opts.list) : await opts.list();
    if (rawId) {
        const exact = items.find((item) => item.id === rawId);
        if (exact) return { ok: true, id: exact.id, name: exact.name, entity: exact };
        // A VERIFIED hex id that isn't in the list must clarify — never fall
        // through to matching a DIFFERENT entity by the (unverified) name.
        if (isHexId && opts.verifyId) {
            const article = /^[aeiou]/i.test(opts.noun) ? "an" : "a";
            return { ok: false, clarify: { clarify: `I couldn't find ${article} ${opts.noun} with id ${rawId} to ${opts.verb}.` } };
        }
    }
    const match = matchByName(items, query, { includeArchived });
    if (match.kind === "one") {
        return { ok: true, id: match.entity.id, name: match.entity.name, entity: match.entity };
    }
    if (match.kind === "many") {
        const qualifier = includeArchived ? "" : "active ";
        return {
            ok: false,
            clarify: {
                clarify: `More than one ${qualifier}${opts.noun} is named "${query}". Which one should I ${opts.verb}?`,
                options: match.matches.map((m) => ({ id: m.id, label: optionLabel(m) })),
            },
        };
    }
    const options = suggestOptions(items, query, { includeArchived });
    const article = includeArchived ? (/^[aeiou]/i.test(opts.noun) ? "an" : "a") : "an active";
    const base = options.length
        ? `I couldn't find ${article} ${opts.noun} named "${query}". Did you mean one of these?`
        : `There is no ${includeArchived ? "" : "active "}${opts.noun} named "${query}" to ${opts.verb}.`;
    return {
        ok: false,
        clarify: {
            clarify: opts.notFoundHint ? `${base} ${opts.notFoundHint}` : base,
            options: options.length ? options : undefined,
        },
    };
}

/**
 * Resolve the optional project/task slot pair entry-shaped operations carry: a
 * name in either slot resolves, a task name needs its project (else it clarifies).
 * Returns resolved names so previews can speak names, not ids. No refs ⇒ all
 * passthrough.
 */
export async function resolveProjectTaskRefs(
    refs: { projectId?: string; projectName?: string; taskId?: string; taskName?: string },
    opts: {
        verb: string;
        listProjects: (filter?: ArchivedFilter) => Promise<Array<{ id: string; name: string; archived?: boolean }>>;
        listTasks: (projectId: string) => Promise<Array<{ id: string; name: string }>>;
        projectNotFoundHint?: string;
    },
): Promise<
    | { ok: true; projectId?: string; projectName?: string; taskId?: string; taskName?: string }
    | { ok: false; clarify: ClarifyResult }
> {
    let projectId: string | undefined;
    let projectName: string | undefined;
    if (refs.projectId?.trim() || refs.projectName?.trim()) {
        const project = await resolveEntityRef(
            { id: refs.projectId, name: refs.projectName },
            { noun: "project", verb: opts.verb, list: opts.listProjects, notFoundHint: opts.projectNotFoundHint },
        );
        if (!project.ok) return project;
        projectId = project.id;
        projectName = project.name;
    }

    let taskId: string | undefined;
    let taskName: string | undefined;
    const rawTaskId = refs.taskId?.trim();
    if (rawTaskId && looksLikeClockifyId(rawTaskId)) {
        // An already-resolved task id is trusted as-is — no project needed.
        taskId = rawTaskId;
        taskName = refs.taskName;
    } else if (rawTaskId || refs.taskName?.trim()) {
        const query = (refs.taskName ?? rawTaskId ?? "").trim();
        if (!projectId) {
            return { ok: false, clarify: { clarify: `To ${opts.verb} task "${query}" I need the project. Which project is it in?` } };
        }
        const scopedProjectId = projectId;
        const task = await resolveEntityRef(
            { id: rawTaskId, name: refs.taskName },
            { noun: "task", verb: opts.verb, list: () => opts.listTasks(scopedProjectId) },
        );
        if (!task.ok) return task;
        taskId = task.id;
        taskName = task.name;
    }

    return { ok: true, projectId, projectName, taskId, taskName };
}

/**
 * Resolve ONE user reference — an id, an exact name, or "me" — to a verified user
 * id, so a name in the id slot or a wrong-typed id clarifies at preview rather
 * than failing at commit. `trustIds` (read filters) takes a 24-hex value without
 * a list call; the default verifies even a 24-hex value for write paths.
 */
export async function resolveUserRef(
    ref: { id?: string; name?: string },
    opts: {
        verb: string;
        meUserId: string;
        listUsers: () => Promise<Array<{ id: string; name: string }>>;
        trustIds?: boolean;
    },
): Promise<{ ok: true; userId: string; label: string } | { ok: false; clarify: ClarifyResult }> {
    if ((ref.id ?? ref.name ?? "").trim().toLowerCase() === "me") {
        return { ok: true, userId: opts.meUserId, label: "you" };
    }
    const rawId = ref.id?.trim();
    if (opts.trustIds && rawId && looksLikeClockifyId(rawId)) {
        return { ok: true, userId: rawId, label: ref.name ?? rawId };
    }
    const users = await opts.listUsers();
    let user = rawId ? users.find((u) => u.id === rawId) : undefined;
    if (!user) {
        // A name may have been passed in EITHER slot — match it after the id lookup.
        const query = (ref.name ?? ref.id ?? "").trim();
        if (query) {
            const match = matchByName(users, query);
            if (match.kind === "many") {
                return {
                    ok: false,
                    clarify: {
                        clarify: `Several workspace users match "${query}". Which one should I ${opts.verb}?`,
                        options: match.matches.map((u) => ({ id: u.id, label: u.name })),
                    },
                };
            }
            if (match.kind === "one") user = match.entity;
        }
    }
    if (!user) {
        const target = (ref.name ?? ref.id ?? "").trim();
        return {
            ok: false,
            clarify: {
                clarify: `"${target}" isn't a workspace member, so I can't ${opts.verb} them.`,
                options: suggestOptions(users, target),
            },
        };
    }
    return { ok: true, userId: user.id, label: user.name };
}

/**
 * Generic LIST resolver — id/exact-name (and an optional `special` token like
 * "me") → ids + display labels, with a grounded clarify on any ambiguous/unknown
 * entry. Order is kept, duplicates collapse, `labels[i]` pairs with `ids[i]`, and
 * `list` is called at most once. The single place this logic lives —
 * `resolveUserRefs`/`resolveGroupRefs`/`resolveTagRefs` are thin wrappers, so they
 * can never drift apart.
 *
 * `trustIds`: when true a 24-hex value is taken as an id WITHOUT a list call (the
 * assignee happy path). When false even a 24-hex value is verified against the
 * real list — a wrong-typed id then clarifies instead of hitting the wire.
 */
async function resolveRefList(
    refs: string[],
    opts: {
        verb: string;
        pluralNoun: string;
        singularPhrase: string;
        pronoun: string;
        list: () => Promise<Array<{ id: string; name: string }>>;
        special?: (ref: string) => { id: string; label: string } | undefined;
        trustIds?: boolean;
    },
): Promise<{ ok: true; ids: string[]; labels: string[] } | { ok: false; clarify: ClarifyResult }> {
    const ids: string[] = [];
    const labels: string[] = [];
    const push = (id: string, label: string): void => {
        if (!ids.includes(id)) {
            ids.push(id);
            labels.push(label);
        }
    };
    let items: Array<{ id: string; name: string }> | undefined;
    for (const raw of refs) {
        const ref = raw.trim();
        if (!ref) continue;
        const special = opts.special?.(ref);
        if (special) {
            push(special.id, special.label);
            continue;
        }
        if (opts.trustIds && looksLikeClockifyId(ref)) {
            push(ref, ref);
            continue;
        }
        if (!items) items = await opts.list();
        const byId = items.find((x) => x.id === ref);
        if (byId) {
            push(byId.id, byId.name);
            continue;
        }
        const match = matchByName(items, ref);
        if (match.kind === "one") {
            push(match.entity.id, match.entity.name);
            continue;
        }
        if (match.kind === "many") {
            return {
                ok: false,
                clarify: {
                    clarify: `Several ${opts.pluralNoun} match "${ref}". Which one should I ${opts.verb}?`,
                    options: match.matches.map((x) => ({ id: x.id, label: x.name })),
                },
            };
        }
        return {
            ok: false,
            clarify: {
                clarify: `"${ref}" isn't ${opts.singularPhrase}, so I can't ${opts.verb} ${opts.pronoun}.`,
                options: suggestOptions(items, ref),
            },
        };
    }
    return { ok: true, ids, labels };
}

/**
 * Resolve a LIST of user references — ids, exact names, or "me" — to user ids with
 * display labels. "me" maps to `meUserId` (label "you"). See {@link resolveRefList};
 * `verifyIds` sets `trustIds: false` so a 24-hex value is verified rather than
 * blindly trusted (permission-affecting writes).
 */
export async function resolveUserRefs(
    refs: string[],
    opts: { verb: string; meUserId: string; listUsers: () => Promise<Array<{ id: string; name: string }>>; verifyIds?: boolean },
): Promise<{ ok: true; userIds: string[]; labels: string[] } | { ok: false; clarify: ClarifyResult }> {
    const r = await resolveRefList(refs, {
        verb: opts.verb,
        pluralNoun: "workspace users",
        singularPhrase: "a workspace member",
        pronoun: "them",
        list: opts.listUsers,
        special: (ref) => (ref.toLowerCase() === "me" ? { id: opts.meUserId, label: "you" } : undefined),
        trustIds: !opts.verifyIds,
    });
    return r.ok ? { ok: true, userIds: r.ids, labels: r.labels } : r;
}

/**
 * Resolve a LIST of user-GROUP references — ids or exact names — to group ids with
 * display labels. No "me"; a 24-hex value is ALWAYS verified against the real
 * groups (so a project/user id in a group slot clarifies, never hits the wire).
 * See {@link resolveRefList}.
 */
export async function resolveGroupRefs(
    refs: string[],
    opts: { verb: string; listGroups: () => Promise<Array<{ id: string; name: string }>> },
): Promise<{ ok: true; groupIds: string[]; labels: string[] } | { ok: false; clarify: ClarifyResult }> {
    const r = await resolveRefList(refs, {
        verb: opts.verb,
        pluralNoun: "user groups",
        singularPhrase: "a user group",
        pronoun: "it",
        list: opts.listGroups,
        trustIds: false,
    });
    return r.ok ? { ok: true, groupIds: r.ids, labels: r.labels } : r;
}

/**
 * Resolve a LIST of TAG references — ids or exact names — to tag ids. A 24-hex
 * value is trusted without a list call (tags on an entry aren't
 * permission-affecting; a wrong id is a wire 400, caught there); names/short ids
 * resolve against the real tags with grounded clarifies. See {@link resolveRefList}.
 */
export async function resolveTagRefs(
    refs: string[],
    opts: { verb: string; listTags: () => Promise<Array<{ id: string; name: string }>> },
): Promise<{ ok: true; tagIds: string[]; labels: string[] } | { ok: false; clarify: ClarifyResult }> {
    const r = await resolveRefList(refs, {
        verb: opts.verb,
        pluralNoun: "workspace tags",
        singularPhrase: "a workspace tag",
        pronoun: "it",
        list: opts.listTags,
        trustIds: true,
    });
    return r.ok ? { ok: true, tagIds: r.ids, labels: r.labels } : r;
}

/**
 * Resolve an OPTIONAL `userId` READ-FILTER slot — id, exact name, or "me". When
 * the slot is empty the caller's stated default applies (`defaultTo`, usually the
 * current user; `undefined` = unfiltered). Built on {@link resolveUserRef} with
 * `trustIds` — a wrong id on a read yields an empty list, not a damaging write,
 * so the 24-hex happy path stays list-free. ONE copy for every read that filters
 * by user.
 */
export async function resolveUserFilter(
    userId: string | undefined,
    opts: {
        verb: string;
        meUserId: string;
        listUsers: () => Promise<Array<{ id: string; name: string }>>;
        defaultTo?: string;
    },
): Promise<{ ok: true; userId: string | undefined } | { ok: false; clarify: ClarifyResult }> {
    if (!userId?.trim()) return { ok: true, userId: opts.defaultTo };
    const user = await resolveUserRef(
        { id: userId },
        { verb: opts.verb, meUserId: opts.meUserId, listUsers: opts.listUsers, trustIds: true },
    );
    return user.ok ? { ok: true, userId: user.userId } : user;
}
