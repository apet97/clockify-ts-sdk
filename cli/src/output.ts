import Table from "cli-table3";
import pc from "picocolors";

import {
    errorCodeForMessage,
    errorCodeForStatus,
    recoveryForCode,
    retryableForCode,
} from "./error-codes.js";

export type OutputMode = "table" | "json" | "ndjson";
export type OutputRecord = Record<string, unknown>;

export interface OutputOptions {
    mode: OutputMode;
    color: boolean;
    compact?: boolean;
    select?: string;
}

/**
 * Print a structured payload — either as a human-friendly table or as
 * pretty JSON, depending on `opts.mode`. The "table" path expects
 * `rows` to be a uniform array of objects; non-uniform shapes fall
 * back to JSON automatically.
 */
export function printRecords(rows: OutputRecord[], opts: OutputOptions): void {
    if (opts.mode === "json") {
        printJson(rows, opts);
        return;
    }
    if (opts.mode === "ndjson") {
        printNdjson(rows, opts);
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
export function printObject(obj: object, opts: OutputOptions): void {
    if (opts.mode === "json") {
        printJson(obj, opts);
        return;
    }
    if (opts.mode === "ndjson") {
        printNdjson(obj, opts);
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
    if (opts.mode === "ndjson") {
        printNdjson({ ok: true, message }, opts);
        return;
    }
    if (opts.mode === "json") {
        printJson({ ok: true, message }, opts);
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
export function printError(message: string, opts: OutputOptions, statusCode?: number): void {
    // Prefer the HTTP status when the thrower attached one; a synthetic
    // "HTTP 404:" message would otherwise hit the message heuristic. Exception:
    // a 400 "X doesn't belong to Workspace/Project" body is really a not_found
    // (the id is wrong), so a not_found message classification overrides the
    // generic 400 -> invalid_request status mapping.
    const messageCode = errorCodeForMessage(message);
    const code =
        messageCode === "not_found" && statusCode === 400
            ? "not_found"
            : (errorCodeForStatus(statusCode) ?? messageCode);
    if (opts.mode !== "table") {
        console.error(
            JSON.stringify({
                ok: false,
                error: message,
                code,
                recovery: recoveryForCode(code),
                retryable: retryableForCode(code),
            }),
        );
        return;
    }
    const prefix = opts.color ? pc.red("ERR") : "ERR";
    console.error(`${prefix} ${message}`);
    // Surface the stable error code's recovery hint in human (table) mode too —
    // JSON/ndjson modes already carry `recovery`; without this the default mode
    // showed only the raw message with no next step.
    const recovery = recoveryForCode(code);
    if (recovery) {
        console.error(`${opts.color ? pc.dim("→") : "→"} ${recovery}`);
    }
}

/**
 * Resolve a dot-path against a value before printing. Numeric segments
 * index into arrays. Returns `undefined` when the path does not exist.
 */
export function selectValue(value: unknown, selector?: string): unknown {
    if (!selector) {
        return value;
    }
    let current: unknown = value;
    for (const part of selector.split(".").filter(Boolean)) {
        if (Array.isArray(current)) {
            const index = Number(part);
            if (!Number.isInteger(index) || index < 0 || index >= current.length) {
                return undefined;
            }
            current = current[index];
            continue;
        }
        if (current !== null && typeof current === "object" && part in current) {
            current = (current as OutputRecord)[part];
            continue;
        }
        return undefined;
    }
    return current;
}

/** Print a value as JSON, honoring `--select` and `--compact`. */
export function printJson(
    value: unknown,
    options: Pick<OutputOptions, "compact" | "select"> = {},
): void {
    const selected = selectValue(value, options.select);
    console.log(JSON.stringify(selected, null, options.compact ? 0 : 2));
}

/** Print a value as newline-delimited JSON; arrays emit one line per item. */
export function printNdjson(value: unknown, options: Pick<OutputOptions, "select"> = {}): void {
    const selected = selectValue(value, options.select);
    if (Array.isArray(selected)) {
        for (const item of selected) {
            console.log(JSON.stringify(item));
        }
        return;
    }
    console.log(JSON.stringify(selected));
}

function collectHeaders(rows: OutputRecord[]): string[] {
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
        // JSON.stringify throws on circular references and BigInt.
        return typeof value === "bigint" ? value.toString() : "[unserializable]";
    }
}
