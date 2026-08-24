import { spawn } from "node:child_process";
import { basename } from "node:path";

export function createProofProcessRunner(options) {
    const activeChildren = new Map();
    const terminationTimers = new Map();
    let interruptedSignal;
    let cleaningUp = false;

    return {
        get interruptedSignal() {
            return interruptedSignal;
        },
        beginCleanup() {
            cleaningUp = true;
        },
        interrupt(signal) {
            interruptedSignal ??= signal;
            for (const [child, state] of activeChildren) {
                state.interrupted = signal;
                terminateChild(child);
            }
            for (const container of options.ownedContainerNames) {
                void terminateOwnedContainer(container);
            }
        },
        run(command, args, runOptions = {}) {
            if (interruptedSignal && !cleaningUp) {
                return Promise.reject(new Error(`proof interrupted by ${interruptedSignal}`));
            }
            return new Promise((resolveRun, reject) => {
                const child = spawn(command, args, {
                    cwd: options.cwd,
                    stdio: ["pipe", "pipe", "pipe"],
                });
                const state = {
                    forceReject: undefined,
                    interrupted: undefined,
                    timedOut: false,
                };
                activeChildren.set(child, state);
                let stdout = "";
                let stderr = "";
                let settled = false;
                let timeout;
                const settle = (operation) => {
                    if (settled) return;
                    settled = true;
                    activeChildren.delete(child);
                    clearTimeout(timeout);
                    clearTermination(child);
                    operation();
                };
                state.forceReject = () => {
                    child.stdin.destroy();
                    child.stdout.destroy();
                    child.stderr.destroy();
                    child.unref();
                    settle(() =>
                        reject(
                            state.interrupted
                                ? interruptedCommand(command, state.interrupted)
                                : timedOutCommand(command),
                        ),
                    );
                };
                const append = (current, chunk) => {
                    const next = current + chunk.toString("utf8");
                    return next.length > 1024 * 1024 ? next.slice(-1024 * 1024) : next;
                };
                child.stdout.on("data", (chunk) => {
                    stdout = append(stdout, chunk);
                });
                child.stderr.on("data", (chunk) => {
                    stderr = append(stderr, chunk);
                });
                child.stdin.on("error", () => {
                    // The child exit status owns failures when it closes stdin early.
                });
                child.once("error", (error) => {
                    settle(() => reject(error));
                });
                child.once("close", (code, signal) => {
                    settle(() => {
                        const result = { code: code ?? 1, signal, stdout, stderr };
                        if (state.interrupted) {
                            reject(interruptedCommand(command, state.interrupted));
                        } else if (state.timedOut) {
                            reject(timedOutCommand(command));
                        } else if (result.code === 0 || runOptions.allowFailure) {
                            resolveRun(runOptions.allowFailure ? result : stdout);
                        } else {
                            reject(commandFailure(command, result.code, stderr));
                        }
                    });
                });
                timeout = setTimeout(
                    () => {
                        state.timedOut = true;
                        terminateChild(child);
                        if (runOptions.containerName) {
                            void terminateOwnedContainer(runOptions.containerName);
                        }
                    },
                    runOptions.timeoutMs ?? 2 * 60_000,
                );
                if (runOptions.input === undefined) child.stdin.end();
                else child.stdin.end(runOptions.input);
            });
        },
    };

    function terminateChild(child) {
        if (terminationTimers.has(child)) return;
        const state = activeChildren.get(child);
        if (!state) return;
        child.kill("SIGTERM");
        const killTimer = setTimeout(() => {
            child.kill("SIGKILL");
        }, 2_000);
        const settlementTimer = setTimeout(() => state.forceReject(), 4_000);
        terminationTimers.set(child, { killTimer, settlementTimer });
    }

    function clearTermination(child) {
        const timers = terminationTimers.get(child);
        if (!timers) return;
        clearTimeout(timers.killTimer);
        clearTimeout(timers.settlementTimer);
        terminationTimers.delete(child);
    }

    async function terminateOwnedContainer(containerName) {
        if (!options.ownedContainerNames.has(containerName)) return;
        await rawDocker(
            ["container", "stop", "--signal", "SIGTERM", "--timeout", "2", containerName],
            5_000,
        );
        await rawDocker(["container", "kill", "--signal", "SIGKILL", containerName], 3_000);
    }

    function rawDocker(args, timeoutMs) {
        return new Promise((resolveRaw) => {
            const child = spawn("docker", args, {
                cwd: options.cwd,
                stdio: "ignore",
            });
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                resolveRaw();
            };
            child.once("error", finish);
            child.once("close", finish);
            const timeout = setTimeout(() => {
                child.kill("SIGKILL");
                child.unref();
                finish();
            }, timeoutMs);
        });
    }
}

function commandFailure(command, code, stderr) {
    const containerPhase = safeContainerFailurePhase(stderr);
    const suffix = containerPhase ? ` during ${containerPhase}` : "";
    const error = new Error(`${basename(command)} exited with status ${code}${suffix}`);
    error.name = "CommandFailure";
    return error;
}

function interruptedCommand(command, signal) {
    const error = new Error(`${basename(command)} interrupted by ${signal}`);
    error.name = "CommandInterrupted";
    return error;
}

function timedOutCommand(command) {
    const error = new Error(`${basename(command)} exceeded its deadline`);
    error.name = "CommandTimeout";
    return error;
}

function safeContainerFailurePhase(stderr) {
    for (const line of stderr.trim().split(/\r?\n/u).reverse()) {
        try {
            const value = JSON.parse(line);
            if (
                value.error === "proof_container_action_failed" &&
                typeof value.phase === "string" &&
                /^[a-z0-9-]{1,80}$/u.test(value.phase)
            ) {
                return value.phase;
            }
        } catch {
            // Docker diagnostics are intentionally not copied into the proof receipt.
        }
    }
    return undefined;
}
