/**
 * No-network SDK diagnostics.
 *
 * `clockifyDiagnostics()` checks local SDK readiness without constructing
 * a client and without contacting Clockify. Pair it with `client.health()`
 * when you are ready for the first live credential probe.
 */

const ENV_API_KEY = "CLOCKIFY_API_KEY";
const ENV_ADDON_TOKEN = "CLOCKIFY_ADDON_TOKEN";
const ENV_WORKSPACE_ID = "CLOCKIFY_WORKSPACE_ID";
const DEFAULT_CLOCKIFY_BASE_URL = "https://api.clockify.me/api/v1";

export type ClockifyDiagnosticsReadiness =
    | "ready_for_health"
    | "configuration_incomplete"
    | "configuration_conflict"
    | "runtime_unsupported";

export type ClockifyDiagnosticsStatus =
    | "present"
    | "missing"
    | "conflict"
    | "supported"
    | "unsupported"
    | "default"
    | "override"
    | "unknown";

export type ClockifyDiagnosticsSource =
    | "explicit"
    | "env"
    | "default"
    | "unavailable";

export interface ClockifyDiagnosticsInput {
    /** Explicit API key, if the caller intends to pass one to createClockifyClient. */
    apiKey?: unknown;
    /** Explicit addon token, if the caller intends to pass one to createClockifyClient. */
    addonToken?: unknown;
    /** Optional workspace ID used by most resource calls. */
    workspaceId?: string;
    /** Fern environment/base URL override passed through createClockifyClient. */
    environment?: string;
    /** Alias accepted for operator-oriented diagnostics. */
    baseUrl?: string;
    /** Test/embedding override. Defaults to process.env when available. */
    env?: Record<string, string | undefined>;
    /** Test/embedding override. Defaults to process.versions.node when available. */
    nodeVersion?: string;
}

export interface ClockifyDiagnosticCheck {
    ok: boolean;
    status: ClockifyDiagnosticsStatus;
    source: ClockifyDiagnosticsSource;
    value?: string;
    recovery?: string;
}

export interface ClockifyDiagnosticsResult {
    ok: boolean;
    readiness: ClockifyDiagnosticsReadiness;
    checks: {
        runtime: ClockifyDiagnosticCheck;
        auth: ClockifyDiagnosticCheck;
        workspaceId: ClockifyDiagnosticCheck;
        baseUrl: ClockifyDiagnosticCheck;
    };
    warnings: string[];
    next: string[];
}

export function clockifyDiagnostics(
    input: ClockifyDiagnosticsInput = {},
): ClockifyDiagnosticsResult {
    const env = input.env ?? readProcessEnv();
    const explicitApiKey = isSupplied(input.apiKey);
    const explicitAddonToken = isSupplied(input.addonToken);
    const envApiKey = isSupplied(env[ENV_API_KEY]);
    const envAddonToken = isSupplied(env[ENV_ADDON_TOKEN]);
    const explicitWorkspaceId = isSupplied(input.workspaceId);
    const envWorkspaceId = isSupplied(env[ENV_WORKSPACE_ID]);
    const explicitBaseUrl = isSupplied(input.environment) || isSupplied(input.baseUrl);
    const envBaseUrl = isSupplied(env.CLOCKIFY_BASE_URL);
    const workspaceId = explicitWorkspaceId ? input.workspaceId : env[ENV_WORKSPACE_ID];
    const workspaceSource: ClockifyDiagnosticsSource = explicitWorkspaceId
        ? "explicit"
        : envWorkspaceId
          ? "env"
          : "unavailable";
    const baseUrl = isSupplied(input.environment)
        ? input.environment
        : isSupplied(input.baseUrl)
          ? input.baseUrl
          : env.CLOCKIFY_BASE_URL;
    const baseUrlSource: ClockifyDiagnosticsSource = explicitBaseUrl
        ? "explicit"
        : envBaseUrl
          ? "env"
          : "default";
    const nodeVersion = input.nodeVersion ?? readNodeVersion();
    const runtime = runtimeCheck(nodeVersion);
    const auth = authCheck({ explicitApiKey, explicitAddonToken, envApiKey, envAddonToken });
    const workspace = workspaceCheck(workspaceId, workspaceSource);
    const base = baseUrlCheck(baseUrl, baseUrlSource);
    const warnings = buildWarnings({ envApiKey, envAddonToken, workspace, base });
    const readiness = readinessFor({ runtime, auth });

    return {
        ok: runtime.ok && auth.ok,
        readiness,
        checks: {
            runtime,
            auth,
            workspaceId: workspace,
            baseUrl: base,
        },
        warnings,
        next: nextSteps({ runtime, auth, workspace, base }),
    };
}

