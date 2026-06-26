import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { Context } from "../client.js";
import { failureCode, failureHint } from "../diagnose.js";
import { defineTool, entityId, successResult } from "../result.js";

/** Local clock more than this far from Clockify server time is a warning. */
const CLOCK_SKEW_WARN_MS = 5 * 60 * 1000;

interface DoctorCheck {
    name: string;
    ok: boolean;
    detail: string;
    /** Critical checks decide the overall verdict; informational ones do not. */
    critical?: boolean;
    code?: string;
    remediation?: string;
}

/**
 * `clockify_doctor` — a read-only live connection preflight. Unlike the
 * no-network `clockify://mcp/doctor` resource, this actually reaches Clockify:
 * it validates the API key against `/user`, confirms the pinned workspace is
 * reachable for that key, reports base-URL posture (host only), and estimates
 * clock skew. The tool *call itself succeeds* even when a check fails — it
 * returns a `successResult` whose `data.ok` is the overall verdict and whose
 * `data.checks[]` carry per-check `ok` + `remediation`, so an agent gets the
 * full diagnostic instead of one short-circuited error. Each network call is
 * wrapped so the handler never throws into `defineTool`'s catch. Per-failure
 * remediation reuses the shared failure-class hints in `diagnose.ts` rather
 * than duplicating strings, so renaming an error code updates both surfaces.
 */
export function registerDoctorTool(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_doctor",
        {
            title: "Clockify doctor (live preflight)",
            description:
                "Run a live connection preflight: validate CLOCKIFY_API_KEY against /user, confirm the pinned CLOCKIFY_WORKSPACE_ID is reachable for that key, report base-URL posture, and estimate clock skew. Returns a pass/fail receipt with per-failure remediation.",
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async () => {
            // 0) Not configured: the server started without credentials, so
            // ctx.client / ctx.workspaceId THROW on access. Short-circuit on the
            // safe ctx.setupError flag before touching them, returning a
            // structured "not configured" fail. The diagnostic call still
            // succeeds (isError stays falsy) — the agent gets a remediation, not
            // a crash.
            if (ctx.setupError) {
                const code = "setup_required";
                const check: DoctorCheck = {
                    name: "config",
                    ok: false,
                    critical: true,
                    code,
                    detail: ctx.setupError.message,
                    remediation: failureHint(ctx.setupError, code).hint,
                };
                return successResult(
                    "clockify_doctor",
                    { ok: false, workspaceId: null, user: null, latencyMs: null, checks: [check] },
                    undefined,
                    {
                        next: [
                            {
                                tool: "clockify_status",
                                reason: "Re-run after setting CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID.",
                            },
                        ],
                    },
                );
            }

            const checks: DoctorCheck[] = [];
            const warnings: { code?: string; message: string }[] = [];
            let userId = "";
            let userEmail = "";
            let userName = "";

            // 1) Auth + connectivity. client.health() never throws.
            const health = await ctx.client.health();
            if (health.ok) {
                userId = entityId(health.user) ?? "";
                userEmail = (health.user as { email?: string } | undefined)?.email ?? "";
                userName = (health.user as { name?: string } | undefined)?.name ?? "";
                checks.push({
                    name: "auth",
                    ok: true,
                    critical: true,
                    detail: `API key valid; authenticated as ${userEmail || userId || "unknown user"} (${health.latencyMs}ms).`,
                });
            } else {
                const code = failureCode(health.error);
                checks.push({
                    name: "auth",
                    ok: false,
                    critical: true,
                    code,
                    detail:
                        health.error instanceof Error
                            ? health.error.message
                            : "Could not authenticate against Clockify /user.",
                    remediation: failureHint(health.error, code).hint,
                });
            }

            // 2) Workspace pin — only meaningful if auth succeeded.
            if (health.ok) {
                try {
                    const workspaces = (await ctx.client.workspaces.list()) as unknown[];
                    const present = workspaces.some((w) => entityId(w) === ctx.workspaceId);
                    const pin: DoctorCheck = {
                        name: "workspace_pin",
                        ok: present,
                        critical: true,
                        detail: present
                            ? `CLOCKIFY_WORKSPACE_ID is one of this key's ${workspaces.length} workspace(s).`
                            : `CLOCKIFY_WORKSPACE_ID is not among this key's ${workspaces.length} workspace(s).`,
                    };
                    if (!present) {
                        pin.code = "not_found";
                        pin.remediation = failureHint(undefined, "not_found").hint;
                    }
                    checks.push(pin);
                } catch (err) {
                    const code = failureCode(err);
                    checks.push({
                        name: "workspace_pin",
                        ok: false,
                        critical: true,
                        code,
                        detail:
                            err instanceof Error
                                ? err.message
                                : "Could not list workspaces to confirm the pin.",
                        remediation: failureHint(err, code).hint,
                    });
                }
            }

            // 3) Base-URL posture (informational; never echoes the full value).
            const rawBaseUrl = process.env.CLOCKIFY_BASE_URL;
            let baseUrlDetail: string;
            if (!rawBaseUrl) {
                baseUrlDetail = "CLOCKIFY_BASE_URL unset; using the default Clockify host.";
            } else {
                let host = "custom (set)";
                try {
                    host = new URL(rawBaseUrl).host;
                } catch {
                    /* keep the generic label; never echo a malformed value */
                }
                baseUrlDetail = `CLOCKIFY_BASE_URL points at ${host} (mock/replay or trusted proxy).`;
                warnings.push({ message: `Live requests route via custom base URL host ${host}.` });
            }
            checks.push({ name: "base_url", ok: true, detail: baseUrlDetail });

            // 4) Clock skew (best-effort; informational unless large).
            if (health.ok && health.serverTime instanceof Date) {
                const skewMs = health.serverTime.getTime() - Date.now();
                const within = Math.abs(skewMs) <= CLOCK_SKEW_WARN_MS;
                const skew: DoctorCheck = {
                    name: "clock_skew",
                    ok: within,
                    detail: within
                        ? `Local clock within ${Math.round(Math.abs(skewMs) / 1000)}s of Clockify server time.`
                        : `Local clock is off by ~${Math.round(skewMs / 1000)}s vs Clockify server time.`,
                };
                if (!within) {
                    skew.remediation =
                        "Sync the host clock (NTP). Large skew can break time-entry start/stop and signed requests.";
                    warnings.push({
                        message: `Clock skew ~${Math.round(skewMs / 1000)}s exceeds ${CLOCK_SKEW_WARN_MS / 1000}s.`,
                    });
                }
                checks.push(skew);
            } else {
                checks.push({
                    name: "clock_skew",
                    ok: true,
                    detail: "Server time unavailable; clock skew not measured.",
                });
            }

            const overall = checks.filter((c) => c.critical).every((c) => c.ok);

            return successResult(
                "clockify_doctor",
                {
                    ok: overall,
                    workspaceId: ctx.workspaceId,
                    user: health.ok ? { id: userId, email: userEmail, name: userName } : null,
                    latencyMs: health.latencyMs,
                    checks,
                },
                undefined,
                {
                    entity: "workspace",
                    ids: { workspaceId: ctx.workspaceId, userId },
                    ...(warnings.length > 0 ? { warnings } : {}),
                    next: [
                        {
                            tool: "clockify_status",
                            reason: overall
                                ? "Credentials verified; check running timer and user state."
                                : "Re-run after applying the remediation above.",
                        },
                    ],
                },
            );
        },
    );
}
