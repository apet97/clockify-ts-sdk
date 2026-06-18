// Hand-written wrapper surface. Re-exports the generated request UNION
// types (`X = XFlattened | XBodyEnvelope`) so consumers bind a real
// request type and build the body-envelope arm instead of casting
// `Record<string, unknown> as never`. The envelope arm is runtime-correct:
// the generated core request builder returns `source.body`
// verbatim when a `body` key is present.
//
// Do NOT edit the generated SDK tree. These names are generated there and merely
// surfaced here. SDK-shape changes go through ../GOCLMCP/.
import type { ClockifyApi } from "./index.js";

/**
 * Re-export the generated request namespace so consumers can import a stable
 * type-only seam from `clockify-sdk-ts-115/requests`.
 */
export type { ClockifyApi };

/**
 * Extract the typed `body` object from a generated request union's body-envelope
 * arm. Useful when a command builds the body incrementally before assembling
 * `{ workspaceId, ..., body }`.
 */
export type ClockifyRequestBody<T extends object> = T extends { body: infer Body } ? Body : never;

/**
 * Last-resort typed escape for a body whose validated runtime keys the
 * generated type genuinely cannot express (report/audit passthrough). Unlike
 * `as never`, this asserts the value is a non-null object at the type level
 * and documents intent at the call site. Use only where a `KEEP` reason
 * applies; prefer the union-envelope binding everywhere else.
 */
export function wireBody<T extends object>(value: object): T {
    if (value === null || typeof value !== "object") {
        throw new TypeError("wireBody expects a non-null object");
    }
    return value as T;
}
