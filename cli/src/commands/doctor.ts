/**
 * `clk115 doctor` — local, no-network diagnostics for non-coder
 * operators. It checks config readiness without contacting Clockify;
 * `clk115 status` remains the live credential/workspace probe.
 */
import { classifyClockifyBaseUrl } from "clockify-sdk-ts-115/create-client";
import type { Command } from "commander";

import type { CliConfig, GlobalFlags } from "../config.js";
import { globalFlags, resolveFlags } from "../index.js";
import { printObject } from "../output.js";

import type { Registrar } from "./types.js";

const DEFAULT_CLOCKIFY_BASE_URL = "https://api.clockify.me/api/v1";

export const registerDoctorCommand: Registrar = (program, services) => {
    program
        .command("doctor")
        .description("Check local CLI configuration without contacting Clockify.")
        .action(function (this: Command) {
            const root = rootProgram(this);
            const flags = globalFlags(root);
            const config = services.loadConfig(flags);
            const output = resolveFlags(root);
            printObject(buildDoctorReceipt(config, flags, process.env), output);
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
    };
    next: string[];
}

function buildDoctorReceipt(
    config: CliConfig,
    flags: GlobalFlags,
    env: NodeJS.ProcessEnv,
): DoctorReceipt {
    const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
    const nodeOk = nodeMajor >= 20;
    const apiKeySource = sourceFor("apiKey", config, flags, env);
    const workspaceSource = sourceFor("workspaceId", config, flags, env);
    const baseUrlSource = sourceFor("baseUrl", config, flags, env) ?? "default";
    const apiKeyOk = isPresent(config.apiKey);
    const workspaceOk = isPresent(config.workspaceId);
    const baseUrl = config.baseUrl ?? DEFAULT_CLOCKIFY_BASE_URL;
    const baseUrlClass = config.baseUrl ? classifyClockifyBaseUrl(baseUrl) : undefined;
    const configOk = apiKeyOk && workspaceOk;
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
                ...(nodeOk ? {} : { recovery: "Install Node.js 20 or newer before using @clockify115/cli." }),
            },
            apiKey: {
                ok: apiKeyOk,
                status: apiKeyOk ? "present" : "missing",
                ...(apiKeySource !== undefined ? { source: apiKeySource } : {}),
                ...(apiKeyOk ? { value: "configured (redacted)" } : {}),
                ...(apiKeyOk
                    ? {}
                    : { recovery: "Provide --api-key, set CLOCKIFY_API_KEY, or add apiKey to ~/.clockifyrc.json." }),
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
    if (!input.nodeOk) steps.push("Install Node.js 20 or newer.");
    if (!input.apiKeyOk) steps.push("Set CLOCKIFY_API_KEY or pass --api-key.");
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
        if (isPresent(flags.apiKey)) return "flag";
        if (isPresent(env.CLOCKIFY_API_KEY)) return "env";
        if (isPresent(config.apiKey)) return "rc";
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

function rootProgram(cmd: Command): Command {
    let current: Command = cmd;
    while (current.parent != null) current = current.parent;
    return current;
}
