import { expectTypeOf, test } from "vitest";

import {
    createClockifyClient,
    ensureClient as rootEnsureClient,
    type ArchiveThenDeleteAdapter as RootArchiveThenDeleteAdapter,
} from "clockify-sdk-ts-115";
// @ts-expect-error: removed from the 1.0 root package; use ensureClient
import { findOrCreateClient as _rootFindOrCreateClient } from "clockify-sdk-ts-115";
// @ts-expect-error: removed from the 1.0 root package; use ArchiveThenDeleteAdapter<TCurrent>
import type { ArchiveThenDeleteResource as _RootArchiveThenDeleteResource } from "clockify-sdk-ts-115";
import {
    ensureClient,
    type ArchiveThenDeleteAdapter,
    type EnsureResult,
    type NamedRecord,
} from "clockify-sdk-ts-115/ensure";
// @ts-expect-error: removed in 1.0; use ensureClient
import { findOrCreateClient as _findOrCreateClient } from "clockify-sdk-ts-115/ensure";
// @ts-expect-error: removed in 1.0; use ArchiveThenDeleteAdapter<TCurrent>
import type { ArchiveThenDeleteResource as _ArchiveThenDeleteResource } from "clockify-sdk-ts-115/ensure";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;

interface CurrentClient {
    name?: string;
    marker: number;
}

type Adapter = ArchiveThenDeleteAdapter<CurrentClient>;
type RootAdapter = RootArchiveThenDeleteAdapter<CurrentClient>;
type _GetInputIsNotAny = AssertFalse<IsAny<Parameters<Adapter["getCurrent"]>[0]>>;
type _ArchiveInputIsNotAny = AssertFalse<IsAny<Parameters<Adapter["archive"]>[0]>>;
type _DeleteInputIsNotAny = AssertFalse<IsAny<Parameters<Adapter["delete"]>[0]>>;
type _RootGetInputIsNotAny = AssertFalse<IsAny<Parameters<RootAdapter["getCurrent"]>[0]>>;
type _RootArchiveInputIsNotAny = AssertFalse<IsAny<Parameters<RootAdapter["archive"]>[0]>>;
type _RootDeleteInputIsNotAny = AssertFalse<IsAny<Parameters<RootAdapter["delete"]>[0]>>;

test("the public package rejects the removed insecure-host option", () => {
    createClockifyClient({
        apiKey: "x",
        environment: "https://clockify-proxy.example.com/api/v1",
        allowNonClockifyHttpsHost: true,
    });
    createClockifyClient({
        apiKey: "x",
        // @ts-expect-error: removed in 1.0; use allowNonClockifyHttpsHost
        allowInsecureBaseUrl: true,
    });
});

test("ensureClient retains the find-or-create result contract", async () => {
    const result = ensureClient({
        name: "Acme",
        list: async () => [{ id: "client-1", name: "Acme" }],
        create: async (name) => ({ id: "client-new", name }),
    });

    expectTypeOf(result).toExtend<Promise<EnsureResult<NamedRecord>>>();
    expectTypeOf(rootEnsureClient).toEqualTypeOf(ensureClient);
    expectTypeOf<RootAdapter>().toEqualTypeOf<Adapter>();
});

test("archive-then-delete adapters carry typed current state into archive", () => {
    const adapter: Adapter = {
        getCurrent: async ({ workspaceId, id }) => ({
            name: `${workspaceId}:${id}`,
            marker: 1,
        }),
        archive: async ({ workspaceId, id, current }) => {
            expectTypeOf(workspaceId).toEqualTypeOf<string>();
            expectTypeOf(id).toEqualTypeOf<string>();
            expectTypeOf(current.name).toEqualTypeOf<string>();
            expectTypeOf(current.marker).toEqualTypeOf<number>();
        },
        delete: async ({ workspaceId, id }) => {
            expectTypeOf(workspaceId).toEqualTypeOf<string>();
            expectTypeOf(id).toEqualTypeOf<string>();
        },
    };

    expectTypeOf(adapter.getCurrent).returns.resolves.toEqualTypeOf<CurrentClient>();
});

test("archive-then-delete adapters reject mismatched current state and mutation results", () => {
    const adapter: Adapter = {
        // @ts-expect-error: marker must remain a number in TCurrent
        getCurrent: async () => ({ name: "Acme", marker: "wrong" }),
        // @ts-expect-error: archive completion is Promise<void>, not a result payload
        archive: async () => 1,
        delete: async () => {},
    };
    expectTypeOf(adapter).toEqualTypeOf<Adapter>();
});
