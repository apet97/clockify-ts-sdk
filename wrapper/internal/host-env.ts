/**
 * Truthfully-typed access to the host `process` object.
 *
 * The SDK ships dual ESM/CJS and must run on browsers and edge runtimes as well
 * as Node. `@types/node` declares `process`, `process.env` and
 * `process.versions` as always present, so every guard against a shimmed or
 * absent `process` reads to the type checker as dead code. The declaration
 * below states what is actually reachable: `process` may be missing, and when a
 * bundler supplies a shim it may carry neither `env` nor `versions`.
 *
 * Keep the runtime guards here and let the rest of the wrapper consume the
 * narrow results.
 */

/** A `process` as little as a browser shim is allowed to provide. */
interface HostProcess {
    env?: Record<string, string | undefined>;
    versions?: { node?: string };
}

function hostProcess(): HostProcess | undefined {
    return typeof process !== "undefined" ? process : undefined;
}

/** Every host environment variable, or `{}` when the host exposes none. */
export function hostEnv(): Record<string, string | undefined> {
    return hostProcess()?.env ?? {};
}

/** One host environment variable, or `undefined` when unset or unavailable. */
export function hostEnvVar(name: string): string | undefined {
    return hostEnv()[name];
}

/** The host Node version, or `undefined` off Node. */
export function hostNodeVersion(): string | undefined {
    return hostProcess()?.versions?.node;
}
