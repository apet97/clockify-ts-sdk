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
export { createClockifyClient, type CreateClockifyClientOptions } from "./create-client.js";
export { paginate, type PaginateOptions } from "./pagination.js";
