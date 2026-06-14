/**
 * Server-side date/period resolution — the calendar math a Clockify client (CLI,
 * MCP, agent) should do for the *user* instead of trusting a model or a remote
 * clock to compute dates. Ported from the ai-assistant addon, where letting the
 * model compute "yesterday" / "next Monday" repeatedly sent literal strings or a
 * fabricated year to the wire.
 *
 * Everything here is pure and deterministic given an explicit `now: Date` — no
 * I/O, no hidden `Date.now()`. Callers pass the current instant so the behaviour
 * is testable and reproducible.
 *
 * - {@link resolveRelativeDay}: a relative word / weekday / offset → `YYYY-MM-DD`.
 * - {@link resolveInstant}: a day / ISO datetime / period keyword → the UTC
 *   instant (`…Z`) the API wants, anchored to the start or end edge.
 * - {@link resolvePeriod} + {@link REPORT_PERIODS}: a named period → a UTC range.
 */

/** Milliseconds in one day. */
const DAY_MS = 86_400_000;

/** Weekday names in JS `getUTCDay()` order (0 = Sunday). */
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Month names, index 0 = January (matches `getUTCMonth`). */
const MONTHS = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
];

/** A calendar day that exists (rejects 2026-13-99 etc., which `Date.parse` NaNs). */
function isRealDay(day: string): boolean {
    return !Number.isNaN(Date.parse(`${day}T00:00:00Z`));
}

