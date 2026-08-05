import assert from "node:assert/strict";
import test from "node:test";

import { reconcilePaginationCoverage } from "./check-pagination-coverage.mjs";

test("every KNOWN_PAGINATED_METHODS entry is backed by a real spec pagination signal", () => {
    const { unbacked } = reconcilePaginationCoverage();
    assert.deepEqual(unbacked, [], `stale documentary entries: ${unbacked.join(", ")}`);
});

test("reconciliation is non-trivial: some methods are known, some spec-paginated ops are uncatalogued", () => {
    // Negative-test guard for the check itself: if these ever both come back
    // empty, the reconciliation logic broke (e.g. a bad regex silently
    // matching nothing) rather than the sets becoming legitimately empty.
    const { known, specPaginated, uncatalogued } = reconcilePaginationCoverage();
    assert.ok(known.size > 0, "expected at least one KNOWN_PAGINATED_METHODS entry");
    assert.ok(specPaginated.size > 0, "expected at least one spec-paginated operation");
    assert.ok(uncatalogued.length > 0, "expected at least one envelope-shaped operation outside the registry");
});

test("audit-log search is detected via its POST body's page/page-size fields, not query params", () => {
    // Regression for the body-vs-query-parameter gap: without scanning the
    // request body, this operation looks unpaginated and the first test
    // above wrongly fails on a real KNOWN_PAGINATED_METHODS entry.
    const { specPaginated } = reconcilePaginationCoverage();
    assert.ok(specPaginated.has("auditLogReport.search"));
});
