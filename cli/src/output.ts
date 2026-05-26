import Table from "cli-table3";
import pc from "picocolors";

export type OutputMode = "table" | "json";

export interface OutputOptions {
    mode: OutputMode;
    color: boolean;
}

/**
 * Print a structured payload — either as a human-friendly table or as
 * pretty JSON, depending on `opts.mode`. The "table" path expects
 * `rows` to be a uniform array of objects; non-uniform shapes fall
 * back to JSON automatically.
 */
export function printRecords(rows: Record<string, unknown>[], opts: OutputOptions): void {
    if (opts.mode === "json") {
        printJson(rows);
        return;
    }
    if (rows.length === 0) {
        console.log(opts.color ? pc.dim("(no rows)") : "(no rows)");
        return;
    }
    const headers = collectHeaders(rows);
    const table = new Table({
        head: opts.color ? headers.map((h) => pc.bold(h)) : headers,
        style: { head: [], border: [] },
    });
    for (const row of rows) {
        table.push(headers.map((h) => stringifyCell(row[h])));
    }
    console.log(table.toString());
}

/**
 * Print a single key/value object. In table mode it renders as a
 * two-column "field / value" layout; in JSON mode it's pretty-printed.
 */
export function printObject(obj: Record<string, unknown>, opts: OutputOptions): void {
    if (opts.mode === "json") {
        printJson(obj);
        return;
    }
    const table = new Table({
        head: opts.color ? [pc.bold("field"), pc.bold("value")] : ["field", "value"],
        style: { head: [], border: [] },
    });
    for (const [key, value] of Object.entries(obj)) {
        table.push([key, stringifyCell(value)]);
    }
    console.log(table.toString());
}

/**
 * Print a short success line — green checkmark in color mode, plain
 * prefix in no-color mode. Always goes to stdout.
 */
export function printSuccess(message: string, opts: OutputOptions): void {
    if (opts.mode === "json") {
        printJson({ ok: true, message });
        return;
    }
    const prefix = opts.color ? pc.green("OK") : "OK";
    console.log(`${prefix} ${message}`);
}

/**
 * Print an error line to stderr. Used by command handlers that catch
 * SDK / network errors; the actual process.exit is handled by the
 * top-level error wrapper.
 */
export function printError(message: string, opts: OutputOptions): void {
    if (opts.mode === "json") {
        console.error(JSON.stringify({ ok: false, error: message }));
        return;
    }
    const prefix = opts.color ? pc.red("ERR") : "ERR";
    console.error(`${prefix} ${message}`);
}

function printJson(value: unknown): void {
    console.log(JSON.stringify(value, null, 2));
}

function collectHeaders(rows: Record<string, unknown>[]): string[] {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const row of rows) {
        for (const key of Object.keys(row)) {
            if (!seen.has(key)) {
                seen.add(key);
                ordered.push(key);
            }
        }
    }
    return ordered;
}

function stringifyCell(value: unknown): string {
    if (value === null || value === undefined) {
        return "";
    }
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}
