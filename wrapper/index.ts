/**
 * Package root entry for `clockify-sdk-ts-115`. Re-exports the locally
 * generated SDK surface (from `./src/index.js`) plus the
 * hand-written ergonomic helpers that live alongside it.
 *
 * Per-subpath entries are still exported individually for tree-shake
 * and intent-revealing imports (`clockify-sdk-ts-115/create-client`,
 * `clockify-sdk-ts-115/pagination`). This file just gives a single import
 * site for the common case.
 */
export * from "./src/index.js";
// Re-export per-status error classes flat so consumers can do
// `import { NotFoundError } from "clockify-sdk-ts-115"` instead of
// `ClockifyApi.NotFoundError`. The namespace import still works.
export {
    BadRequestError,
    ForbiddenError,
    MethodNotAllowedError,
    NotFoundError,
    UnauthorizedError,
} from "./src/api/errors/index.js";
export {
    AddonTokenRestrictionError,
    ClockifyAbortError,
    ClockifyConnectionError,
    CLOCKIFY_ERROR_CODES,
    classifyClockifyError,
    ConflictError,
    errorCodeEntry,
    errorCodeForMessage,
    errorCodeForStatus,
    getErrorCode,
    getStableErrorCode,
    InternalServerError,
    isAbortError,
    isClockifyApiError,
    isConflictError,
    isConnectionError,
    isInternalServerError,
    isRateLimitError,
    isServiceUnavailableError,
    mapAddonTokenRestriction,
    promoteApiError,
    RateLimitError,
    recoveryForCode,
    retryableForCode,
    ServiceUnavailableError,
    type ClockifyErrorClassification,
    type ClockifyErrorCode,
    type ClockifyErrorCodeEntry,
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
// are available via the subpath: import type { ... } from "clockify-sdk-ts-115/webhook-events"
export {
    CLOCKIFY_WEBHOOK_EVENT_NAMES,
    type ClockifyWebhookEvent,
    type WebhookEventName,
} from "./webhook-events.js";
export { otelHooks, type OtelHooksOptions, type OtelLikeSpan } from "./otel-hooks.js";
export { clockifyHealth, type HealthCheckResult } from "./health.js";
export {
    clockifyDiagnostics,
    type ClockifyDiagnosticCheck,
    type ClockifyDiagnosticsInput,
    type ClockifyDiagnosticsReadiness,
    type ClockifyDiagnosticsResult,
    type ClockifyDiagnosticsSource,
    type ClockifyDiagnosticsStatus,
} from "./diagnostics.js";
export { getRateLimit, getRateLimitFromError, type RateLimitSnapshot } from "./rate-limit.js";
export {
    requestOptions,
    withHeaders,
    withIdempotencyKey,
    withRequestTimeout,
    type ClockifyHeaderValue,
    type ClockifyRequestHeaders,
    type ClockifyRequestOptions,
} from "./request-options.js";
export {
    toOperationErrorReceipt,
    toOperationReceipt,
    type ClockifyOperationErrorReceipt,
    type ClockifyOperationReceipt,
    type ClockifyOperationResult,
    type OperationReceiptOptions,
} from "./operation-receipt.js";
// Amount-unit conversion (major↔minor) — Clockify money fields want integer
// minor units, but expenses are MAJOR on the wire and invoice item unitPrice
// is minor×100. Funnel every amount through these so the mapping lives once.
export {
    CLOCKIFY_AMOUNT_UNITS,
    INVOICE_ITEM_UNIT_PRICE_WIRE_SCALE,
    invoiceItemUnitPriceFromWire,
    invoiceItemUnitPriceToWire,
    toMajor,
    toMinor,
    type AmountUnit,
} from "./money.js";
// Safe `PUT /invoices/{id}` body builder — guards the GET-then-PUT replace
// semantics and the tax/discount name+scale asymmetry that otherwise silently
// zero invoice tax/discount.
export {
    INVOICE_EDITABLE_FIELDS,
    INVOICE_PERCENT_FIELD_MAP,
    invoiceUpdateBodyFromExisting,
} from "./invoice-body.js";
// Server-side date/period resolution — turn "yesterday" / "next Monday" / a
// period keyword into the UTC instant the API wants, so a model or remote clock
// never computes calendar dates.
export {
    REPORT_PERIODS,
    resolveInstant,
    resolvePeriod,
    resolveRelativeDay,
    type ReportPeriod,
} from "./dates.js";
// Name → id resolution — turn a CLI flag / agent argument that is a name into a
// real id (case-insensitive, grounded "did you mean?" on a miss) before the call.
export {
    looksLikeClockifyId,
    matchByName,
    resolveEntityRef,
    resolveGroupRefs,
    resolveProjectTaskRefs,
    resolveTagRefs,
    resolveUserFilter,
    resolveUserRef,
    resolveUserRefs,
    suggestOptions,
    type ArchivedFilter,
    type ClarifyOption,
    type ClarifyResult,
    type NameMatch,
    type ResolveEntityResult,
} from "./resolve.js";

// Safe create-or-reuse helpers for duplicate-name-prone entities (tags, projects,
// clients) plus archive-then-delete for projects (active delete 400s on the wire).
export {
    archiveThenDeleteProject,
    ensureProject,
    ensureTag,
    findOrCreateClient,
    type ArchiveThenDeleteResult,
    type EnsureResult,
    type FindOrCreateOptions,
    type NamedRecord,
} from "./ensure.js";
