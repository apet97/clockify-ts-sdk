import { iterAll } from "clockify-sdk-ts-115/iter";
import { z } from "zod";

import { successResult } from "../../result.js";

import { dateRange, idOf, summarizeEntries } from "./resolve.js";
import type { AnyRecord } from "./types.js";
import type { WorkflowContext as Context } from "./types.js";

export function reviewInputSchema({ week }: { week: boolean }) {
    return {
        date: week ? z.never().optional() : z.string().optional(),
        week_start: week ? z.string().optional() : z.never().optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        include_entries: z.boolean().optional(),
        max_rows: z.number().int().min(0).optional(),
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
    const entries: AnyRecord[] = [];
    for await (const entry of iterAll<AnyRecord, AnyRecord>(
        // KEEP as never: generated list/search/view request or response envelope does not match this wire shape.
        (req) => ctx.client.timeEntries.listForUser(req as never) as never,
        { workspaceId: ctx.workspaceId, userId, start: range.start, end: range.end },
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
