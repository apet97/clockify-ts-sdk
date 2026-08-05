/**
 * `clk115 doctor` — local, no-network diagnostics for non-coder
 * operators. It checks config readiness without contacting Clockify;
 * `clk115 status` remains the live credential/workspace probe.
 */
import { classifyClockifyBaseUrl } from "clockify-sdk-ts-115/create-client";
import type { Command } from "commander";

import { buildRoutingOptions } from "../client.js";
import type { CliConfig, GlobalFlags } from "../config.js";
import { globalFlags, resolveFlags } from "../index.js";
import { printObject, printRecords } from "../output.js";

import { rootProgram } from "./helpers.js";
import { leafCommand } from "./leaf-command.js";
import type { Registrar } from "./types.js";

const DEFAULT_CLOCKIFY_BASE_URL = "https://api.clockify.me/api/v1";

export const registerDoctorCommand: Registrar = (program, services) => {
    leafCommand(program, "doctor", "read")
        .description("Check local CLI configuration without contacting Clockify.")
        .action(function (this: Command) {
            const root = rootProgram(this);
            const flags = globalFlags(root);
            const config = services.loadConfig(flags);
            const output = resolveFlags(root);
            const receipt = buildDoctorReceipt(config, flags, process.env);
            if (output.mode !== "table") {
                printObject(receipt, output);
                return;
            }
            // Table mode: `printObject` stringifies the nested `checks` object
            // into ONE ~560-char cell, which buries the per-check recovery
            // hints this command exists to surface for non-coder operators.
            // The JSON/NDJSON payload is untouched.
            printRecords(
                Object.entries(receipt.checks).map(([check, c]) => ({
                    check,
                    ok: c.ok,
                    status: c.status,
                    source: c.source ?? "",
                    value: c.value ?? "",
                    recovery: c.recovery ?? "",
                })),
                output,
            );
            printObject({ ok: receipt.ok, readiness: receipt.readiness }, output);
            for (const step of receipt.next) console.log(step);
        });
};

interface DoctorCheck {
    ok: boolean;
    status: "present" | "missing" | "supported" | "unsupported" | "default" | "override";
    source?: "flag" | "env" | "rc" | "default";
    value?: string;
    recovery?: string;
}

interface DoctorReceipt {
    ok: boolean;
    readiness: "ready_for_status" | "configuration_incomplete" | "runtime_unsupported";
    checks: {
        node: DoctorCheck;
        apiKey: DoctorCheck;
        workspaceId: DoctorCheck;
        baseUrl: DoctorCheck;
        region: DoctorCheck;
        subdomain: DoctorCheck;
    };
    next: string[];
}

