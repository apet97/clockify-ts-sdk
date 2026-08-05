import { resolveInstant, resolvePeriod, resolveRelativeDay, REPORT_PERIODS } from "../wrapper/dates.js";

const now = new Date("2026-01-15T12:00:00.000Z"); // January — the untested last_quarter path
for (const p of ["last_quarter", "this_quarter", "next_quarter", "last_year", "next_year", "last_month", "next_month", "this_week", "last_week", "next_week"]) {
    console.log(p, JSON.stringify(resolvePeriod(now, p)));
}

// resolveInstant with lowercase t/z and space separators — does Date.parse accept them?
for (const raw of [
    "2026-06-01t10:30:00z",
    "2026-06-01T10:30:00Z",
    "2026-06-01 10:30:00",
    "2026-06-01 10:30:00 -05:00",
    "2026-06-01T10:30:00+02:00",
    "2026-06-01T10:30:00+0200",
    "2026-06-01T24:00:00Z",
]) {
    console.log("resolveInstant:", JSON.stringify(raw), "=>", resolveInstant(now, raw, "start"));
}

// resolveRelativeDay weekdays
for (const w of ["this monday", "next monday", "last monday", "monday", "this sunday", "next sunday"]) {
    console.log("day:", w, "=>", resolveRelativeDay(new Date("2026-06-15T12:00:00Z"), { date: w })); // Monday
}
