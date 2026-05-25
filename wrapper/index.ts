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
// Re-export per-status error classes flat so consumers can do
// `import { NotFoundError } from "clockify-sdk-ts"` instead of
// `ClockifyApi.NotFoundError`. The namespace import still works.
export {
    BadRequestError,
    ForbiddenError,
    MethodNotAllowedError,
    NotFoundError,
    UnauthorizedError,
} from "./src/api/errors/index.js";
export {
    ClockifyAbortError,
    ClockifyConnectionError,
    ConflictError,
    getErrorCode,
    InternalServerError,
    isAbortError,
    isClockifyApiError,
    isConflictError,
    isConnectionError,
    isInternalServerError,
    isRateLimitError,
    isServiceUnavailableError,
    promoteApiError,
    RateLimitError,
    ServiceUnavailableError,
} from "./errors.js";
export { warnOnce } from "./deprecation.js";
export {
    createClockifyClient,
    type ClockifyClient,
    type ClockifyClientEnhancements,
    type CreateClockifyClientOptions,
} from "./create-client.js";
export { Workspace, wrapResource } from "./scoped-client.js";
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
    paginatedList,
    PaginatedList,
    type PaginatedListToArrayOptions,
} from "./paginated-list.js";
export {
    withResponse,
    type ResponseAwarePromise,
    type WithResponseResult,
} from "./with-response.js";
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
// Typed webhook event union. Individual variant types (e.g. WebhookEventNewProject)
// are available via the subpath: import type { ... } from "clockify-sdk-ts/webhook-events"
export {
    CLOCKIFY_WEBHOOK_EVENT_NAMES,
    type ClockifyWebhookEvent,
    type WebhookEventName,
} from "./webhook-events.js";
export { otelHooks, type OtelHooksOptions, type OtelLikeSpan } from "./otel-hooks.js";