function buildDoctorReceipt(
    config: CliConfig,
    flags: GlobalFlags,
    env: NodeJS.ProcessEnv,
): DoctorReceipt {
    const [nodeMajor = 0, nodeMinor = 0] = process.versions.node
        .split(".")
        .map((part) => Number.parseInt(part, 10) || 0);
    // Must match cli/package.json "engines.node": ">=22.13.0" — a bare major
    // check green-lights 22.0-22.12, which the package itself does not support.
    const nodeOk = nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 13);
    const apiKeySource = sourceFor("apiKey", config, flags, env);
    const workspaceSource = sourceFor("workspaceId", config, flags, env);
    const baseUrlSource = sourceFor("baseUrl", config, flags, env) ?? "default";
    const regionSource = sourceFor("region", config, flags, env) ?? "default";
    const subdomainSource = sourceFor("subdomain", config, flags, env) ?? "default";
    const apiKeyOk = isPresent(config.apiKey);
    const workspaceOk = isPresent(config.workspaceId);
    const baseUrl = config.baseUrl ?? DEFAULT_CLOCKIFY_BASE_URL;
    const baseUrlClass = config.baseUrl ? classifyClockifyBaseUrl(baseUrl) : undefined;
    let routingError: string | undefined;
    if (isPresent(config.region) || isPresent(config.subdomain)) {
        try {
            buildRoutingOptions(config.region, config.subdomain);
        } catch (err) {
            routingError = err instanceof Error ? err.message : String(err);
        }
    }
    const regionOk = routingError === undefined;
    const subdomainOk = routingError === undefined;
    const configOk = apiKeyOk && workspaceOk && regionOk;
    const ok = nodeOk && configOk;

    return {
        ok,
        readiness: !nodeOk
            ? "runtime_unsupported"
            : configOk
              ? "ready_for_status"
              : "configuration_incomplete",
        checks: {
            node: {
                ok: nodeOk,
                status: nodeOk ? "supported" : "unsupported",
                value: process.versions.node,
                ...(nodeOk ? {} : { recovery: "Install Node.js 22.13 or newer before using @apet97/clockify-cli-115." }),
            },
            apiKey: {
                ok: apiKeyOk,
                status: apiKeyOk ? "present" : "missing",
                ...(apiKeySource !== undefined ? { source: apiKeySource } : {}),
                ...(apiKeyOk ? { value: "configured (redacted)" } : {}),
                ...(apiKeyOk
                    ? {}
                    : { recovery: "Set CLOCKIFY_API_KEY in the process environment." }),
            },
            workspaceId: {
                ok: workspaceOk,
                status: workspaceOk ? "present" : "missing",
                ...(workspaceSource !== undefined ? { source: workspaceSource } : {}),
                ...(config.workspaceId !== undefined ? { value: maskId(config.workspaceId) ?? "" } : {}),
                ...(workspaceOk
                    ? {}
                    : {
                          recovery:
                              "Provide --workspace, set CLOCKIFY_WORKSPACE_ID, or add workspaceId to ~/.clockifyrc.json.",
                      }),
            },
            baseUrl: {
                ok: baseUrlClass ? baseUrlClass.allowed : true,
                status: config.baseUrl ? "override" : "default",
                source: baseUrlSource,
                value: baseUrl,
                ...(config.baseUrl
                    ? {
                          recovery:
                              baseUrlClass && !baseUrlClass.allowed
                                  ? `${baseUrlClass.reason ?? "Base URL is outside the Clockify host allowlist."} The client will reject it — use the default Clockify API base URL, or a loopback host for mocks/replay.`
                                  : "Use the default Clockify API base URL for real work; keep overrides for mocks or replay.",
                      }
                    : {}),
            },
            region: {
                ok: regionOk,
                status: config.region ? "override" : "default",
                source: regionSource,
                value: config.region ?? "global",
                ...(routingError !== undefined ? { recovery: routingError } : {}),
            },
            subdomain: {
                ok: subdomainOk,
                status: config.subdomain ? "override" : "default",
                source: subdomainSource,
                ...(config.subdomain !== undefined ? { value: maskId(config.subdomain) ?? "" } : {}),
                ...(routingError !== undefined && isPresent(config.subdomain)
                    ? { recovery: routingError }
                    : {}),
            },
        },
        next: nextSteps({ nodeOk, apiKeyOk, workspaceOk, hasBaseUrlOverride: isPresent(config.baseUrl) }),
    };
}

function nextSteps(input: {
    nodeOk: boolean;
    apiKeyOk: boolean;
    workspaceOk: boolean;
    hasBaseUrlOverride: boolean;
}): string[] {
    const steps: string[] = [];
    if (!input.nodeOk) steps.push("Install Node.js 22.13 or newer.");
    if (!input.apiKeyOk) steps.push("Set CLOCKIFY_API_KEY in the process environment.");
    if (!input.workspaceOk) steps.push("Set CLOCKIFY_WORKSPACE_ID or pass --workspace.");
    if (input.hasBaseUrlOverride) {
        steps.push("Confirm CLOCKIFY_BASE_URL or --base-url is intentional before live work.");
    }
    if (steps.length === 0) {
        steps.push("Run `clk115 status` to verify live Clockify access.");
        steps.push("Run `clk115 --json status` when another tool needs a machine-readable receipt.");
    }
    return steps;
}

function sourceFor(
    field: keyof CliConfig,
    config: CliConfig,
    flags: GlobalFlags,
    env: NodeJS.ProcessEnv,
): DoctorCheck["source"] | undefined {
    if (field === "apiKey") {
        if (isPresent(env.CLOCKIFY_API_KEY)) return "env";
        return undefined;
    }
    if (field === "workspaceId") {
        if (isPresent(flags.workspace)) return "flag";
        if (isPresent(env.CLOCKIFY_WORKSPACE_ID)) return "env";
        if (isPresent(config.workspaceId)) return "rc";
        return undefined;
    }
    if (field === "baseUrl") {
        if (isPresent(flags.baseUrl)) return "flag";
        if (isPresent(env.CLOCKIFY_BASE_URL)) return "env";
        if (isPresent(config.baseUrl)) return "rc";
        return undefined;
    }
    if (field === "region") {
        if (isPresent(flags.region)) return "flag";
        if (isPresent(env.CLOCKIFY_REGION)) return "env";
        if (isPresent(config.region)) return "rc";
        return undefined;
    }
    // The last field in the union; no further discriminator is needed.
    if (isPresent(flags.subdomain)) return "flag";
    if (isPresent(env.CLOCKIFY_SUBDOMAIN)) return "env";
    if (isPresent(config.subdomain)) return "rc";
    return undefined;
}

function isPresent(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function maskId(value: string | undefined): string | undefined {
    if (!value) return undefined;
    if (value.length <= 10) return "configured";
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
