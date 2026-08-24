#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer, request as nodeRequest } from "node:http";

import { toClockifyMcpNodeHandler } from "../dist/http.js";

const BODY_LIMIT = 1024 * 1024;

if (process.argv.includes("--server")) await serve();
else await prove();

async function serve() {
    let bytesRead = 0;
    let chunksRead = 0;
    const logs = [];
    const service = {
        async fetch(request) {
            const path = new URL(request.url).pathname;
            if (path === "/reset") {
                bytesRead = 0;
                chunksRead = 0;
                logs.length = 0;
                return Response.json({ ok: true });
            }
            if (path === "/metrics") return Response.json({ bytesRead, chunksRead, logs });
            const declared = Number(request.headers.get("content-length") ?? 0);
            return declared > BODY_LIMIT
                ? Response.json({ error: "request_too_large" }, { status: 413 })
                : Response.json({ ok: true });
        },
    };
    service.preflightIngress = (request, failure) => {
        if (failure === undefined) return undefined;
        const requestId = request.headers.get("x-request-id") ?? "generated-proof-id";
        const overloaded = failure === "overloaded";
        const tooLarge = failure === "request_too_large";
        const status = overloaded ? 503 : tooLarge ? 413 : 400;
        logs.push({
            event: "http_request",
            requestId,
            method: request.method,
            route: "mcp",
            status,
            auth: "not_applicable",
            failure,
        });
        return Response.json(
            {
                error: overloaded
                    ? "service_overloaded"
                    : tooLarge
                      ? "request_too_large"
                      : "invalid_request",
            },
            {
                status,
                headers: {
                    "cache-control": "no-store",
                    ...(overloaded ? { "retry-after": "1" } : {}),
                    "x-request-id": requestId,
                },
            },
        );
    };
    const handler = toClockifyMcpNodeHandler(service, undefined, BODY_LIMIT, 1);
    const server = createServer((incoming, outgoing) => {
        const method = incoming.method;
        if (!method) {
            outgoing.writeHead(400).end();
            return;
        }
        const bounded = {
            method,
            ...(incoming.url === undefined ? {} : { url: incoming.url }),
            headers: incoming.headers,
            pause: () => incoming.pause(),
            destroy: () => incoming.destroy(),
            async *[Symbol.asyncIterator]() {
                for await (const chunk of incoming) {
                    chunksRead += 1;
                    bytesRead += chunk.byteLength;
                    yield chunk;
                }
            },
        };
        void handler(bounded, outgoing).catch(() => incoming.destroy());
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("fixture did not bind TCP");
    process.stdout.write(`${JSON.stringify({ port: address.port })}\n`);
    const close = () => {
        server.close(() => {
            process.exitCode = 0;
        });
        server.closeAllConnections();
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
}

async function prove() {
    const child = spawn(process.execPath, [new URL(import.meta.url).pathname, "--server"], {
        stdio: ["ignore", "pipe", "pipe"],
    });
    let interruptedSignal;
    let stopPromise;
    const stopFixture = () => (stopPromise ??= terminateChild(child));
    const signalHandlers = new Map();
    for (const signal of ["SIGINT", "SIGTERM"]) {
        const handler = () => {
            interruptedSignal ??= signal;
            void stopFixture().catch(() => {});
        };
        signalHandlers.set(signal, handler);
        process.once(signal, handler);
    }
    const stderr = [];
    child.stderr.on("data", (chunk) => {
        if (Buffer.concat(stderr).byteLength < 16 * 1024) stderr.push(chunk);
    });
    try {
        const { port } = JSON.parse(await firstLine(child.stdout));
        await abortPartialRequest(port);
        await delay(100);
        assert(child.exitCode === null, "partial abort crashed the Node service");
        assert((await fetch(`http://127.0.0.1:${port}/healthz`)).status === 200, "service died after abort");
        const abortMetrics = await (await fetch(`http://127.0.0.1:${port}/metrics`)).json();
        assert(
            abortMetrics.logs.length === 1 &&
                abortMetrics.logs[0].failure === "invalid_request" &&
                abortMetrics.logs[0].requestId === "abort-proof",
            "aborted body read was not logged through the request boundary",
        );
        await fetch(`http://127.0.0.1:${port}/reset`);

        const held = await openHeldRequest(port);
        const overloaded = await fetch(`http://127.0.0.1:${port}/mcp`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-request-id": "overload-proof",
            },
            body: "{}",
        });
        assert(overloaded.status === 503, "slow ingress did not consume admission");
        assert(overloaded.headers.get("retry-after") === "1", "overload is not retryable");
        assert(overloaded.headers.get("x-request-id") === "overload-proof", "overload is not correlated");
        const overloadMetrics = await (await fetch(`http://127.0.0.1:${port}/metrics`)).json();
        assert(
            overloadMetrics.logs.length === 1 &&
                overloadMetrics.logs[0].failure === "overloaded" &&
                overloadMetrics.logs[0].requestId === "overload-proof",
            "overload was not logged through the request boundary",
        );
        held.close();
        await held.closed;

        const oversized = await sendOversizedRequest(port);
        assert(oversized.status === 413, "chunked request did not receive 413");
        assert(oversized.closed, "oversized request socket was not terminated");
        const metrics = await (await fetch(`http://127.0.0.1:${port}/metrics`)).json();
        assert(metrics.bytesRead > BODY_LIMIT, "fixture did not cross the body limit");
        assert(metrics.bytesRead < 1_800_000, "post-limit request bytes were consumed");
        assert((await fetch(`http://127.0.0.1:${port}/healthz`)).status === 200, "service died after 413");
    } finally {
        for (const [signal, handler] of signalHandlers) {
            process.off(signal, handler);
        }
        const exit = await stopFixture();
        if (exit.code !== 0) {
            const detail = Buffer.concat(stderr).toString("utf8").replace(/[\r\n]+/gu, " ").slice(0, 200);
            throw new Error(
                `ingress fixture exited ${exit.code ?? exit.signal ?? "unknown"}${detail ? `: ${detail}` : ""}`,
            );
        }
    }
    if (interruptedSignal) throw new Error(`ingress proof interrupted by ${interruptedSignal}`);
    process.stdout.write(`${JSON.stringify({ ok: true, ingress: "bounded-admitted-and-abort-safe" })}\n`);
}

async function openHeldRequest(port) {
    const request = nodeRequest({
        host: "127.0.0.1",
        port,
        path: "/mcp",
        method: "POST",
        headers: { "content-type": "application/json", "transfer-encoding": "chunked" },
    });
    const closed = new Promise((resolve) => {
        request.once("error", resolve);
        request.once("close", resolve);
    });
    await new Promise((resolve) => {
        request.once("socket", (socket) => {
            socket.once("connect", () => {
                request.write("partial-body");
                resolve();
            });
        });
    });
    await delay(50);
    return { close: () => request.destroy(), closed };
}

async function abortPartialRequest(port) {
    await new Promise((resolve, reject) => {
        const request = nodeRequest({
            host: "127.0.0.1",
            port,
            path: "/mcp",
            method: "POST",
            headers: {
                "content-type": "application/json",
                "transfer-encoding": "chunked",
                "x-request-id": "abort-proof",
            },
        });
        request.once("error", (error) => {
            if (error.code === "ECONNRESET") resolve();
            else reject(error);
        });
        request.once("socket", (socket) => {
            socket.once("connect", () => {
                request.write("partial-body");
                setTimeout(() => {
                    request.destroy();
                    resolve();
                }, 20);
            });
        });
    });
}

async function sendOversizedRequest(port) {
    return await new Promise((resolve, reject) => {
        const request = nodeRequest({
            host: "127.0.0.1",
            port,
            path: "/mcp",
            method: "POST",
            headers: { "content-type": "application/json", "transfer-encoding": "chunked" },
        });
        request.once("error", reject);
        request.once("response", (response) => {
            let ended = false;
            let closed = false;
            const timeout = setTimeout(
                () => reject(new Error("oversized request socket did not close")),
                5_000,
            );
            const finish = () => {
                if (ended && closed) {
                    clearTimeout(timeout);
                    resolve({ status: response.statusCode, closed });
                }
            };
            response.resume();
            response.once("end", () => {
                ended = true;
                finish();
            });
            response.socket.once("close", () => {
                closed = true;
                finish();
            });
        });
        request.write(Buffer.alloc(600_000));
        request.write(Buffer.alloc(600_000));
        request.write(Buffer.alloc(600_000));
        request.end();
    });
}

async function firstLine(stream) {
    let value = "";
    for await (const chunk of stream) {
        value += chunk.toString("utf8");
        const newline = value.indexOf("\n");
        if (newline >= 0) return value.slice(0, newline);
    }
    throw new Error("ingress fixture exited before listening");
}

async function terminateChild(child) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    let exit = await childExitWithin(child, 2_000);
    if (exit === undefined) {
        child.kill("SIGKILL");
        exit = await childExitWithin(child, 2_000);
    }
    if (exit === undefined) throw new Error("ingress fixture did not terminate");
    return exit;
}

async function childExitWithin(child, timeoutMs) {
    if (child.exitCode !== null || child.signalCode !== null) {
        return { code: child.exitCode, signal: child.signalCode };
    }
    return await new Promise((resolve) => {
        const timer = setTimeout(() => {
            child.off("close", onClose);
            resolve(undefined);
        }, timeoutMs);
        const onClose = (code, signal) => {
            clearTimeout(timer);
            resolve({ code, signal });
        };
        child.once("close", onClose);
    });
}

async function delay(milliseconds) {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}
