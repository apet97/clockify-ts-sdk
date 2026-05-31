/**
 * Pass-through `Idempotency-Key` header
 * --------------------------------------
 *
 * Clockify's server does NOT currently honor the
 * `Idempotency-Key` header (verified live 2026-05-24, see
 * spec/evidence/discrepancies.md → idempotency.no-honor). This
 * example shows how to set the header anyway so the SDK is
 * future-ready and so observability stacks (CDNs, edge proxies,
 * client-side dedup) can use it.
 *
 * Pattern: pass `headers` in the generated client's per-call `RequestOptions`.
 *
 * If/when Clockify adds server-side idempotency support, the same
 * call sites continue to work without code changes — the header
 * suddenly becomes load-bearing.
 */
import { createClockifyClient } from "clockify-sdk-ts-115";
import { randomUUID } from "node:crypto";

async function main(): Promise<void> {
    const client = createClockifyClient();
    const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID!;

    const key = randomUUID();
    const tag = await client.tags.create(
        { workspaceId, name: `idempotency-example-${Date.now()}` },
        { headers: { "Idempotency-Key": key } },
    );

    console.log(`created tag ${tag.id} with Idempotency-Key ${key}`);
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
