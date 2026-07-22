import { describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { userRefHelpers } from "../src/tools/user-refs.js";

type ListCall = Record<string, unknown>;

function pagedRows<T>(rows: T[], calls: ListCall[]): (req: ListCall) => Promise<T[]> {
    return async (req) => {
        calls.push(req);
        const page = Number(req.page ?? 1);
        const pageSize = Number(req["page-size"] ?? 50);
        return rows.slice((page - 1) * pageSize, page * pageSize);
    };
}

function responseAware<T>(data: T[], headers: Record<string, string>): Promise<T[]> & {
    withRawResponse(): Promise<{ data: T[]; rawResponse: { headers: Headers } }>;
} {
    const promise = Promise.resolve(data) as Promise<T[]> & {
        withRawResponse(): Promise<{ data: T[]; rawResponse: { headers: Headers } }>;
    };
    promise.withRawResponse = async () => ({ data, rawResponse: { headers: new Headers(headers) } });
    return promise;
}

describe("userRefHelpers", () => {
    it("preserves an optional workspace-user email for exact identity resolution", async () => {
        const calls: ListCall[] = [];
        const ctx = {
            workspaceId: "ws-1",
            client: {
                users: {
                    list: pagedRows(
                        [{ id: "u-ada", name: "Ada Lovelace", email: "ada@example.com" }],
                        calls,
                    ),
                },
            },
        } as unknown as Context;

        const { listUsers } = userRefHelpers(ctx);

        await expect(listUsers()).resolves.toEqual([
            { id: "u-ada", name: "Ada Lovelace", email: "ada@example.com" },
        ]);
    });

    it("lists workspace users across pages without requesting roles", async () => {
        const calls: ListCall[] = [];
        const filler = Array.from({ length: 200 }, (_, index) => ({
            id: `u-${index}`,
            name: `User ${index}`,
        }));
        const ctx = {
            workspaceId: "ws-1",
            client: {
                users: {
                    list: pagedRows([...filler, { id: "u-target", name: "Ada Lovelace" }], calls),
                },
            },
        } as unknown as Context;

        const { listUsers } = userRefHelpers(ctx);
        await expect(listUsers()).resolves.toContainEqual({ id: "u-target", name: "Ada Lovelace" });
        expect(calls.map((call) => call.page)).toEqual([1, 2]);
        expect(calls.every((call) => call["include-roles"] === false)).toBe(true);
    });

    it("continues on Last-Page:false even when a page is short", async () => {
        const calls: ListCall[] = [];
        const ctx = {
            workspaceId: "ws-1",
            client: {
                users: {
                    list: (req: ListCall) => {
                        calls.push(req);
                        if (req.page === 1) {
                            return responseAware([{ id: "u-1", name: "Ada" }], { "Last-Page": "false" });
                        }
                        return responseAware([{ id: "u-2", name: "Grace" }], { "Last-Page": "true" });
                    },
                },
            },
        } as unknown as Context;

        const { listUsers } = userRefHelpers(ctx);
        await expect(listUsers()).resolves.toContainEqual({ id: "u-2", name: "Grace" });
        expect(calls.map((call) => call.page)).toEqual([1, 2]);
    });
});
