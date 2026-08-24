import { PassThrough } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { main, validateClockifyCredential } from "../src/admin.js";

describe("remote administration CLI boundary", () => {
    let stdout: ReturnType<typeof vi.spyOn>;
    let stderr: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    });

    afterEach(() => {
        stdout.mockRestore();
        stderr.mockRestore();
    });

    it("prints help without opening the database", async () => {
        await expect(main(["--help"], {}, secretInput())).resolves.toBe(0);
        expect(written(stdout)).toContain("clockify115-mcp-admin");
        expect(written(stderr)).toBe("");
    });

    it.each([
        ["principal", "disable", "--grant", "admin"],
        ["principal", "delete", "--workspace", "000000000000000000000001"],
        ["credential", "validate", "--workspace", "000000000000000000000001"],
        ["credential", "revoke", "--region", "global"],
        ["encryption", "status", "--batch-size", "10"],
        ["db", "migrate", "--subject", "unused"],
    ])(
        "rejects command-inapplicable options for %s %s before database access",
        async (command, action, option, value) => {
            const code = await main(
                [command, action, "--subject", "principal", option, value],
                {},
                secretInput(),
            );
            expect(code).toBe(2);
            expect(written(stdout)).toBe("");
            expect(written(stderr)).toBe('{"ok":false,"error":"usage"}\n');
        },
    );

    it.each([
        ["CLOCKIFY_API_KEY", ""],
        ["CLOCKIFY_API_KEY", "must-not-appear"],
        ["CLOCKIFY_WORKSPACE_ID", ""],
        ["CLOCKIFY_WORKSPACE_ID", "000000000000000000000001"],
    ])("rejects a present %s before database access", async (name, value) => {
        const code = await main(["db", "migrate"], { [name]: value }, secretInput());
        expect(code).toBe(2);
        expect(written(stdout)).toBe("");
        expect(written(stderr)).toBe('{"ok":false,"error":"usage"}\n');
        expect(`${written(stdout)}${written(stderr)}`).not.toContain(value || name);
    });

    it("never accepts an API key option or repeats its value", async () => {
        const apiKey = "argv-secret-must-not-appear";
        const code = await main(
            [
                "credential",
                "set",
                "--subject",
                "principal",
                "--workspace",
                "000000000000000000000001",
                "--api-key",
                apiKey,
            ],
            {},
            secretInput(),
        );
        expect(code).toBe(2);
        expect(`${written(stdout)}${written(stderr)}`).not.toContain(apiKey);
    });

    it("bounds Clockify credential validation", async () => {
        const observedSignals: AbortSignal[] = [];
        const dispatch = vi.fn<typeof fetch>(async (input, init) => {
            const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
            if (signal) observedSignals.push(signal);
            return await new Promise<Response>((_resolve, reject) => {
                const abort = (): void => reject(new Error("fixture request aborted"));
                if (signal?.aborted) abort();
                else signal?.addEventListener("abort", abort, { once: true });
            });
        });

        await expect(
            validateClockifyCredential(
                {
                    apiKey: "fixture-key",
                    workspaceId: "000000000000000000000001",
                    region: "global",
                },
                { fetch: dispatch, timeoutInSeconds: 0.01 },
            ),
        ).rejects.toThrow();
        expect(dispatch).toHaveBeenCalled();
        expect(observedSignals.every((signal) => signal.aborted)).toBe(true);
    });
});

function secretInput(): PassThrough & { isTTY?: boolean } {
    const input = new PassThrough();
    input.end();
    return input;
}

function written(spy: { mock: { calls: readonly (readonly unknown[])[] } }): string {
    return spy.mock.calls.map((call) => String(call[0])).join("");
}
