import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchLiveAndCompare } from "./official-openapi-drift.mjs";

function okJsonResponse(body) {
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
}

function notOkResponse(status) {
    return { ok: false, status, text: async () => "" };
}

test("a network fetch failure (rejected fetch) propagates -- --fetch may not exit 0 on it", async () => {
    const fetcher = async () => {
        throw new Error("simulated DNS failure");
    };
    await assert.rejects(() => fetchLiveAndCompare({ fetchImpl: fetcher }), /simulated DNS failure/);
});

test("a non-2xx HTTP response propagates as a failure -- --fetch may not exit 0 on it", async () => {
    const fetcher = async () => notOkResponse(503);
    await assert.rejects(() => fetchLiveAndCompare({ fetchImpl: fetcher }), /HTTP 503/);
});

test("a successful fetch that finds no new official operations resolves without throwing", async () => {
    const fetcher = async () => okJsonResponse({ paths: {} });
    await assert.doesNotReject(() => fetchLiveAndCompare({ fetchImpl: fetcher }));
});

test("malformed JSON from a successful fetch does not silently succeed", async () => {
    const fetcher = async () => ({ ok: true, status: 200, text: async () => "{not valid json" });
    await assert.rejects(() => fetchLiveAndCompare({ fetchImpl: fetcher }));
});
