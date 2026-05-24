import { describe, it, expect } from "vitest";
import { ClockifyApiClient } from "../src/index.js";

const apiKey = process.env.CLOCKIFY_API_KEY;
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
const liveSandboxAvailable = Boolean(apiKey && workspaceId);

const describeLive = liveSandboxAvailable ? describe : describe.skip;

if (!liveSandboxAvailable) {
  // eslint-disable-next-line no-console
  console.warn(
    "[sandbox.test] CLOCKIFY_API_KEY and/or CLOCKIFY_WORKSPACE_ID not set in env; live tests skipped."
  );
}

describeLive("clockify-sdk-ts live sandbox", () => {
  // X-Api-Key and X-Addon-Token are two distinct auth schemes; only one
  // should be on a given request. Fern's generated BaseClientOptions
  // types BOTH as required, so we silence the addonToken field with a
  // supplier that yields undefined (resulting header is dropped at merge
  // time). Tracked as a Fern type-shape limitation in
  // addons-me/fern/spec/evidence/discrepancies.md.
  const client = new ClockifyApiClient({
    apiKey: apiKey!,
    addonToken: (() => undefined) as unknown as () => string,
  });

  it("lists tags (page=1, page-size=5)", async () => {
    const tags = await client.tags.getWorkspacesWorkspaceIdTags({
      workspaceId: workspaceId!,
      page: 1,
      "page-size": 5,
    });
    expect(Array.isArray(tags)).toBe(true);
    expect(tags.length).toBeLessThanOrEqual(5);
  });

  it("creates, fetches by id, and deletes a tag (round-trip)", async () => {
    const slug = `sdk-test-${Date.now()}`;
    const created = await client.tags.postWorkspacesWorkspaceIdTags({
      workspaceId: workspaceId!,
      name: slug,
    });
    expect(created.name).toBe(slug);
    expect(typeof created.id).toBe("string");
    const tagId = created.id!;

    const fetched = await client.tags.getWorkspacesWorkspaceIdTagsTagId({
      workspaceId: workspaceId!,
      tagId,
    });
    expect(fetched.id).toBe(tagId);
    expect(fetched.name).toBe(slug);

    await client.tags.deleteWorkspacesWorkspaceIdTagsTagId({
      workspaceId: workspaceId!,
      tagId,
    });

    // Confirm 4xx after deletion (server returns 400 "tag doesn't belong to workspace" — code 501 — once deleted).
    await expect(
      client.tags.getWorkspacesWorkspaceIdTagsTagId({
        workspaceId: workspaceId!,
        tagId,
      })
    ).rejects.toBeInstanceOf(Error);
  });

  it("paginates projects across page=1 → page=2 (manual page loop)", async () => {
    const pageSize = 5;
    const page1 = await client.projects.getWorkspaceProjects({
      workspaceId: workspaceId!,
      page: 1,
      "page-size": pageSize,
    });
    expect(Array.isArray(page1)).toBe(true);
    expect(page1.length).toBeLessThanOrEqual(pageSize);

    if (page1.length === pageSize) {
      const page2 = await client.projects.getWorkspaceProjects({
        workspaceId: workspaceId!,
        page: 2,
        "page-size": pageSize,
      });
      expect(Array.isArray(page2)).toBe(true);

      if (page2.length > 0) {
        const page1Ids = new Set(page1.map((p) => p.id));
        const page2OverlapsPage1 = page2.some((p) => page1Ids.has(p.id));
        expect(page2OverlapsPage1).toBe(false);
      }
    }
  });

  it("rejects an invalid {tagId} path param with a structured error", async () => {
    await expect(
      client.tags.getWorkspacesWorkspaceIdTagsTagId({
        workspaceId: workspaceId!,
        tagId: "ffffffffffffffffffffffff",
      })
    ).rejects.toBeInstanceOf(Error);
  });
});
