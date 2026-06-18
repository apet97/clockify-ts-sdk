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
        workday_start: z.string().optional(),
        workday_end: z.string().optional(),
        min_gap_minutes: z.number().int().min(0).optional(),
        include_entries: z.boolean().optional(),
        max_rows: z.number().int().min(0).optional(),
    };
}

export async function reviewPeriod(ctx: Context, action: string, args: AnyRecord) {
    const user = await ctx.client.users.getCurrentUser();
    const range = dateRange(action, args);
    // Walk ALL pages so the review covers the whole period. A single
    // page:1/200 fetch silently truncated a busy week and still reported
    // count: entries.length as if complete. iterAll honors Last-Page.
    const entries: AnyRecord[] = [];
    for await (const entry of iterAll<AnyRecord, AnyRecord>(
        // KEEP as never: generated list/search/view request or response envelope does not match this wire shape.
        (req) => ctx.client.timeEntries.listForUser(req as never) as never,
        { workspaceId: ctx.workspaceId, userId: idOf(user), start: range.start, end: range.end },
        { pageSize: 200 },
    )) {
        entries.push(entry);
    }
    const review = summarizeEntries(entries, args);
    return successResult(action, review, { workspaceId: ctx.workspaceId, userId: idOf(user), count: entries.length }, {
        entity: "entry_review",
        ids: { workspaceId: ctx.workspaceId, userId: idOf(user) },
        next: review.suggestedActions.length
            ? review.suggestedActions
            : [{ tool: "clockify_log_work", reason: "Log any missing work discovered during review." }],
    });
}
