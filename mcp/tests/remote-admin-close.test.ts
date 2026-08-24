import { PassThrough } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    end: vi.fn(async (): Promise<void> => {
        throw new Error("synthetic pool close failure");
    }),
    fromEnvironment: vi.fn(),
    migrateDatabase: vi.fn(async (): Promise<readonly string[]> => []),
}));

vi.mock("../src/remote/postgres.js", () => ({
    PostgresPool: { fromEnvironment: mocks.fromEnvironment },
}));
vi.mock("../src/remote/migrations.js", () => ({
    migrateDatabase: mocks.migrateDatabase,
}));

import { main } from "../src/admin.js";

describe("admin receipt and database-close ordering", () => {
    let stdout: ReturnType<typeof vi.spyOn>;
    let stderr: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        mocks.end.mockClear();
        mocks.fromEnvironment.mockReset().mockResolvedValue({ end: mocks.end });
        mocks.migrateDatabase.mockClear();
        stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    });

    afterEach(() => {
        stdout.mockRestore();
        stderr.mockRestore();
    });

    it("emits only failure when pool close fails after a successful command", async () => {
        const input = new PassThrough();
        input.end();

        await expect(main(["db", "migrate"], {}, input)).resolves.toBe(1);

        expect(mocks.end).toHaveBeenCalledOnce();
        expect(written(stdout)).toBe("");
        expect(written(stderr)).toBe('{"ok":false,"error":"command_failed"}\n');
    });
});

function written(spy: { mock: { calls: readonly (readonly unknown[])[] } }): string {
    return spy.mock.calls.map((call) => String(call[0])).join("");
}
