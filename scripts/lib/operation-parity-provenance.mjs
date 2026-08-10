// W5/W5-fix: shared, unit-testable core of generate-operation-parity.mjs's
// --check drift comparison for docs/operation-parity.json's sources.goMcp
// block.
//
// catalogPresent/carriedForward are run-environment provenance, not
// committed content. CI is sibling-less by design and its --check run will
// therefore always compute catalogPresent=false, while the committed file
// may have been regenerated locally with the sibling present
// (catalogPresent=true) -- comparing those two fields exactly would make
// every CI --check red regardless of the PR's actual content (the item's
// scopeStop: "loud-fail rejected, CI is sibling-less by design"). Strip only
// those two before the drift comparison.
//
// carriedFromVerifiedAt is deliberately NOT stripped. It is a genuine fixed
// point in both environments: sibling-less runs derive it via
// generate-operation-parity.mjs's readExistingGoMcpVerifiedAt(), which
// re-reads the same committed file being validated, so --check's expected
// value is always self-consistent with an untampered commit; sibling-present
// runs recompute it fresh from today's date, so a hand-edited (forged) value
// diverges from the freshly computed one and correctly reds. Stripping it
// would silently accept a hand-forged carriedFromVerifiedAt in the
// sibling-present path -- the one case where this file can actually detect
// tampering with the field that check-operation-coverage.mjs's 90-day
// freshness gate directly trusts.
export function withoutGoMcpProvenance(jsonText) {
    if (!jsonText) return jsonText;
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    } catch {
        return jsonText;
    }
    if (parsed?.sources?.goMcp && typeof parsed.sources.goMcp === "object") {
        parsed.sources.goMcp = {
            path: parsed.sources.goMcp.path,
            carriedFromVerifiedAt: parsed.sources.goMcp.carriedFromVerifiedAt,
        };
    }
    return `${JSON.stringify(parsed, null, 2)}\n`;
}
