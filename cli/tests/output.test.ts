import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    printError,
    printJson,
    printNdjson,
    printObject,
    printRecords,
    printSuccess,
    selectValue,
} from "../src/output.js";

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let logged: string[] = [];
let errored: string[] = [];

beforeEach(() => {
    logged = [];
    errored = [];
    logSpy = vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
        logged.push(String(msg ?? ""));
    });
    errorSpy = vi.spyOn(console, "error").mockImplementation((msg?: unknown) => {
        errored.push(String(msg ?? ""));
    });
});

afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
});

const plain = { mode: "table" as const, color: false };
const json = { mode: "json" as const, color: false };
const ndjson = { mode: "ndjson" as const, color: false };

describe("printRecords", () => {
    it("emits a table with headers in insertion order", () => {
        printRecords(
            [
                { id: "a", name: "Alpha" },
                { id: "b", name: "Beta" },
            ],
            plain,
        );
        const out = logged.join("\n");
        expect(out).toMatch(/id/);
        expect(out).toMatch(/name/);
        expect(out).toMatch(/Alpha/);
        expect(out).toMatch(/Beta/);
    });

    it("handles empty arrays without crashing", () => {
        printRecords([], plain);
        expect(logged[0]).toBe("(no rows)");
    });

    it("emits raw JSON in json mode", () => {
        printRecords([{ id: "1" }], json);
        expect(JSON.parse(logged[0] ?? "")).toEqual([{ id: "1" }]);
    });
});

describe("printObject", () => {
    it("emits a two-column table for objects in table mode", () => {
        printObject({ id: "x", name: "Acme" }, plain);
        const out = logged.join("\n");
        expect(out).toMatch(/field/);
        expect(out).toMatch(/value/);
        expect(out).toMatch(/Acme/);
    });

    it("emits raw JSON in json mode", () => {
        printObject({ id: "x" }, json);
        expect(JSON.parse(logged[0] ?? "")).toEqual({ id: "x" });
    });
});

describe("printSuccess / printError", () => {
    it("prints OK/ERR prefixes in plain mode", () => {
        printSuccess("done", plain);
        printError("nope", plain);
        expect(logged[0]).toBe("OK done");
        expect(errored[0]).toBe("ERR nope");
    });

    it("emits structured JSON in json mode", () => {
        printSuccess("done", json);
        printError("nope", json);
        expect(JSON.parse(logged[0] ?? "")).toEqual({ ok: true, message: "done" });
        expect(JSON.parse(errored[0] ?? "")).toEqual({
            ok: false,
            error: "nope",
            code: "error",
            recovery:
                "Preserve the message and request ID if available, then classify the failure into a stable code before broadening behavior.",
            retryable: false,
        });
    });

    it("emits structured output in ndjson mode", () => {
        printSuccess("done", ndjson);
        printError("nope", ndjson);
        expect(JSON.parse(logged[0] ?? "")).toEqual({ ok: true, message: "done" });
        expect(JSON.parse(errored[0] ?? "").ok).toBe(false);
    });

    it("classifies by HTTP status when provided, beating the message heuristic", () => {
        // The body text "workspace" would misclassify as auth_or_permission;
        // the attached 404 status must win and yield not_found.
        printError("HTTP 404: workspace not accessible", json, 404);
        expect(JSON.parse(errored[0] ?? "").code).toBe("not_found");
    });
});

describe("selectValue", () => {
    it("selects nested values by dot path", () => {
        expect(selectValue({ data: { id: "tag-1" } }, "data.id")).toBe("tag-1");
        expect(selectValue([{ id: "a" }, { id: "b" }], "1.id")).toBe("b");
        expect(selectValue({ data: {} }, "data.missing")).toBeUndefined();
        expect(selectValue([{ id: "a" }], "5")).toBeUndefined();
    });

    it("returns the whole value when no selector is given", () => {
        const value = { a: 1 };
        expect(selectValue(value)).toBe(value);
    });
});

describe("printJson / printNdjson", () => {
    it("prints compact json with a selected path", () => {
        printJson({ data: { id: "tag-1" } }, { compact: true, select: "data" });
        expect(logged[0]).toBe('{"id":"tag-1"}');
    });

    it("prints arrays as one json object per line", () => {
        printNdjson([{ id: "a" }, { id: "b" }]);
        expect(logged).toEqual(['{"id":"a"}', '{"id":"b"}']);
    });

    it("prints a non-array ndjson value as a single line", () => {
        printNdjson({ id: "x" });
        expect(logged).toEqual(['{"id":"x"}']);
    });
});

describe("ndjson list output", () => {
    it("emits one record per row", () => {
        printRecords([{ id: "1" }, { id: "2" }], ndjson);
        expect(logged).toEqual(['{"id":"1"}', '{"id":"2"}']);
    });
});
