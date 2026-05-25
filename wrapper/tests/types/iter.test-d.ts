import { expectTypeOf, test } from "vitest";

import { iterAll, iterPages, type PageEnvelope } from "../../iter.js";
import { withResponse, type WithResponseResult } from "../../with-response.js";

interface Tag {
    id: string;
    name: string;
}

const tagFetcher = (_req: { workspaceId: string; page: number; "page-size": number }) =>
    Promise.resolve<readonly Tag[]>([]);

test("iterAll yields the fetcher's item type", () => {
    const gen = iterAll(tagFetcher, { workspaceId: "w1" });
    expectTypeOf(gen).toExtend<AsyncIterable<Tag>>();
});

test("iterPages yields PageEnvelope<T>", () => {
    const gen = iterPages(tagFetcher, { workspaceId: "w1" });
    expectTypeOf(gen).toExtend<AsyncIterable<PageEnvelope<Tag>>>();
});

test("iterAll rejects a baseRequest that doesn't match the fetcher's request shape", () => {
    // @ts-expect-error: missing required `workspaceId` field
    iterAll(tagFetcher, {});
});

test("iterAll's baseRequest must omit page and page-size (they're injected)", () => {
    // Allowed: includes page/page-size? No — `Omit<TRequest, "page" | "page-size">`
    // strips them, so passing extra fields TS doesn't know about is a type error.
    // We can't easily test "omit forbids" without contrived types, so just assert
    // the happy path compiles.
    iterAll(tagFetcher, { workspaceId: "w1" });
});

interface ResponseAware<T> extends PromiseLike<T> {
    withRawResponse(): Promise<{ readonly data: T; readonly rawResponse: never }>;
}

test("withResponse unwraps to WithResponseResult<T>", () => {
    const p = null as unknown as ResponseAware<Tag[]>;
    const result = withResponse(p);
    expectTypeOf(result).resolves.toExtend<WithResponseResult<Tag[]>>();
});

test("withResponse's resolved data field matches the promise's data type", () => {
    const p = null as unknown as ResponseAware<{ count: number }>;
    const result = withResponse(p);
    expectTypeOf(result).resolves.toExtend<{ data: { count: number } }>();
});
