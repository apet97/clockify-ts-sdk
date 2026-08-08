import { iterAll } from "clockify-sdk-ts-115/iter";
import type { ClockifyApi } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import { zNumberLike } from "../../arg-shapes.js";
import { successResult } from "../../result.js";

import { dateRange, idOf, summarizeEntries } from "./resolve.js";
import type { AnyRecord } from "./types.js";
import type { WorkflowContext as Context } from "./types.js";

// Clockify evaluates the time-entry `start`/`end` window as wall clock in the
// ACCOUNT's timezone, so the day these tools ask for is already the account's
// local day — that half is correct. What is not timezone-aware is which day gets
// picked by default: an omitted `date`/`week_start` resolves to the UTC calendar
// day. Near local midnight in a non-UTC account the two dates differ and the
// default is off by one, so callers there should pass the day explicitly.
// Live-probed 2026-08-08; see spec/evidence/discrepancies.md
// `time-entries.list.window-evaluated-as-wall-clock-in-account-timezone`.
const DAY_DESCRIPTION =
    'Day to review, as YYYY-MM-DD or a relative word ("yesterday", "last monday"). Defaults to the UTC calendar day, which is not the account\'s day near local midnight outside UTC — pass it explicitly there. An impossible day (e.g. 2026-02-30) is rejected, not rolled forward.';

export function reviewInputSchema({ week }: { week: boolean }) {
    return {
        date: week ? z.never().optional() : z.string().optional().describe(DAY_DESCRIPTION),
        week_start: week ? z.string().optional().describe(DAY_DESCRIPTION) : z.never().optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        include_entries: z.boolean().optional(),
        max_rows: zNumberLike(z.number().int().min(0)).optional(),
    };
}

export async function reviewPeriod(ctx: Context, action: string, args: AnyRecord) {
    // Use the per-server single-flight memo (fetched at most once) when present;
    // fall back to a direct call for hand-built contexts.
    const userId = ctx.currentUserId
        ? await ctx.currentUserId()
        : idOf(await ctx.client.users.getCurrentUser());
    const range = dateRange(action, args);
    // Walk ALL pages so the review covers the whole period. A single
    // page:1/200 fetch silently truncated a busy week and still reported
    // count: entries.length as if complete. iterAll honors Last-Page.
    const request: Omit<ClockifyApi.ListForUserTimeEntriesRequest, "page" | "page-size"> = {
        workspaceId: ctx.workspaceId,
        userId,
        start: range.start,
        end: range.end,
    };
    const entries: ClockifyApi.TimeEntry[] = [];
    for await (const entry of iterAll<
        ClockifyApi.ListForUserTimeEntriesRequest,
        ClockifyApi.TimeEntry
    >(
        (pageRequest) => ctx.client.timeEntries.listForUser(pageRequest),
        request,
        // maxPages caps the walk so a backend that keeps returning Last-Page:false
        // (or full pages) can't spin forever — 1000 * 200 = 200k entries is far
        // beyond any real review window.
        { pageSize: 200, maxPages: 1000 },
    )) {
        entries.push(entry);
    }
    const review = summarizeEntries(entries, args);
    return successResult(action, review, { workspaceId: ctx.workspaceId, userId, count: entries.length }, {
        entity: "entry_review",
        ids: { workspaceId: ctx.workspaceId, userId },
        next: review.suggestedActions.length
            ? review.suggestedActions
            : [{ tool: "clockify_log_work", reason: "Log any missing work discovered during review." }],
    });
}
