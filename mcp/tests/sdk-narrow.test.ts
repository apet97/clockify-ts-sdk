import { describe, expect, it } from "vitest";

import { entityId } from "../src/result.js";

describe("entityId", () => {
    it("returns string ids from SDK-like responses", () => {
        expect(entityId({ id: "abc" })).toBe("abc");
    });

    it("returns undefined for missing, null, or non-string ids", () => {
        expect(entityId({})).toBeUndefined();
        expect(entityId(null)).toBeUndefined();
        expect(entityId({ id: 5 })).toBeUndefined();
    });
});
