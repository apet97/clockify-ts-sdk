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
        throw new Error(
            'duration is missing; provide a form like "1h30m", "45m", "90", or ISO "PT1H30M"',
        );
    }
    if (/^PT/i.test(trimmed)) {
        return requirePositive(parseIsoDuration(trimmed), input);
    }
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
        return requirePositive(Math.round(Number(trimmed) * 60), input);
    }
    // Whitespace can separate complete tokens or a number from its unit. It
    // must not join digits or decimal components into a different number.
    const re = /(\d+(?:\.\d+)?)\s*([dhms])\s*/giy;
    let total = 0;
    let offset = 0;
    while (offset < trimmed.length) {
        re.lastIndex = offset;
        const match = re.exec(trimmed);
        if (match === null) {
            throw new Error(
                `could not parse duration ${JSON.stringify(input)}; use forms like "1h30m", "45m", "90", or ISO "PT1H30M"`,
            );
        }
        const value = Number(match[1]);
        const unit = (match[2] ?? "").toLowerCase();
        total += value * unitToSeconds(unit);
        offset = re.lastIndex;
    }
    return requirePositive(Math.round(total), input);
}

/** CLI-7: a zero-length duration produced a start === end entry that looked
 *  logged but recorded nothing; every parse path funnels through here. */
function requirePositive(seconds: number, input: string): number {
    if (seconds <= 0) {
        throw new Error(
            `duration ${JSON.stringify(input)} must be positive; a zero-length entry records nothing`,
        );
    }
    return seconds;
}

function parseIsoDuration(input: string): number {
    const re = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i;
    const match = re.exec(input);
    if (!match || (match[1] == null && match[2] == null && match[3] == null)) {
        throw new Error(
            `could not parse ISO duration ${JSON.stringify(input)}; provide a form like "PT1H30M"`,
        );
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
