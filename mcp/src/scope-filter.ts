/**
 * Clockify holiday/time-off-policy user/group scope filter.
 *
 * Live-verified (ai-assistant addon, 2026-06-12): the GET echoes the assignment
 * back FLAT as `userIds`/`userGroupIds`, but the POST/PUT body wants it in this
 * `{contains, ids, status}` filter form under `users`/`userGroups`. Sending the
 * flat arrays drops the assignment (and a holiday/policy with no resolvable
 * assignment is rejected).
 *
 * The `status` segment differs by resource: holiday assignments use `"ALL"` (the
 * default), time-off **policy** scope uses `"ACTIVE"` (both live-verified in the
 * ai-assistant addon, 2026-06-12). The caller passes the right one; holidays rely
 * on the default `"ALL"`.
 */
export function scopeFilter(ids: string[], status: "ALL" | "ACTIVE" = "ALL"): Record<string, unknown> {
    return { contains: "CONTAINS", ids, status };
}
