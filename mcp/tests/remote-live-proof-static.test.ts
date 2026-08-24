import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const sourceUrl = new URL("../scripts/remote-live-proof.mjs", import.meta.url);
const reportsSourceUrl = new URL(
    "../scripts/remote-live-proof-reports.mjs",
    import.meta.url,
);
const supportSourceUrl = new URL(
    "../scripts/remote-live-proof-support.mjs",
    import.meta.url,
);

describe("remote live proof harness", () => {
    it("is import-safe and exposes an explicit entrypoint", async () => {
        const source = await readFile(sourceUrl, "utf8");
        expect(source).toContain(
            'import { fileURLToPath, pathToFileURL } from "node:url";',
        );
        const module = await import(sourceUrl.href);
        expect(typeof module.main).toBe("function");
    });

    it("keeps live writes behind the shared safety and cleanup boundaries", async () => {
        const source = await readFile(sourceUrl, "utf8");
        for (const marker of [
            "validateLiveEnvironment(env)",
            "acquireLiveLock()",
            "releaseLiveLock(lock)",
            "cleanupLivePrefixes({",
            "DEMO-mcp-live-",
            "zero-tenant-rows",
        ]) {
            expect(source).toContain(marker);
        }
        expect(source.indexOf("validateLiveEnvironment(env)")).toBeLessThan(
            source.indexOf("acquireLiveLock()"),
        );
        expect(source.indexOf("acquireLiveLock()")).toBeLessThan(
            source.indexOf('"remote-demo-seed-first"'),
        );
    });

    it("pipes the live key only to the admin credential-set command", async () => {
        const source = await readFile(sourceUrl, "utf8");
        expect(source).toContain(
            '["credential", "set", "--subject", subject, "--workspace", credentials.workspaceId]',
        );
        expect(source).toContain("`${credentials.apiKey}\\n`");
        expect(source).not.toMatch(/CLOCKIFY_API_KEY\s*:/u);
        expect(source).not.toMatch(/--api-key/u);
    });

    it("covers both token forms, every report, and cross-token confirmation", async () => {
        const source = await readFile(sourceUrl, "utf8");
        const reportsSource = await readFile(reportsSourceUrl, "utf8");
        const combinedSource = `${source}\n${reportsSource}`;
        for (const tool of [
            "clockify_status",
            "clockify_demo_seed",
            "clockify_demo_cleanup",
            "clockify_reports_summary",
            "clockify_reports_detailed",
            "clockify_reports_weekly",
            "clockify_reports_attendance",
            "clockify_reports_expense",
        ]) {
            expect(combinedSource).toContain(tool);
        }
        expect(source).toContain('call(jwtToken, "clockify_demo_cleanup"');
        expect(source).toContain('call(opaqueToken, "clockify_demo_cleanup"');
        expect(reportsSource).toContain("isReportsAppModel(model)");
        expect(source).toContain("assertSeedRetry(firstSeed, secondSeed)");
        expect(source).toContain("requireWarningFreeCleanup(cleaned)");
        expect(source).toContain("requireZeroCleanupPreview(rescan)");
        expect(source).toContain("confirmationCount(database)");
        expect(reportsSource).toContain("await delay(1_500)");
    });

    it("uses an inclusive end-of-day only for the attendance acceptance request", async () => {
        const { proveReports } = await import(reportsSourceUrl.href);
        const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
        const modelKey = "io.github.apet97.clockify115/reports-dashboard";
        const marker = "seeded-marker";

        await proveReports({
            call: async (_token: string, name: string, args: Record<string, unknown>) => {
                calls.push({ name, args });
                return {
                    structuredContent: { ok: true, action: name, data: { marker } },
                    _meta: {
                        [modelKey]: {
                            sourceTool: name,
                            query: {
                                dateRangeStart: args.dateRangeStart,
                                dateRangeEnd: args.dateRangeEnd,
                                timeZone: "UTC",
                            },
                        },
                    },
                };
            },
            token: "test-token",
            isReportsAppModel: () => true,
            marker,
            dayStart: "2026-01-02T00:00:00.000Z",
            dayEnd: "2026-01-03T00:00:00.000Z",
            attendanceDayEnd: "2026-01-02T23:59:59.999Z",
            weekStart: "2025-12-29T00:00:00.000Z",
            weekEnd: "2026-01-05T00:00:00.000Z",
        });

        const byName = new Map(calls.map((entry) => [entry.name, entry.args]));
        expect(byName.get("clockify_reports_attendance")?.dateRangeEnd).toBe(
            "2026-01-02T23:59:59.999Z",
        );
        for (const name of [
            "clockify_reports_summary",
            "clockify_reports_detailed",
            "clockify_reports_expense",
        ]) {
            expect(byName.get(name)?.dateRangeEnd).toBe("2026-01-03T00:00:00.000Z");
        }
        expect(byName.get("clockify_reports_weekly")?.dateRangeEnd).toBe(
            "2026-01-05T00:00:00.000Z",
        );
    });

    it("uses only the governed digest-pinned PostgreSQL image", async () => {
        const source = await readFile(sourceUrl, "utf8");
        const supportSource = await readFile(supportSourceUrl, "utf8");
        expect(supportSource).toContain("postgres:17.11-bookworm@sha256:");
        expect(supportSource).toContain('"manifest", "inspect", POSTGRES_IMAGE');
        expect(source).toContain('"volume", "rm", "--force", volumeName');
        expect(source).toContain('"rm", "--force", "--volumes", containerName');
    });

    it("reports only a stable error code when a live tool returns an error envelope", async () => {
        const { requireToolSuccess } = await import(supportSourceUrl.href);
        const hostileMessage = "secret workspace detail";

        expect(() =>
            requireToolSuccess(
                {
                    isError: true,
                    structuredContent: {
                        ok: false,
                        error: { code: "upstream_error", message: hostileMessage },
                    },
                },
                "clockify_demo_seed",
            ),
        ).toThrow(
            "MCP tool clockify_demo_seed did not return its canonical success envelope (error=upstream_error)",
        );
        try {
            requireToolSuccess(
                {
                    isError: true,
                    structuredContent: {
                        ok: false,
                        error: { code: "bad code; secret", message: hostileMessage },
                    },
                },
                "clockify_demo_seed secret-action",
            );
        } catch (error) {
            expect(String(error)).not.toContain(hostileMessage);
            expect(String(error)).not.toContain("bad code; secret");
            expect(String(error)).not.toContain("secret-action");
        }
    });

    it("aborts a stalled stateless tool call at the proof boundary", async () => {
        const { createToolCaller } = await import(supportSourceUrl.href);
        let observedSignal: AbortSignal | undefined;
        const service = {
            fetch: async (request: Request) => {
                observedSignal = request.signal;
                await new Promise((_resolve, reject) => {
                    request.signal.addEventListener(
                        "abort",
                        () => reject(new Error("request aborted")),
                        { once: true },
                    );
                });
                throw new Error("unreachable");
            },
        };
        const call = createToolCaller(service, new URL("https://mcp.proof.invalid/mcp"), {
            timeoutMs: 1_000,
        });

        await expect(
            call("opaque-token", "clockify_reports_attendance", {}, { timeoutMs: 10 }),
        ).rejects.toThrow("MCP tool clockify_reports_attendance exceeded its proof deadline");
        expect(observedSignal?.aborted).toBe(true);
    });
});
