import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { printError, printObject, printRecords, printSuccess } from "../src/output.js";

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
});
