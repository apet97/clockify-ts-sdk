/**
 * Recommended factory for `ClockifyApiClient`.
 *
 * Clockify exposes two mutually-exclusive auth schemes (`X-Api-Key`
 * and `X-Addon-Token`). The Fern-generated `BaseClientOptions`
 * types both fields as required even though the OpenAPI security
 * block is an OR — sending both headers makes Clockify respond
 * `HTTP 401 "Multiple or none auth tokens present"`. Tracked as
 * `fern.sdk.auth.addonToken-typed-required-but-mutually-exclusive`
 * in `spec/evidence/discrepancies.md`.
 *
 * This factory accepts exactly one of `apiKey` or `addonToken`
 * (enforced at both compile time and runtime) and silently nulls the
 * other field via the documented supplier-returns-undefined pattern
 * so only the chosen header ships.
 */
import type { BaseClientOptions } from "./src/BaseClient.js";
import { ClockifyApiClient } from "./src/index.js";

type WithoutAuth = Omit<BaseClientOptions, "apiKey" | "addonToken">;

/**
 * Options for {@link createClockifyClient}. Discriminated union: pass
 * `apiKey` XOR `addonToken`, never both. Other `BaseClientOptions`
 * fields (`environment`, `baseUrl`, `headers`, `timeoutInSeconds`,
 * `maxRetries`, `fetch`, `logging`, `auth`) flow through unchanged.
 */
export type CreateClockifyClientOptions =
    | (WithoutAuth & {
          /** Personal-token auth header (`X-Api-Key`). */
          apiKey: BaseClientOptions["apiKey"];
          addonToken?: never;
      })
    | (WithoutAuth & {
          /** Marketplace-addon auth header (`X-Addon-Token`). */
          addonToken: BaseClientOptions["addonToken"];
          apiKey?: never;
      });

const NULL_SUPPLIER = (() => undefined) as unknown as () => string;

/**
 * Construct a `ClockifyApiClient` with the documented single-scheme
 * auth model.
 *
 * @example
 * ```ts
 * import { createClockifyClient } from "clockify-sdk-ts/create-client";
 *
 * const client = createClockifyClient({
 *   apiKey: process.env.CLOCKIFY_API_KEY!,
 * });
 *
 * const tags = await client.tags.getWorkspacesWorkspaceIdTags({
 *   workspaceId: process.env.CLOCKIFY_WORKSPACE_ID!,
 * });
 * ```
 *
 * @throws TypeError if neither `apiKey` nor `addonToken` is provided,
 *   or if both are provided. Both conditions are also rejected at
 *   the TS type level via the discriminated-union options shape.
 */
export function createClockifyClient(options: CreateClockifyClientOptions): ClockifyApiClient {
    const hasApiKey = "apiKey" in options && options.apiKey != null;
    const hasAddonToken = "addonToken" in options && options.addonToken != null;

    if (hasApiKey && hasAddonToken) {
        throw new TypeError(
            "createClockifyClient: pass only one of `apiKey` or `addonToken`, not both.",
        );
    }
    if (!hasApiKey && !hasAddonToken) {
        throw new TypeError(
            "createClockifyClient: must provide exactly one of `apiKey` or `addonToken`.",
        );
    }

    if (hasApiKey) {
        const { apiKey, ...rest } = options as WithoutAuth & {
            apiKey: BaseClientOptions["apiKey"];
        };
        return new ClockifyApiClient({ ...rest, apiKey, addonToken: NULL_SUPPLIER });
    }

    const { addonToken, ...rest } = options as WithoutAuth & {
        addonToken: BaseClientOptions["addonToken"];
    };
    return new ClockifyApiClient({ ...rest, addonToken, apiKey: NULL_SUPPLIER });
}
