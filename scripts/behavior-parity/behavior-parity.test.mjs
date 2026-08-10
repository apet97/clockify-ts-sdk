// scripts/behavior-parity: does the SDK client, the CLI's --json output, and
// the MCP server agree on the outcome of the same Clockify operation, run
// against the same mock backend?
//
// Run with: node --import tsx --test scripts/behavior-parity/behavior-parity.test.mjs
//
// Scoped to SUCCESS-parity for two representative operations (one read, one
// write) -- see drivers.mjs's header comment for why the fault half is a
// separate, filed follow-up rather than folded in here. This harness proves
// the MECHANISM (three surfaces, one mock, one comparable outcome shape);
// P5 (campaign Phase D) owns sampling policy and coverage expansion over
// W2-licensed operations. It does not claim per-operation coverage.
import assert from "node:assert/strict";
import { test } from "node:test";

import { driveCli, driveMcp, driveMcpGuarded, driveSdk, withMock } from "./drivers.mjs";

test("tags.list: SDK, CLI, and MCP agree on the seeded tag set (read)", async () => {
    await withMock(async (ctx) => {
        const sdk = await driveSdk(ctx, (client, workspaceId) =>
            client.tags.list({ workspaceId, page: 1, "page-size": 200 }),
        );
        const cli = await driveCli(ctx, ["tags", "list", "--limit", "200"]);
        const mcp = await driveMcp(ctx, "clockify_tags_list", { pageSize: 200 });

        assert.equal(sdk.outcomeClass, "ok");
        assert.equal(cli.outcomeClass, "ok");
        assert.equal(mcp.outcomeClass, "ok");

        const sdkNames = new Set(sdk.data.map((tag) => tag.name));
        const cliNames = new Set(cli.data.map((row) => row.name));
        const mcpNames = new Set(mcp.data.data.map((tag) => tag.name));

        assert.ok(sdkNames.size > 0, "the mock must seed at least one tag");
        assert.deepEqual(cliNames, sdkNames, "CLI tag names must match the SDK's");
        assert.deepEqual(mcpNames, sdkNames, "MCP tag names must match the SDK's");
    });
});

test("tags.create: SDK, CLI, and MCP each produce a matching-shape write receipt (write)", async () => {
    await withMock(async (ctx) => {
        const sdk = await driveSdk(ctx, (client, workspaceId) =>
            client.tags.create({ workspaceId, body: { name: "behavior-parity-sdk" } }),
        );
        const cli = await driveCli(ctx, ["tags", "create", "behavior-parity-cli"]);
        const mcp = await driveMcp(ctx, "clockify_tags_create", { name: "behavior-parity-mcp" });

        assert.equal(sdk.outcomeClass, "ok");
        assert.equal(cli.outcomeClass, "ok");
        assert.equal(mcp.outcomeClass, "ok");

        // Each surface creates a DIFFERENT tag (three separate calls against
        // the same mock), so the comparison is structural -- a real,
        // non-empty id and the exact name that surface sent -- not a shared
        // literal id across surfaces.
        assert.equal(sdk.data.name, "behavior-parity-sdk");
        assert.ok(typeof sdk.data.id === "string" && sdk.data.id.length > 0);

        assert.equal(cli.data.name, "behavior-parity-cli");
        assert.ok(typeof cli.data.id === "string" && cli.data.id.length > 0);

        const mcpCreated = mcp.data.changed?.created?.[0];
        assert.equal(mcpCreated?.name, "behavior-parity-mcp");
        assert.ok(typeof mcpCreated?.id === "string" && mcpCreated.id.length > 0);
    });
});

test("tags.delete: SDK, CLI, and MCP agree on a nonexistent-id not_found fault", async () => {
    await withMock(async (ctx) => {
        const bogusId = "000000000000000000000999";

        const sdk = await driveSdk(ctx, (client, workspaceId) =>
            client.tags.delete({ workspaceId, tagId: bogusId }),
        );
        const cli = await driveCli(ctx, ["tags", "delete", bogusId]);
        const mcp = await driveMcpGuarded(ctx, "clockify_tags_delete", { tagId: bogusId });

        assert.equal(sdk.outcomeClass, "error");
        assert.equal(sdk.errorCode, "not_found");

        assert.equal(cli.outcomeClass, "error");
        assert.equal(cli.errorCode, "not_found");

        assert.equal(mcp.outcomeClass, "error");
        assert.equal(mcp.errorCode, "not_found");
    });
});
