import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 120_000;
const TERMINATION_GRACE_MS = 5_000;
const STDOUT_LIMIT_BYTES = 1024 * 1024;
const STDERR_LIMIT_BYTES = 64 * 1024;

export function createProofProcessRunner() {
    const children = new Map();
    let interrupted = false;
    let cleanupMode = false;

    const runCaptured = async (
        command,
        args,
        allowFailure = false,
        env,
        stdin,
        timeoutMs = DEFAULT_TIMEOUT_MS,
    ) => {
        if (interrupted && !cleanupMode) {
            throw new Error("proof subprocess runner was interrupted");
        }
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
            throw new TypeError("proof subprocess timeout must be a positive integer");
        }
        return await new Promise((resolve, reject) => {
            const child = spawn(command, args, {
                stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
                ...(env === undefined ? {} : { env }),
            });
            if (stdin !== undefined) {
                child.stdin.on("error", () => {
                    // Process failure is settled from the close event.
                });
                child.stdin.end(stdin);
            }

            const stdout = [];
            const stderr = [];
            let stdoutBytes = 0;
            let stderrBytes = 0;
            let spawnError;
            let timedOut = false;
            let outputLimit;
            let killTimer;
            const state = { interrupted: false };
            const deadline = setTimeout(() => {
                timedOut = true;
                terminate(child);
            }, timeoutMs);

            const terminate = (target) => {
                if (target.exitCode !== null || target.signalCode !== null) return;
                target.kill("SIGTERM");
                killTimer ??= setTimeout(() => {
                    if (target.exitCode === null && target.signalCode === null) {
                        target.kill("SIGKILL");
                    }
                }, TERMINATION_GRACE_MS);
            };
            children.set(child, { state, terminate });
            child.stdout.on("data", (chunk) => {
                const result = collect(stdout, stdoutBytes, chunk, STDOUT_LIMIT_BYTES);
                stdoutBytes = result.bytes;
                if (result.overflow) {
                    outputLimit = "stdout";
                    terminate(child);
                }
            });
            child.stderr.on("data", (chunk) => {
                const result = collect(stderr, stderrBytes, chunk, STDERR_LIMIT_BYTES);
                stderrBytes = result.bytes;
                if (result.overflow) {
                    outputLimit = "stderr";
                    terminate(child);
                }
            });
            child.on("error", (error) => {
                spawnError = error;
            });
            child.on("close", (code) => {
                children.delete(child);
                clearTimeout(deadline);
                if (killTimer !== undefined) clearTimeout(killTimer);
                const result = {
                    stdout: Buffer.concat(stdout).toString("utf8"),
                    stderr: Buffer.concat(stderr).toString("utf8"),
                };
                if (
                    code === 0 &&
                    !timedOut &&
                    !state.interrupted &&
                    outputLimit === undefined &&
                    !spawnError
                ) {
                    resolve(result);
                    return;
                }
                if (state.interrupted) {
                    reject(new Error(`${command} was interrupted`));
                    return;
                }
                if (timedOut) {
                    reject(new Error(`${command} exceeded its proof deadline`));
                    return;
                }
                if (outputLimit !== undefined) {
                    reject(new Error(`${command} exceeded the ${outputLimit} proof limit`));
                    return;
                }
                if (spawnError) {
                    reject(spawnError);
                    return;
                }
                if (allowFailure) {
                    resolve(undefined);
                    return;
                }
                const detail = safeFailureDetail(result.stderr);
                reject(new Error(`${command} failed${detail ? `: ${detail}` : ""}`));
            });
        });
    };

    return {
        async run(command, args, allowFailure = false, env, stdin, timeoutMs) {
            const result = await runCaptured(
                command,
                args,
                allowFailure,
                env,
                stdin,
                timeoutMs,
            );
            return result?.stdout;
        },
        runCaptured,
        beginCleanup() {
            cleanupMode = true;
        },
        terminateAll() {
            interrupted = true;
            for (const [child, entry] of children) {
                entry.state.interrupted = true;
                entry.terminate(child);
            }
        },
    };
}

function collect(chunks, collectedBytes, chunk, limit) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const available = Math.max(0, limit - collectedBytes);
    if (available > 0) chunks.push(value.subarray(0, available));
    return {
        bytes: collectedBytes + Math.min(value.byteLength, available),
        overflow: value.byteLength > available,
    };
}

export function safeFailureDetail(error) {
    const message =
        error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "unknown failure";
    return message
        .replace(/postgres(?:ql)?:\/\/[^\s]+/giu, "[redacted-database-url]")
        .replace(/[A-Za-z0-9_-]{32,}/gu, "[redacted]")
        .replace(/[\r\n\t]+/gu, " ")
        .slice(0, 240);
}

export async function withDeadline(operation, timeoutMs, message) {
    let timer;
    try {
        return await Promise.race([
            operation,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(message)), timeoutMs);
            }),
        ]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}
