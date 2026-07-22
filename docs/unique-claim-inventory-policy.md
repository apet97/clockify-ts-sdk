# Unique-claim inventory policy

## Canonical claim universe

The bounded canonical claim universe contains exactly 50 current claims:

- 27 roadmap task claims projected from the active table in
  `docs/roadmap-1.0.md`, with every current `task*` status overlay in
  `docs/roadmap-1.0-status.json` enumerated explicitly;
- 13 current risk claims projected from every row of
  `docs/risk-register.json`;
- 6 user-facing workflow availability claims projected from every workflow in
  `docs/product-surface.json`; and
- 4 explicitly selected readiness/release posture claims from
  `docs/release-readiness-checklist.md`: static-preflight authority, current
  final-readiness blocker count, full/live proof boundary, and publish/tag
  authorization.

The JSON policy enumerates every canonical source key. The checker derives the
roadmap, risk, and workflow keys independently from their current sources and
requires exact set equality with both the policy and inventory. An omitted or
extra task, risk, workflow, status overlay, or selected readiness key therefore
fails closed. This is deliberately not a free-form prose crawler.

Archived plans and historical receipts are excluded as canonical sources.
Roadmap receipts may appear only as typed evidence for a current roadmap claim.

## Record and projection contract

Every inventory row has a unique non-empty `id`, normalized `claimKey`, and
structured `sourceKey`, plus a present-tense `claim`, closed-vocabulary `kind`
and `status`, non-empty `locations`, typed `evidence`, a non-empty `boundary`,
one `sourceOfTruth`, and a source-specific `projection`.

Paths are repository-relative and canonicalized before comparison. Each source
location must exist and contain its exact marker. Location paths are unique
within a row; canonical path plus whitespace/case-normalized marker identity is
unique across rows. This prevents differently padded or cased aliases from
creating two claims over one source anchor.

Projection validation is claim-specific:

- roadmap rows pin task number, title, dependency, exact state text, closure
  cell, release-blocker posture, and the full structured status overlay object;
  tasks without an overlay pin `null`, while Tasks 9–12 each map to and
  deep-compare the complete shared `task9to12` object;
- risk rows pin status, final-readiness blocking posture, surface, summary,
  impact, mitigation, and closure gate;
- workflow rows pin availability for every surface, proof paths, proof mode,
  recovery, and intentional gaps; and
- selected readiness rows pin their declared structured posture, including the
  risk-derived blocker count and valid Make targets.

Allowed statuses are kind-specific. A `complete` roadmap claim must match the
current roadmap/status semantics and include an existing typed receipt. A
static contract or gate alone cannot substantiate `complete`.

## Evidence and authority boundary

Evidence uses a closed vocabulary only:

- `make-target` names an existing Make target;
- `contract` names an allowlisted, existing contract and exact marker;
- `generated-surface` names an allowlisted generated truth surface and exact
  marker; or
- `receipt` names an existing file below the declared receipt root and exact
  marker.

Evidence validates the mapping; it does not grant authority. A source marker,
inventory row, passing static checker, or receipt alone is not completion proof.
The roadmap's exact closure command plus tracked receipt remains authoritative,
and the independent-review lifecycle still applies. This inventory must never
authorize a release, tag, npm publication, CI/CD change, or Clockify mutation.
