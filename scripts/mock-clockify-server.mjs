#!/usr/bin/env node
import http from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

export function createMockClockifyServer(options = {}) {
    const workspaceId = options.workspaceId ?? process.env.CLOCKIFY_MOCK_WORKSPACE_ID ?? "000000000000000000000001";
    const userId = options.userId ?? process.env.CLOCKIFY_MOCK_USER_ID ?? "000000000000000000000002";
    const state = options.state ?? {
        tags: [
            { id: "000000000000000000000101", name: "Deep Work", archived: false },
            { id: "000000000000000000000102", name: "Review", archived: false },
        ],
        clients: [{ id: "000000000000000000000201", name: "Acme", archived: false }],
        projects: [
            {
                id: "000000000000000000000301",
                name: "Website",
                archived: false,
                clientId: "000000000000000000000201",
            },
        ],
        entries: [],
        invoices: [
            {
                // Wire-shape fixture: tax/discount are ×100-scaled integers on the
                // GET (10% reads back as 1000), and note/subject ARE present on a
                // real invoice (the POST drops them; only a follow-up PUT sets them).
                id: "000000000000000000000401",
                number: "INV-1",
                clientId: "000000000000000000000201",
                currency: "USD",
                note: "Net 30 terms",
                subject: "Website redesign",
                discount: 500,
                tax: 1000,
                tax2: 0,
                amount: 120000,
                status: "UNSENT",
            },
        ],
        timeOffRequests: [
            {
                id: "000000000000000000000701",
                userId: userId,
                policyId: "000000000000000000000801",
                status: "APPROVED",
            },
        ],
        // Captures the most recent PUT /invoices/{id} body so tests can assert the
        // exact wire bytes (tax/discount name+scale, preserved fields).
        lastInvoicePut: null,
    };

    function json(res, status, body, headers = {}) {
        const payload = JSON.stringify(body);
        res.writeHead(status, {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
            "X-Request-Id": randomUUID(),
            ...headers,
        });
        res.end(payload);
    }

    function notFound(res) {
        json(res, 404, { code: "not_found", message: "Mock route not found" });
    }

    function readBody(req) {
        return new Promise((resolve, reject) => {
            let data = "";
            req.setEncoding("utf8");
            req.on("data", (chunk) => {
                data += chunk;
            });
            req.on("end", () => {
                if (!data) resolve({});
                else {
                    try {
                        resolve(JSON.parse(data));
                    } catch (error) {
                        reject(error);
                    }
                }
            });
            req.on("error", reject);
        });
    }

    function page(items, url) {
        const pageNumber = Number(url.searchParams.get("page") ?? "1");
        const pageSize = Number(url.searchParams.get("page-size") ?? url.searchParams.get("limit") ?? "50");
        const start = Math.max(0, (pageNumber - 1) * pageSize);
        return items.slice(start, start + pageSize);
    }

    function normalizedParts(url) {
        const raw = url.pathname.split("/").filter(Boolean);
        if (raw[0] === "api" && raw[1] === "v1") return raw.slice(2);
        return raw;
    }

    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
            const parts = normalizedParts(url);

            const headerStatus = Number(req.headers["x-mock-status"]);
            const pathStatus = parts[0] === "__error" ? Number(parts[1]) : NaN;
            const injected = Number.isFinite(pathStatus) ? pathStatus : headerStatus;
            if (Number.isFinite(injected) && injected >= 400) {
                if (injected === 429) {
                    json(
                        res,
                        429,
                        { code: "rate_limited", message: "Too Many Requests" },
                        {
                            "Retry-After": "30",
                            "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 30),
                        },
                    );
                    return;
                }
                const bodyByStatus = {
                    401: { code: "unauthorized", message: "Unauthorized" },
                    403: { code: "forbidden", message: "Forbidden" },
                    500: { code: "internal_error", message: "Internal Server Error" },
                    503: { code: "service_unavailable", message: "Service Unavailable" },
                };
                json(
                    res,
                    injected,
                    bodyByStatus[injected] ?? { code: "error", message: `HTTP ${injected}` },
                );
                return;
            }

            if (req.method === "GET" && parts.length === 1 && parts[0] === "user") {
                json(res, 200, { id: userId, email: "mock@example.com", name: "Mock User" });
                return;
            }

            if (req.method === "GET" && parts.length === 1 && parts[0] === "workspaces") {
                json(res, 200, [{ id: workspaceId, name: "Mock Workspace" }], { "Last-Page": "true" });
                return;
            }

            if (parts[0] === "workspaces" && parts[1] === workspaceId) {
                const rest = parts.slice(2);
                const resource = rest[0];
                const id = rest[1];

                if (req.method === "GET" && resource === "tags" && !id) {
                    json(res, 200, page(state.tags, url), { "Last-Page": "true" });
                    return;
                }
                if (req.method === "POST" && resource === "tags" && !id) {
                    const body = await readBody(req);
                    const tag = {
                        id: randomUUID().replaceAll("-", "").slice(0, 24),
                        name: body.name ?? body.body?.name ?? "Mock Tag",
                        archived: false,
                    };
                    state.tags.push(tag);
                    json(res, 201, tag);
                    return;
                }
                if (req.method === "DELETE" && resource === "tags" && id) {
                    state.tags = state.tags.filter((tag) => tag.id !== id);
                    json(res, 200, { id, deleted: true });
                    return;
                }
                if (req.method === "GET" && resource === "clients" && !id) {
                    json(res, 200, page(state.clients, url), { "Last-Page": "true" });
                    return;
                }
                if (req.method === "GET" && resource === "projects" && !id) {
                    json(res, 200, page(state.projects, url), { "Last-Page": "true" });
                    return;
                }
                if (req.method === "GET" && resource === "invoices" && !id) {
                    json(res, 200, { invoices: page(state.invoices, url), total: state.invoices.length }, { "Last-Page": "true" });
                    return;
                }
                if (req.method === "POST" && resource === "invoices" && !id) {
                    const body = await readBody(req);
                    // POST silently drops note/subject — both echo the workspace placeholder.
                    const invoice = {
                        id: randomUUID().replaceAll("-", "").slice(0, 24),
                        number: body.number ?? "INV-NEW",
                        clientId: body.clientId ?? null,
                        currency: body.currency ?? "USD",
                        note: "INPUT BILL INFO HERE",
                        subject: "INPUT BILL INFO HERE",
                        discount: 0,
                        tax: 0,
                        tax2: 0,
                    };
                    state.invoices.push(invoice);
                    json(res, 201, invoice);
                    return;
                }
                if (req.method === "GET" && resource === "invoices" && id) {
                    const invoice = state.invoices.find((inv) => inv.id === id);
                    if (!invoice) {
                        notFound(res);
                        return;
                    }
                    json(res, 200, invoice);
                    return;
                }
                if (req.method === "PUT" && resource === "invoices" && id) {
                    const body = await readBody(req);
                    // PUT replaces the document — capture the exact body sent.
                    state.lastInvoicePut = body;
                    const invoice = state.invoices.find((inv) => inv.id === id);
                    if (invoice) Object.assign(invoice, body);
                    json(res, 200, invoice ?? { id, ...body });
                    return;
                }
                if (req.method === "POST" && resource === "time-off" && rest[1] === "requests") {
                    json(res, 200, {
                        count: state.timeOffRequests.length,
                        requests: page(state.timeOffRequests, url),
                    });
                    return;
                }
                if (
                    req.method === "GET" &&
                    (resource === "time-entries" || resource === "user") &&
                    (rest.includes("in-progress") || rest.includes("time-entries") || url.searchParams.get("in-progress") === "true")
                ) {
                    json(res, 200, page(state.entries, url), { "Last-Page": "true" });
                    return;
                }
            }

            notFound(res);
        } catch (error) {
            json(res, 500, { code: "mock_error", message: error instanceof Error ? error.message : String(error) });
        }
    });

    return {
        server,
        state,
        workspaceId,
        userId,
        async listen(port = 0, host = "127.0.0.1") {
            await new Promise((resolve) => server.listen(port, host, resolve));
            const address = server.address();
            if (typeof address !== "object" || address == null) throw new Error("mock server address unavailable");
            return `http://${host}:${address.port}/api/v1`;
        },
        async close() {
            if (!server.listening) return;
            await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
        },
    };
}

async function main() {
    const port = Number(process.env.CLOCKIFY_MOCK_PORT ?? 45881);
    const mock = createMockClockifyServer();
    const baseUrl = await mock.listen(port);
    console.log(`Mock Clockify server listening on ${baseUrl}`);
    console.log(`Workspace: ${mock.workspaceId}`);
}

const invokedDirectly = process.argv[1] != null && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
