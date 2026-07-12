#!/usr/bin/env node
import { errorCode, runLiveProof } from "./live/orchestrator.mjs";

const controller = new AbortController();
let interrupted;
const handlers = new Map();
for (const signal of ["SIGINT", "SIGTERM"]) {
    const handler = () => {
        interrupted ??= signal;
        controller.abort();
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
}

let receipt;
try {
    receipt = await runLiveProof({ signal: controller.signal });
} catch (error) {
    receipt = {
        schemaVersion: 1,
        ok: false,
        error: { code: errorCode(error) },
        leftovers: null,
    };
} finally {
    for (const [signal, handler] of handlers) process.off(signal, handler);
}

if (interrupted !== undefined) {
    receipt = { ...receipt, ok: false, interrupted };
}

process.stdout.write(`${JSON.stringify(receipt)}\n`);
process.exitCode = interrupted === "SIGINT" ? 130 : interrupted === "SIGTERM" ? 143 : receipt.ok ? 0 : 1;
