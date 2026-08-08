// Minimal Cloudflare Worker that constructs the SDK client. Exists to prove
// the published package shape imports, instantiates, and bundles for the
// Workers runtime under nodejs_compat.
import { createClockifyClient } from "clockify-sdk-ts-115";

export default {
  async fetch(_request, env) {
    const client = createClockifyClient({ apiKey: env.CLOCKIFY_API_KEY ?? "workers-compat" });
    const user = await client.users.getCurrentUser();
    return Response.json({ id: user.id });
  },
};
