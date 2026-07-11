/**
 * CLI configuration — env-first, with optional ~/.clockifyrc JSON
 * file fallback. The rc file lives at $CLOCKIFY_HOME/clockifyrc.json
 * or ~/.clockifyrc.json; it is intentionally simple (no nesting) so
 * that an operator can hand-edit it without reaching for jq.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CliConfig {
    apiKey?: string;
    workspaceId?: string;
    baseUrl?: string;
}

export interface GlobalFlags {
    workspace?: string;
    baseUrl?: string;
}

/**
 * Resolve CLI config from (lowest → highest precedence):
 *   1. ~/.clockifyrc.json (or $CLOCKIFY_HOME/clockifyrc.json)
 *   2. CLOCKIFY_API_KEY / CLOCKIFY_WORKSPACE_ID / CLOCKIFY_BASE_URL env vars
 *   3. --workspace / --base-url command-line flags
 *
 * Returns the resolved values without throwing — call requireApiKey /
 * requireWorkspaceId at the point of use for the error message that
 * names the missing input.
 */
export function loadConfig(flags: GlobalFlags = {}, env: NodeJS.ProcessEnv = process.env): CliConfig {
    const file = loadRcFile(env);
    const apiKey = firstPresent(env.CLOCKIFY_API_KEY);
    const workspaceId = firstPresent(flags.workspace, env.CLOCKIFY_WORKSPACE_ID, file.workspaceId);
    const baseUrl = firstPresent(flags.baseUrl, env.CLOCKIFY_BASE_URL, file.baseUrl);
    // firstPresent treats an empty/whitespace value as absent, so a blank env var
    // (e.g. the `CLOCKIFY_API_KEY=''` deterministic-gate convention) does not shadow a
    // real rc-file value — matching doctor's isPresent() trim semantics. Precedence
    // is unchanged: flags ?? env ?? file (highest → lowest).
    return {
        ...(apiKey !== undefined ? { apiKey } : {}),
        ...(workspaceId !== undefined ? { workspaceId } : {}),
        ...(baseUrl !== undefined ? { baseUrl } : {}),
    };
}

function firstPresent(...values: Array<string | undefined>): string | undefined {
    return values.find((value) => typeof value === "string" && value.trim().length > 0);
}

export function requireApiKey(config: CliConfig): string {
    if (!config.apiKey) {
        throw new Error(
            "Clockify API key not set. Set CLOCKIFY_API_KEY in the process environment.",
        );
    }
    return config.apiKey;
}

export function requireWorkspaceId(config: CliConfig): string {
    if (!config.workspaceId) {
        throw new Error(
            "Clockify workspace ID not set. Provide --workspace, set CLOCKIFY_WORKSPACE_ID, or add `workspaceId` to ~/.clockifyrc.json.",
        );
    }
    return config.workspaceId;
}

function loadRcFile(env: NodeJS.ProcessEnv): CliConfig {
    const root = env.CLOCKIFY_HOME ?? homedir();
    const candidates = [join(root, "clockifyrc.json"), join(root, ".clockifyrc.json")];
    for (const path of candidates) {
        if (!existsSync(path)) {
            continue;
        }
        try {
            const raw = readFileSync(path, "utf8");
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            if (Object.prototype.hasOwnProperty.call(parsed, "apiKey")) {
                throw new Error(
                    "legacy rc-file secret detected: remove apiKey from the rc file and set CLOCKIFY_API_KEY in the process environment",
                );
            }
            const out: CliConfig = {};
            if (typeof parsed.workspaceId === "string") out.workspaceId = parsed.workspaceId;
            if (typeof parsed.baseUrl === "string") out.baseUrl = parsed.baseUrl;
            return out;
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            throw new Error(`failed to read Clockify rc file ${path}: ${reason}`);
        }
    }
    return {};
}