function authCheck(input: {
    explicitApiKey: boolean;
    explicitAddonToken: boolean;
    envApiKey: boolean;
    envAddonToken: boolean;
}): ClockifyDiagnosticCheck {
    if (input.explicitApiKey && input.explicitAddonToken) {
        return {
            ok: false,
            status: "conflict",
            source: "explicit",
            recovery: "Pass exactly one of apiKey or addonToken to createClockifyClient.",
        };
    }
    if (input.explicitApiKey || input.explicitAddonToken) {
        return {
            ok: true,
            status: "present",
            source: "explicit",
            value: input.explicitApiKey ? "apiKey configured (redacted)" : "addonToken configured (redacted)",
        };
    }
    if (input.envApiKey || input.envAddonToken) {
        return {
            ok: true,
            status: "present",
            source: "env",
            value: input.envApiKey ? `${ENV_API_KEY} configured (redacted)` : `${ENV_ADDON_TOKEN} configured (redacted)`,
        };
    }
    return {
        ok: false,
        status: "missing",
        source: "unavailable",
        recovery: `Provide apiKey/addonToken explicitly or set ${ENV_API_KEY} / ${ENV_ADDON_TOKEN}.`,
    };
}

function runtimeCheck(nodeVersion: string | undefined): ClockifyDiagnosticCheck {
    if (!nodeVersion) {
        return {
            ok: true,
            status: "unknown",
            source: "unavailable",
            recovery: "Runtime version is unavailable; this SDK is packaged for Node.js 20+.",
        };
    }
    const major = Number.parseInt(nodeVersion.split(".")[0] ?? "0", 10);
    const ok = Number.isFinite(major) && major >= 20;
    return {
        ok,
        status: ok ? "supported" : "unsupported",
        source: "env",
        value: nodeVersion,
        recovery: ok ? undefined : "Install Node.js 20 or newer before using clockify-sdk-ts-115.",
    };
}

function workspaceCheck(
    workspaceId: string | undefined,
    source: ClockifyDiagnosticsSource,
): ClockifyDiagnosticCheck {
    if (!isSupplied(workspaceId)) {
        return {
            ok: true,
            status: "missing",
            source: "unavailable",
            recovery: `Set ${ENV_WORKSPACE_ID} or pass workspaceId before resource calls that require a workspace.`,
        };
    }
    return {
        ok: true,
        status: "present",
        source,
        value: maskId(workspaceId),
    };
}

function baseUrlCheck(
    baseUrl: string | undefined,
    source: ClockifyDiagnosticsSource,
): ClockifyDiagnosticCheck {
    if (!isSupplied(baseUrl)) {
        return {
            ok: true,
            status: "default",
            source: "default",
            value: DEFAULT_CLOCKIFY_BASE_URL,
        };
    }
    return {
        ok: true,
        status: "override",
        source,
        value: baseUrl,
        recovery: "Use the default Clockify API base URL for live work; keep overrides for mocks or replay.",
    };
}

function readinessFor(input: {
    runtime: ClockifyDiagnosticCheck;
    auth: ClockifyDiagnosticCheck;
}): ClockifyDiagnosticsReadiness {
    if (!input.runtime.ok) return "runtime_unsupported";
    if (input.auth.status === "conflict") return "configuration_conflict";
    if (!input.auth.ok) return "configuration_incomplete";
    return "ready_for_health";
}

function buildWarnings(input: {
    envApiKey: boolean;
    envAddonToken: boolean;
    workspace: ClockifyDiagnosticCheck;
    base: ClockifyDiagnosticCheck;
}): string[] {
    const warnings: string[] = [];
    if (input.envApiKey && input.envAddonToken) {
        warnings.push(`${ENV_API_KEY} and ${ENV_ADDON_TOKEN} are both set; createClockifyClient prefers ${ENV_API_KEY}.`);
    }
    if (input.workspace.status === "missing") {
        warnings.push(`${ENV_WORKSPACE_ID} is not set; client.health() can run, but most resource calls need a workspaceId.`);
    }
    if (input.base.status === "override") {
        warnings.push("A Clockify base URL override is configured; confirm this is intentional before live work.");
    }
    return warnings;
}

function nextSteps(input: {
    runtime: ClockifyDiagnosticCheck;
    auth: ClockifyDiagnosticCheck;
    workspace: ClockifyDiagnosticCheck;
    base: ClockifyDiagnosticCheck;
}): string[] {
    const steps: string[] = [];
    if (!input.runtime.ok) steps.push("Install Node.js 20 or newer.");
    if (input.auth.status === "conflict") steps.push("Keep exactly one auth scheme: apiKey or addonToken.");
    if (!input.auth.ok && input.auth.status !== "conflict") {
        steps.push(`Set ${ENV_API_KEY} or ${ENV_ADDON_TOKEN}, or pass auth explicitly.`);
    }
    if (input.workspace.status === "missing") steps.push(`Set ${ENV_WORKSPACE_ID} before workspace resource calls.`);
    if (input.base.status === "override") steps.push("Confirm the base URL override points at a mock/replay server or an intended Clockify-compatible endpoint.");
    if (steps.length === 0) {
        steps.push("Create the client with createClockifyClient().");
        steps.push("Run client.health() as the first live Clockify probe.");
    }
    return steps;
}

function isSupplied(value: unknown): value is string {
    if (typeof value === "string") return value.trim().length > 0;
    return value !== null && value !== undefined;
}

function maskId(value: string): string {
    if (value.length <= 10) return "configured";
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function readProcessEnv(): Record<string, string | undefined> {
    return typeof process !== "undefined" && process.env ? process.env : {};
}

function readNodeVersion(): string | undefined {
    return typeof process !== "undefined" ? process.versions?.node : undefined;
}
