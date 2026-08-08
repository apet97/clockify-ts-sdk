import { createClockifyClient, isClockifyApiError } from "clockify-sdk-ts-115";
import { describe, expect, it } from "vitest";

describe("clockify-sdk-ts-115 on Cloudflare Workers (nodejs_compat)", () => {
  it("constructs a client and sends the expected request in workerd", async () => {
    let seen;
    const client = createClockifyClient({
      apiKey: "workers-compat",
      fetch: (input, init) => {
        seen = new Request(input, init);
        return Promise.resolve(Response.json({ id: "u1" }));
      },
    });

    const user = await client.users.getCurrentUser();
    expect(user.id).toBe("u1");
    expect(new URL(seen.url).href).toBe("https://api.clockify.me/api/v1/user");
    expect(seen.headers.get("x-api-key")).toBe("workers-compat");
    // X-Request-Id proves node:crypto randomUUID works under nodejs_compat.
    expect(seen.headers.get("x-request-id")).toBeTruthy();
    // User-Agent proves node:os platform/arch works under nodejs_compat.
    expect(seen.headers.get("user-agent")).toContain("clockify-sdk-ts-115");
  });

  it("surfaces upstream errors as ClockifyApiError", async () => {
    const client = createClockifyClient({
      apiKey: "workers-compat",
      fetch: () => Promise.resolve(Response.json({ message: "Unauthorized" }, { status: 401 })),
    });
    const error = await client.users
      .getCurrentUser()
      .then(() => undefined)
      .catch((e) => e);
    expect(isClockifyApiError(error)).toBe(true);
    expect(error.statusCode).toBe(401);
  });
});
