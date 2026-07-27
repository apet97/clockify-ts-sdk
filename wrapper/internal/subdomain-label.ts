/**
 * Shared Clockify workspace-subdomain DNS label validation. Used by both
 * `routing.ts` (constructing a subdomain profile URL) and
 * `authenticated-boundary-fetch.ts` (trusting a `<label>.clockify.me` host
 * at the final dispatch boundary) -- pulled out to a standalone module so
 * neither of those two internal modules needs to import the other.
 *
 * This intentionally duplicates
 * `scripts/service-routing-matrix.mjs#validateSubdomainLabel`'s rules
 * rather than importing that module: the script pulls in tooling-only
 * dependencies (`yaml`) that must never enter the shipped wrapper package.
 */
const SUBDOMAIN_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isValidSubdomainLabel(label: string): boolean {
    if (typeof label !== "string" || label.trim().length === 0) return false;
    if (label !== label.toLowerCase()) return false;
    if (label.includes(".")) return false;
    if (label.startsWith("xn--")) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
    return SUBDOMAIN_LABEL_RE.test(label);
}
