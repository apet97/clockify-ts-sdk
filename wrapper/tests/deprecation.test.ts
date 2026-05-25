import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { _resetWarnOnceForTests, warnOnce } from "../deprecation.js";

describe("warnOnce", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;
    const originalNodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
        _resetWarnOnceForTests();
        warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        // Test code itself runs under NODE_ENV=test (so warnings are
        // silenced by default). Unset it so we can assert the warn path.
        delete process.env.NODE_ENV;
    });

    afterEach(() => {
        warnSpy.mockRestore();
        if (originalNodeEnv != null) process.env.NODE_ENV = originalNodeEnv;
        else delete process.env.NODE_ENV;
    });

    it("emits the warning the first time a key is seen", () => {
        warnOnce("foo", "Use bar instead");
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0]?.[0]).toContain("DEPRECATION");
        expect(warnSpy.mock.calls[0]?.[0]).toContain("Use bar instead");
    });

    it("dedupes by key — second call with the same key is silent", () => {
        warnOnce("foo", "first message");
        warnOnce("foo", "second message");
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it("warns once per distinct key", () => {
        warnOnce("foo", "first");
        warnOnce("bar", "second");
        warnOnce("foo", "first again");
        expect(warnSpy).toHaveBeenCalledTimes(2);
    });

    it("is silent under NODE_ENV=test", () => {
        process.env.NODE_ENV = "test";
        warnOnce("never-warns", "should be silent");
        expect(warnSpy).not.toHaveBeenCalled();
    });
});
