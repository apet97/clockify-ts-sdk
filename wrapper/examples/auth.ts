/**
 * `createClockifyClient` accepts exactly one of `apiKey` or
 * `addonToken` (compile + runtime enforced via discriminated
 * union). This example shows both modes plus the
 * supplier-function pattern for rotating credentials.
 *
 * Run: `npx tsx examples/auth.ts`
 */
import { createClockifyClient } from "clockify-sdk-ts-115";

// (1) Personal API key — server-side scripts, CI, scripts.
// `??` alone would not catch CLOCKIFY_API_KEY="" (an empty string is
// neither null nor undefined), and this repo's own local-proof convention
// runs with exactly that — treat a blank string the same as unset.
const envApiKey = process.env.CLOCKIFY_API_KEY;
const personal = createClockifyClient({
    apiKey: envApiKey && envApiKey.length > 0 ? envApiKey : "key-from-clockify-profile",
});

// (2) Marketplace addon token — code running inside a Clockify
// marketplace addon you authored.
const addon = createClockifyClient({
    addonToken: process.env.CLOCKIFY_ADDON_TOKEN ?? "token-from-install-jwt",
});

// (3) Rotating credential — use a supplier function so the SDK
// re-fetches the value on every request. Useful when the token
// comes from a secret manager that issues short-lived tokens.
const rotating = createClockifyClient({
    apiKey: () => loadFromSecretManager(),
});

function loadFromSecretManager(): string {
    const key = process.env.CLOCKIFY_API_KEY;
    return key && key.length > 0 ? key : "fresh-token-each-call";
}

// (4) Advanced: bypass the factory entirely for non-header auth
// (custom AuthProvider, `auth: false`, mocked transport).
import { ClockifyApiClient } from "clockify-sdk-ts-115";

const noAuth = new ClockifyApiClient({
    auth: false,
});

console.log("constructed all four client variants:", {
    personal: typeof personal.tags,
    addon: typeof addon.tags,
    rotating: typeof rotating.tags,
    noAuth: typeof noAuth.tags,
});
