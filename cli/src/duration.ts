/**
 * Parse a human-friendly duration string into seconds.
 *
 * Accepts:
 *   - "30s" / "45m" / "2h" / "1d"
 *   - "1h30m" / "1h30m15s"
 *   - "90" — bare number, interpreted as minutes
 *   - ISO 8601 "PT1H30M" / "PT45M" — Clockify wire format
 */
export function parseDuration(input: string): number {
    const trimmed = input.trim();
    if (trimmed === "") {
        throw new Error("duration is empty");
    }
    if (/^PT/i.test(trimmed)) {
        return parseIsoDuration(trimmed);
    }
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
        return Math.round(Number(trimmed) * 60);
    }
    const re = /(\d+(?:\.\d+)?)\s*([dhms])/gi;
    let total = 0;
    let consumed = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(trimmed)) !== null) {
        const value = Number(match[1]);
        const unit = (match[2] ?? "").toLowerCase();
        total += value * unitToSeconds(unit);
        consumed += match[0].length;
    }
    if (consumed === 0 || consumed < trimmed.replace(/\s+/g, "").length) {
        throw new Error(
            `cannot parse duration ${JSON.stringify(input)}; use forms like "1h30m", "45m", "90", or ISO "PT1H30M"`,
        );
    }
    return Math.round(total);
}

function parseIsoDuration(input: string): number {
    const re = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i;
    const match = re.exec(input);
    if (!match || (match[1] == null && match[2] == null && match[3] == null)) {
        throw new Error(`cannot parse ISO duration ${JSON.stringify(input)}`);
    }
    const hours = match[1] != null ? Number(match[1]) : 0;
    const minutes = match[2] != null ? Number(match[2]) : 0;
    const seconds = match[3] != null ? Number(match[3]) : 0;
    return Math.round(hours * 3600 + minutes * 60 + seconds);
}

function unitToSeconds(unit: string): number {
    switch (unit) {
        case "d":
            return 86_400;
        case "h":
            return 3_600;
        case "m":
            return 60;
        case "s":
            return 1;
        default:
            throw new Error(`unknown duration unit ${JSON.stringify(unit)}`);
    }
}

/**
 * Format a Clockify ISO 8601 duration ("PT1H30M") into "1h30m".
 */
export function formatIsoDuration(iso: string | null | undefined): string {
    if (!iso) {
        return "0s";
    }
    const re = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i;
    const match = re.exec(iso);
    if (!match) {
        return iso;
    }
    const parts: string[] = [];
    if (match[1]) parts.push(`${Number(match[1])}h`);
    if (match[2]) parts.push(`${Number(match[2])}m`);
    if (match[3]) parts.push(`${Number(match[3])}s`);
    return parts.length > 0 ? parts.join("") : "0s";
}

/**
 * Convert a total-seconds count into a compact human string.
 */
export function formatSeconds(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return "0s";
    }
    const rounded = Math.round(seconds);
    const h = Math.floor(rounded / 3600);
    const m = Math.floor((rounded % 3600) / 60);
    const s = rounded % 60;
    const parts: string[] = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0 || h > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join("");
}
