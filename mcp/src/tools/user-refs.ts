/**
 * Shared workspace user-reference helpers for the domain tool modules.
 *
 * The holidays, users, scheduling, groups, and time-off tools each need two
 * tiny lookups when resolving a user name/"me" in an id slot:
 *   - `listUsers`  -> every workspace user as `{ id, name, email? }` (paged to
 *                     the `page-size: 200` ceiling, roles excluded), fed to the
 *                     `clockify-sdk-ts-115/resolve` helpers.
 *   - `meUserId`   -> the current user's id, via the context's single-flight
 *                     `currentUserId` memo when present, else a direct
 *                     `getCurrentUser()` fall back for hand-built contexts.
 *
 * These were previously copy-pasted (byte-identical) into all five modules.
 * `userRefHelpers(ctx)` returns the same two closures so the call sites are
 * unchanged. Pure factory: no behavior change.
 */
import type { Context } from "../client.js";
import { entityId } from "../result.js";

import { collectPagedList } from "./paging.js";

export interface UserRefHelpers {
    /** Every workspace user as `{ id, name, email? }` (`page-size: 200`, no roles). */
    listUsers: () => Promise<Array<{ id: string; name: string; email?: string }>>;
    /** The current user's id ("" when it can't be determined). */
    meUserId: () => Promise<string>;
}

/** Build the shared `listUsers` / `meUserId` helpers over a tool {@link Context}. */
export function userRefHelpers(ctx: Context): UserRefHelpers {
    const listUsers = async (): Promise<
        Array<{ id: string; name: string; email?: string }>
    > => {
        const rows = await collectPagedList(
            (page) =>
                ctx.client.users.list({
                    workspaceId: ctx.workspaceId,
                    page,
                    "page-size": 200,
                    "include-roles": false,
                }) as PromiseLike<Array<{ id?: string; name?: string; email?: string }>>,
            { pageSize: 200 },
        );
        return rows.map((r) => {
            const user = { id: String(r.id ?? ""), name: String(r.name ?? "") };
            const email = String(r.email ?? "").trim();
            return email ? { ...user, email } : user;
        });
    };
    const meUserId = async (): Promise<string> =>
        // Lazy single-flight memo when the context provides one (fetched once per
        // server lifetime); fall back to a direct call for hand-built contexts.
        ctx.currentUserId
            ? await ctx.currentUserId()
            : (entityId(await ctx.client.users.getCurrentUser()) ?? "");
    return { listUsers, meUserId };
}
