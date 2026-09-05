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

/**
 * A calendar day that exists. `Date.parse` NaNs an impossible MONTH (2026-13-99)
 * but silently ROLLS a bad day forward (2026-02-30 -> Mar 2), so round-trip the
 * parse and require the same literal back. Same check `buildDay` applies on the
 * month-name path and `promoteDateBoundary` applies in the CLI.
 */
function isRealDay(day: string): boolean {
    const ms = Date.parse(`${day}T00:00:00Z`);
    return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === day;
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
    if (args.dayOffset !== undefined) {
        const ms = Date.parse(`${today}T00:00:00.000Z`) + args.dayOffset * DAY_MS;
        // Out-of-range Dates make toISOString() throw and years >9999 would yield
        // "+012019-…" not the promised YYYY-MM-DD, so reject anything outside
        // 0000-01-01..9999-12-31 (NaN/Infinity offsets fail these comparisons too).
        if (!(ms >= -62_167_219_200_000 && ms <= 253_402_214_400_000)) return undefined;
        return new Date(ms).toISOString().slice(0, 10);
    }
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

/**
 * Resolve a named period to a UTC date range using `now` (the caller owns the math).
 *
 * @example
 * ```ts
 * const range = resolvePeriod(new Date("2026-06-19T12:00:00.000Z"), "last_week");
 * ```
 */
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
    // RFC 3339 §5.6 NOTE lets applications replace the `T` separator with a
    // space ("2026-06-01 10:30:00") — the spelling humans and models reach for
    // most often. Normalize that one separator to `T` before the gate below so
    // it takes the datetime branch instead of being truncated to a day edge
    // (which silently discarded the time, and on the `end` edge WIDENED the
    // bound to 23:59:59.999). The `(?=\d)` lookahead keeps a non-time remainder
    // ("2026-06-01 to 2026-06-05") on the day-edge path rather than NaN-ing it.
    const trimmed = raw.trim().replace(/^(\d{4}-\d{2}-\d{2}) (?=\d)/, "$1T");
    if (/^\d{4}-\d{2}-\d{2}[Tt]/.test(trimmed)) {
        // The separator accepts `t` as well as `T` (RFC 3339 §5.6 permits either,
        // exactly as the `hasZone` check below accepts `z` as well as `Z`).
        // The date part must be a real calendar day: Date.parse rolls 2026-02-30
        // forward to Mar 2, which would silently SHIFT the caller's instant.
        // Validate ONLY the literal date part, never the re-derived instant — an
        // explicit offset may legitimately move the UTC day (2026-06-09T23:30:00-05:00
        // genuinely IS 2026-06-10T04:30:00.000Z).
        if (!isRealDay(trimmed.slice(0, 10))) return undefined;
        // `Date.parse` of a zone-LESS datetime ("…T08:30:00") interprets it in the
        // HOST timezone, which would break this module's UTC-determinism contract
        // (a CLI run in America/New_York would yield a different instant than in
        // UTC). Append `Z` when the input carries no explicit zone so the parse is
        // always UTC; explicit-offset inputs (`+02:00`, `-0500`, `Z`) keep theirs.
        const hasZone = /[zZ]$/.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed);
        const parsed = Date.parse(hasZone ? trimmed : `${trimmed}Z`);
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

/**
 * A weekly report bound split into its literal wall-clock components.
 *
 * `day` is a UTC-midnight day number used only for calendar arithmetic. It is
 * derived from the literal date, not from a timestamp offset: the reports host
 * evaluates report bounds as wall-clock values in the request timezone. `raw`
 * is retained so callers can forward the spelling they validated.
 */
export interface WeeklyDateTime {
    readonly raw: string;
    readonly day: number;
    readonly nanosOfDay: number;
}

const WEEKLY_DAY_NANOS = 86_400_000_000_000;
const WEEKLY_LAST_SECOND_NANOS = WEEKLY_DAY_NANOS - 1_000_000_000;
const WEEKLY_DATE_TIME_MAX_LENGTH = 30;
const WEEKLY_DATE_TIME =
    /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z)?$/u;

/**
 * Parse a weekly report bound without normalising its wall-clock spelling.
 *
 * Accepted forms match the reports host's weekly wire grammar: full
 * `HH:MM:SS` precision, an optional 1–9 digit fraction, an optional uppercase
 * `Z`, and either `T` or the lowercase `t` separator. The host rejects
 * date-only, minute-only, space-separated, lowercase-`z`, numeric-offset, and
 * ten-or-more-digit fractional forms, so they are rejected here too. The
 * parser is deliberately strict about the complete string (including
 * surrounding whitespace) so a value accepted here can be forwarded unchanged.
 *
 * Calendar, time, and offset fields are checked independently of `Date.parse`;
 * impossible dates such as 2026-02-30 therefore cannot roll into another week.
 */
export function parseWeeklyDateTime(value: unknown): WeeklyDateTime | undefined {
    if (
        typeof value !== "string" ||
        value.length === 0 ||
        value.length > WEEKLY_DATE_TIME_MAX_LENGTH
    ) {
        return undefined;
    }
    const match = WEEKLY_DATE_TIME.exec(value);
    if (match === null) return undefined;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const date = Number(match[3]);
    const parsedDay = new Date(0);
    // Date.UTC maps years 0..99 to 1900..1999; setUTCFullYear preserves the
    // literal four-digit year, including 0000 and years below 0100.
    parsedDay.setUTCFullYear(year, month - 1, date);
    parsedDay.setUTCHours(0, 0, 0, 0);
    if (
        Number.isNaN(parsedDay.getTime()) ||
        parsedDay.getUTCFullYear() !== year ||
        parsedDay.getUTCMonth() !== month - 1 ||
        parsedDay.getUTCDate() !== date
    ) {
        return undefined;
    }

    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    if (hour > 23 || minute > 59 || second > 59) return undefined;

    const fraction = match[7] ?? "";
    const fractionNanos = Number(fraction.padEnd(9, "0"));
    return {
        raw: value,
        day: Math.trunc(parsedDay.getTime() / DAY_MS),
        nanosOfDay: ((hour * 60 + minute) * 60 + second) * 1_000_000_000 + fractionNanos,
    };
}

/**
 * Check the exact seven-calendar-day weekly report contract.
 *
 * Bounds are compared by literal wall-clock dates rather than elapsed UTC
 * milliseconds, so offsets that change at a DST boundary do not alter the
 * seven rendered dates. Both the exclusive next-midnight form and the
 * inclusive final-day form (any instant in its final second) are accepted.
 */
export function isExactWeeklyRange(startValue: unknown, endValue: unknown): boolean {
    const start = parseWeeklyDateTime(startValue);
    const end = parseWeeklyDateTime(endValue);
    if (start === undefined || end === undefined) return false;
    const dayDelta = end.day - start.day;
    return (
        (dayDelta === 7 && start.nanosOfDay === 0 && end.nanosOfDay === 0) ||
        (dayDelta === 6 &&
            start.nanosOfDay === 0 &&
            end.nanosOfDay >= WEEKLY_LAST_SECOND_NANOS &&
            end.nanosOfDay < WEEKLY_DAY_NANOS)
    );
}
