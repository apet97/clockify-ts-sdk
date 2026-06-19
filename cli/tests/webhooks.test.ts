import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import type { Registrar, Services } from "../src/commands/types.js";
import { registerWebhooksCommand } from "../src/commands/webhooks.js";

function makeProgram(register: Registrar, client: ClockifyClient): Command {
    const program = new Command();
    program.exitOverride();
    program.option("--json", "Emit JSON.", false);
    const services: Services = {
        loadConfig: () => ({ apiKey: "k", workspaceId: "ws-1" }),
        buildClient: () => client,
    };
    register(program, services);
    return program;
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
    logSpy.mockRestore();
});

describe("webhooks create SSRF guard", () => {
    function makeClient(): { client: ClockifyClient; createCalls: number } {
        const state = { createCalls: 0 };
        const client = {
            webhooks: {
                create: async () => {
                    state.createCalls += 1;
                    return { id: "wh-1", name: "ok" };
                },
            },
        };
        return {
            client: client as unknown as ClockifyClient,
            get createCalls() {
                return state.createCalls;
            },
        };
    }

    const badUrls = [
        "http://169.254.169.254/latest/meta-data/",
        "https://169.254.169.254/hook",
        "https://localhost/hook",
        "https://127.0.0.1/hook",
        "https://10.0.0.5/hook",
    ];

    for (const url of badUrls) {
        it(`rejects ${url} and does not call the API`, async () => {
            const holder = makeClient();
            await expect(
                makeProgram(registerWebhooksCommand, holder.client).parseAsync([
                    "node",
                    "clk115",
                    "--json",
                    "webhooks",
                    "create",
                    "--name",
                    "evil",
                    "--url",
                    url,
                    "--event",
                    "NEW_PROJECT",
                ]),
            ).rejects.toThrow(/webhooks\.create:/);
            expect(holder.createCalls).toBe(0);
        });
    }

    it("accepts a public HTTPS URL", async () => {
        const holder = makeClient();
        await makeProgram(registerWebhooksCommand, holder.client).parseAsync([
            "node",
            "clk115",
            "--json",
            "webhooks",
            "create",
            "--name",
            "ok",
            "--url",
            "https://example.com/hook",
            "--event",
            "NEW_PROJECT",
        ]);
        expect(holder.createCalls).toBe(1);
    });
});
