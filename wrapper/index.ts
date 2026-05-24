/**
 * Package root entry for `clockify-sdk-ts`. Re-exports the Fern-
 * generated SDK surface (from `./src/index.js`) plus the
 * hand-written ergonomic helpers that live alongside it.
 *
 * Per-subpath entries are still exported individually for tree-shake
 * and intent-revealing imports (`clockify-sdk-ts/create-client`,
 * `clockify-sdk-ts/pagination`). This file just gives a single import
 * site for the common case.
 */
export * from "./src/index.js";
export {
    createClockifyClient,
    type ClockifyClientEnhancements,
    type CreateClockifyClientOptions,
} from "./create-client.js";
export {
    composedFetch,
    defaultUserAgent,
    generateRequestId,
    getRequestIdFromError,
    REQUEST_ID_HEADER,
    USER_AGENT_HEADER,
    type ComposedFetchHooks,
    type ComposedFetchOptions,
    type ErrorContext,
    type RequestContext,
    type ResponseContext,
    type RetryContext,
    type RetryPolicy,
} from "./composed-fetch.js";
export {
    iterAll,
    iterPages,
    KNOWN_PAGINATED_METHODS,
    type IterOptions,
    type KnownPaginatedMethod,
    type PageEnvelope,
    type PaginatedRequest,
} from "./iter.js";
export { paginate, type PaginateOptions } from "./pagination.js";
export {
    CLOCKIFY_SIGNATURE_HEADER,
    constructEvent,
    getClockifySignatureToken,
    verifyClockifyWebhook,
    WebhookSignatureMismatchError,
    type ConstructEventInput,
    type VerifyClockifyWebhookInput,
    type WebhookHeadersInput,
} from "./webhooks.js";
