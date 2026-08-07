import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchLiveAndCompare } from "./official-openapi-drift.mjs";
import { computeDiff, indexOperations } from "./official-openapi-report.mjs";

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
    // Constrain the reason like the three siblings above: the body reaches
    // `parseSpec` -> `JSON.parse` outside the fetch try/catch, so `SyntaxError`
    // is the exact failure. A bare `rejects` would also pass if the module
    // threw before ever parsing.
    await assert.rejects(() => fetchLiveAndCompare({ fetchImpl: fetcher }), SyntaxError);
});

// A parameter the official surface declares and the custom spec does not is the
// class of regression that stayed green through every gate until 2026-08-07.
test("a query parameter dropped from a shared operation is reported", () => {
    const withParams = (params) => ({
        paths: {
            "/v1/workspaces/{workspaceId}/tags": {
                get: { parameters: [{ name: "workspaceId", in: "path" }, ...params] },
            },
        },
    });
    const diff = computeDiff({
        official: indexOperations(withParams([{ name: "excluded-ids", in: "query" }])),
        corrected: indexOperations(withParams([])),
        officialSchemes: {},
        correctedSchemes: {},
        phantomEndpoints: [],
    });
    assert.deepEqual(
        diff.droppedParameters.map((e) => [e.key, e.dropped]),
        [["GET /workspaces/{}/tags", ["excluded-ids"]]],
    );
});

test("a path parameter is never reported as dropped -- the generator backfills it", () => {
    const diff = computeDiff({
        official: indexOperations({
            paths: { "/v1/workspaces/{workspaceId}/tags/{id}": { get: { parameters: [{ name: "id", in: "path" }] } } },
        }),
        corrected: indexOperations({ paths: { "/workspaces/{workspaceId}/tags/{tagId}": { get: {} } } }),
        officialSchemes: {},
        correctedSchemes: {},
        phantomEndpoints: [],
    });
    assert.deepEqual(diff.droppedParameters, []);
});

test("a $ref'd parameter resolves to the name it declares, not its component key", () => {
    const doc = {
        paths: { "/v1/workspaces/{workspaceId}/tags": { get: { parameters: [{ $ref: "#/components/parameters/ExcludedIds" }] } } },
        components: { parameters: { ExcludedIds: { name: "excluded-ids", in: "query" } } },
    };
    assert.deepEqual(indexOperations(doc).get("GET /workspaces/{}/tags").queryParameters, ["excluded-ids"]);
});
