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
    /** Clockify routing profile name (`global`, `eu`, `us`, `uk`, `au`,
     *  `developer`). Mutually exclusive with `baseUrl` -- see buildClient. */
    region?: string;
    /** Workspace subdomain; requires `region` to be one of `eu`/`us`/`uk`/`au`. */
    subdomain?: string;
}

export interface GlobalFlags {
    workspace?: string;
    baseUrl?: string;
    region?: string;
    subdomain?: string;
}

const KNOWN_RC_FILE_KEYS = ["workspaceId", "baseUrl", "region", "subdomain"] as const;

function editDistance(left: string, right: string): number {
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
        const current = [leftIndex + 1];
        for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
            current.push(
                Math.min(
                    current[rightIndex]! + 1,
                    previous[rightIndex + 1]! + 1,
                    previous[rightIndex]! +
                        (left[leftIndex] === right[rightIndex] ? 0 : 1),
                ),
            );
        }
        previous = current;
    }
    return previous[right.length]!;
}

function nearestRcFileKey(input: string): (typeof KNOWN_RC_FILE_KEYS)[number] {
    const normalized = input.toLowerCase();
    let nearest: (typeof KNOWN_RC_FILE_KEYS)[number] = KNOWN_RC_FILE_KEYS[0];
    let smallestDistance = editDistance(normalized, nearest.toLowerCase());
    for (const candidate of KNOWN_RC_FILE_KEYS.slice(1)) {
        const distance = editDistance(normalized, candidate.toLowerCase());
        if (distance < smallestDistance) {
            nearest = candidate;
            smallestDistance = distance;
        }
    }
    return nearest;
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
    const region = firstPresent(flags.region, env.CLOCKIFY_REGION, file.region);
    const subdomain = firstPresent(flags.subdomain, env.CLOCKIFY_SUBDOMAIN, file.subdomain);
    // firstPresent treats an empty/whitespace value as absent, so a blank env var
    // (e.g. the `CLOCKIFY_API_KEY=''` deterministic-gate convention) does not shadow a
    // real rc-file value — matching doctor's isPresent() trim semantics. Precedence
    // is unchanged: flags ?? env ?? file (highest → lowest).
    return {
        ...(apiKey !== undefined ? { apiKey } : {}),
        ...(workspaceId !== undefined ? { workspaceId } : {}),
        ...(baseUrl !== undefined ? { baseUrl } : {}),
        ...(region !== undefined ? { region } : {}),
        ...(subdomain !== undefined ? { subdomain } : {}),
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
        // Only the read+parse belongs in the try: a legacy-secret rc file was
        // read and parsed fine, so wrapping its guard in "failed to read ..."
        // would misreport it as an unreadable file.
        let parsed: Record<string, unknown> = {};
        try {
            const raw = readFileSync(path, "utf8");
            parsed = JSON.parse(raw) as Record<string, unknown>;
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            throw new Error(`failed to read Clockify rc file ${path}: ${reason}`);
        }
        if (Object.prototype.hasOwnProperty.call(parsed, "apiKey")) {
            throw new Error(
                "legacy rc-file secret detected: remove apiKey from the rc file and set CLOCKIFY_API_KEY in the process environment",
            );
        }
        for (const key of Object.keys(parsed)) {
            if ((KNOWN_RC_FILE_KEYS as readonly string[]).includes(key)) continue;
            const suggestion = nearestRcFileKey(key);
            process.stderr.write(
                `WARN clk115: ignoring unknown rc-file key ${JSON.stringify(key)}. Did you mean ${JSON.stringify(suggestion)}?\n`,
            );
        }
        const out: CliConfig = {};
        for (const key of KNOWN_RC_FILE_KEYS) {
            const value = parsed[key];
            if (typeof value === "string") out[key] = value;
        }
        return out;
    }
    return {};
}