function addDays(isoDay: string, days: number): string {
    return new Date(Date.parse(`${isoDay}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Build a `YYYY-MM-DD` from year / 0-based month / day, rejecting overflow (e.g.
 * Feb 30 — which `Date.UTC` silently rolls into March) so an impossible day
 * clarifies instead of being sent.
 */
function buildDay(year: number, monthIndex: number, day: number): string | undefined {
    const d = new Date(Date.UTC(year, monthIndex, day));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== monthIndex || d.getUTCDate() !== day) {
        return undefined;
    }
    return d.toISOString().slice(0, 10);
}

/**
 * Parse a month-name + day partial date with NO year ("June 1", "Jun 5",
 * "June 1st", "3 March") to the CURRENT year. A model left to itself fabricates a
 * year (training-data drift); the caller, which holds `now`, owns the year.
 * Returns undefined when it isn't a month-name partial or the day is out of range.
 */
function parseMonthNameDay(now: Date, raw: string): string | undefined {
    const m = raw.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?$/) ?? raw.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?$/);
    if (!m) return undefined;
    const [word, dayStr] = /^\d/.test(m[1] ?? "") ? [m[2] ?? "", m[1] ?? ""] : [m[1] ?? "", m[2] ?? ""];
    const monthIndex = MONTHS.findIndex((name) => name === word || name.startsWith(word));
    if (monthIndex < 0 || word.length < 3) return undefined;
    return buildDay(now.getUTCFullYear(), monthIndex, Number(dayStr));
}

/**
 * Resolve a day (`YYYY-MM-DD`) from a relative word (`today`/`yesterday`/
 * `tomorrow`), a weekday (bare AND `this <weekday>` = next occurrence with today
 * counting; `next <weekday>` = strictly after today; `last <weekday>` = strictly
 * before), a month-name partial ("June 1"), or a numeric `dayOffset` (0 = today,
 * -1 = yesterday). A literal `YYYY-MM-DD…` wins; absent everything, today.
 * Anything else returns `undefined` — the caller must clarify rather than send an
 * unresolved date to the wire.
 */
export function resolveRelativeDay(now: Date, args: { date?: string; dayOffset?: number }): string | undefined {
    const today = now.toISOString().slice(0, 10);
    if (args.dayOffset !== undefined) return addDays(today, args.dayOffset);
    const raw = args.date?.trim().toLowerCase();
    if (!raw) return today;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
        const day = raw.slice(0, 10);
        return isRealDay(day) ? day : undefined;
    }
    if (raw === "today" || raw === "now") return today;
    if (raw === "yesterday") return addDays(today, -1);
    if (raw === "tomorrow") return addDays(today, 1);
    const weekday = raw.match(/^(?:(this|next|last|previous)\s+)?([a-z]+)$/);
    if (weekday) {
        const target = WEEKDAYS.indexOf(weekday[2] ?? "");
        if (target >= 0) {
            const current = now.getUTCDay();
            if (weekday[1] === "last" || weekday[1] === "previous") {
                return addDays(today, -(((current - target + 7) % 7) || 7));
            }
            const ahead = (target - current + 7) % 7;
            return addDays(today, weekday[1] === "next" ? ahead || 7 : ahead);
        }
    }
    const monthDay = parseMonthNameDay(now, raw);
    if (monthDay !== undefined) return monthDay;
    return undefined;
}

/** The named periods {@link resolvePeriod} understands. */
export const REPORT_PERIODS = [
    "today",
    "yesterday",
    "this_week",
    "last_week",
    "this_month",
    "last_month",
    "last_7_days",
    "last_30_days",
    "this_quarter",
    "last_quarter",
    "this_year",
    "last_year",
    // Forward periods — natural for scheduling/time-off ranges ("next week").
    "next_week",
    "next_month",
    "next_quarter",
    "next_year",
] as const;

export type ReportPeriod = (typeof REPORT_PERIODS)[number];

/** Resolve a named period to a UTC date range using `now` (the caller owns the math). */
export function resolvePeriod(now: Date, period: ReportPeriod): { dateRangeStart: string; dateRangeEnd: string } {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const d = now.getUTCDate();
    const startOf = (yy: number, mm: number, dd: number): Date => new Date(Date.UTC(yy, mm, dd, 0, 0, 0, 0));
    const endOf = (yy: number, mm: number, dd: number): Date => new Date(Date.UTC(yy, mm, dd, 23, 59, 59, 999));
    const range = (s: Date, e: Date) => ({ dateRangeStart: s.toISOString(), dateRangeEnd: e.toISOString() });
    const lastDayOf = (yy: number, mm: number): number => new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    const dow = (now.getUTCDay() + 6) % 7; // 0 = Monday … 6 = Sunday
    const qStart = Math.floor(m / 3) * 3;

    switch (period) {
        case "today":
            return range(startOf(y, m, d), endOf(y, m, d));
        case "yesterday": {
            const yd = new Date(Date.UTC(y, m, d) - DAY_MS);
            return range(
                startOf(yd.getUTCFullYear(), yd.getUTCMonth(), yd.getUTCDate()),
                endOf(yd.getUTCFullYear(), yd.getUTCMonth(), yd.getUTCDate()),
            );
        }
        case "this_week": {
            const ws = new Date(Date.UTC(y, m, d) - dow * DAY_MS);
            return range(startOf(ws.getUTCFullYear(), ws.getUTCMonth(), ws.getUTCDate()), now);
        }
        case "last_week": {
            const ws = new Date(Date.UTC(y, m, d) - (dow + 7) * DAY_MS);
            const we = new Date(ws.getTime() + 6 * DAY_MS);
            return range(
                startOf(ws.getUTCFullYear(), ws.getUTCMonth(), ws.getUTCDate()),
                endOf(we.getUTCFullYear(), we.getUTCMonth(), we.getUTCDate()),
            );
        }
        case "this_month":
            return range(startOf(y, m, 1), now);
        case "last_month": {
            const yy = m === 0 ? y - 1 : y;
            const mm = m === 0 ? 11 : m - 1;
            return range(startOf(yy, mm, 1), endOf(yy, mm, lastDayOf(yy, mm)));
        }
        case "last_7_days":
            return range(new Date(now.getTime() - 7 * DAY_MS), now);
        case "last_30_days":
            return range(new Date(now.getTime() - 30 * DAY_MS), now);
        case "this_quarter":
            return range(startOf(y, qStart, 1), now);
        case "last_quarter": {
            let qm = qStart - 3;
            let qy = y;
            if (qm < 0) {
                qm += 12;
                qy -= 1;
            }
            return range(startOf(qy, qm, 1), endOf(qy, qm + 2, lastDayOf(qy, qm + 2)));
        }
        case "this_year":
            return range(startOf(y, 0, 1), now);
        case "last_year":
            return range(startOf(y - 1, 0, 1), endOf(y - 1, 11, 31));
        case "next_week": {
            const ws = new Date(Date.UTC(y, m, d) + (7 - dow) * DAY_MS);
            const we = new Date(ws.getTime() + 6 * DAY_MS);
            return range(
                startOf(ws.getUTCFullYear(), ws.getUTCMonth(), ws.getUTCDate()),
                endOf(we.getUTCFullYear(), we.getUTCMonth(), we.getUTCDate()),
            );
        }
        case "next_month": {
            const yy = m === 11 ? y + 1 : y;
            const mm = m === 11 ? 0 : m + 1;
            return range(startOf(yy, mm, 1), endOf(yy, mm, lastDayOf(yy, mm)));
        }
        case "next_quarter": {
            let qm = qStart + 3;
            let qy = y;
            if (qm > 11) {
                qm -= 12;
                qy += 1;
            }
            return range(startOf(qy, qm, 1), endOf(qy, qm + 2, lastDayOf(qy, qm + 2)));
        }
        case "next_year":
            return range(startOf(y + 1, 0, 1), endOf(y + 1, 11, 31));
    }
}

/**
 * Resolve a day / full ISO datetime / period keyword to the UTC instant
 * (`yyyy-MM-ddThh:mm:ss.SSSZ`) the api/reports/scheduling hosts want, anchored to
 * the `start` or `end` edge of the day/period. A full ISO datetime passes through
 * normalized. `undefined` = unparseable — clarify, never send.
 */
export function resolveInstant(now: Date, raw: string, edge: "start" | "end"): string | undefined {
    const trimmed = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
        const parsed = Date.parse(trimmed);
        return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
    }
    const day = resolveRelativeDay(now, { date: trimmed });
    if (day !== undefined) return edge === "start" ? `${day}T00:00:00.000Z` : `${day}T23:59:59.999Z`;
    const periodKey = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
    if ((REPORT_PERIODS as readonly string[]).includes(periodKey)) {
        const range = resolvePeriod(now, periodKey as ReportPeriod);
        return edge === "start" ? range.dateRangeStart : range.dateRangeEnd;
    }
    return undefined;
}
