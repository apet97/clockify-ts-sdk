/**
 * Clockify holiday/time-off-policy user/group scope filter.
 *
 * Live-verified (ai-assistant addon, 2026-06-12): the GET echoes the assignment
 * back FLAT as `userIds`/`userGroupIds`, but the POST/PUT body wants it in this
 * `{contains, ids, status}` filter form under `users`/`userGroups`. Sending the
 * flat arrays drops the assignment (and a holiday/policy with no resolvable
 * assignment is rejected).
 */
export function scopeFilter(ids: string[]): Record<string, unknown> {
    return { contains: "CONTAINS", ids, status: "ALL" };
}
