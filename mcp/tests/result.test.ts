import { describe, expect, it } from "vitest";

import { errorResult, successResult } from "../src/result.js";

describe("successResult", () => {
    it("wraps the payload in {ok:true, action, data}", () => {
        const out = successResult("clockify_status", { user: "alice" });
        expect(out.isError).toBeUndefined();
        const text = (out.content[0] as { type: string; text: string }).text;
        expect(JSON.parse(text)).toEqual({
            ok: true,
            action: "clockify_status",
            data: { user: "alice" },
        });
        expect(out.structuredContent).toEqual({
            ok: true,
            action: "clockify_status",
            data: { user: "alice" },
        });
    });

    it("includes meta when non-empty", () => {
        const out = successResult("clockify_projects_list", [], { count: 0, hasMore: false });
        const parsed = JSON.parse((out.content[0] as { text: string }).text);
        expect(parsed.meta).toEqual({ count: 0, hasMore: false });
    });

    it("omits meta when empty", () => {
        const out = successResult("clockify_status", { user: "alice" }, {});
        const parsed = JSON.parse((out.content[0] as { text: string }).text);
        expect(parsed).not.toHaveProperty("meta");
    });
});

describe("errorResult", () => {
    it("sets isError + maps statusCode to a stable code", () => {
        const err = Object.assign(new Error("Not Found"), { statusCode: 404 });
        const out = errorResult("clockify_entries_list", err, "Try a different ID.");
        expect(out.isError).toBe(true);
        const parsed = JSON.parse((out.content[0] as { text: string }).text);
        expect(parsed).toMatchObject({
            ok: false,
            action: "clockify_entries_list",
            error: { code: "not_found", message: "Not Found" },
            recovery: { hint: "Try a different ID." },
        });
    });

    it("maps 401/403 to auth_or_permission, 429 to rate_limited", () => {
        const out401 = errorResult("x", Object.assign(new Error("nope"), { statusCode: 401 }));
        const out429 = errorResult("x", Object.assign(new Error("slow"), { statusCode: 429 }));
        expect(JSON.parse((out401.content[0] as { text: string }).text).error.code).toBe("auth_or_permission");
        expect(JSON.parse((out429.content[0] as { text: string }).text).error.code).toBe("rate_limited");
    });

    it("falls back to 'error' for unknown shapes", () => {
        const out = errorResult("x", "string error");
        const parsed = JSON.parse((out.content[0] as { text: string }).text);
        expect(parsed.error).toEqual({ code: "error", message: "string error" });
    });
});
