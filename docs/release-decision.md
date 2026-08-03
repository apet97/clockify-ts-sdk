# Current release decision

This is the successor decision surface for the completed historical 1.0
campaign. The retained roadmap rows and receipts remain evidence; they do not
open a new task queue or authorize publication.

## Decision

The current decision is `defer_1x`.

Complete the structural proof and maintenance simplification first. Reopen a
coordinated 1.x release only through a separate explicit release task after the
public SDK surface classification, peer-range migration, registry proof, and
release order receive dedicated review.

The mechanical evidence is recorded in
[`one-point-zero-surface-inventory.md`](./one-point-zero-surface-inventory.md).
Every observed SDK symbol is intentionally `undecided`; this structural task
does not choose maintainer stability classifications. No calendar reopening
date is scheduled.

No package version, peer range, tag, publication, GitHub Release, or release
order is changed or authorized by this decision document.

## Current package and registry posture

The current source package versions remain coordinated at SDK `0.15.0`, CLI
`0.5.0`, and MCP `0.8.0`. A read-only npm query recorded matching registry
versions, SHA-512 integrity values, and modification timestamps in
[`release-decision-registry-receipt.json`](./release-decision-registry-receipt.json).
That receipt is a registry observation captured against the pre-C8 source SHA;
it is not publication approval, provenance proof, or a claim that this branch
was released.

The release workflows now use exact-artifact state receipts, preserve
publication evidence when a later step fails, and keep npm/GitHub publication
tag-gated. CLI and MCP manual dispatch is proof-only. Those safeguards support
a future release review; they do not grant permission to create a tag or
publish a package.

## Reopening conditions

A future 1.x release task must separately provide and review:

- the public SDK surface classification and compatibility impact;
- the CLI/MCP peer-range migration and coordinated version order;
- fresh exact-artifact, registry, provenance, and asset receipts; and
- explicit maintainer authorization for any tag, publication, or GitHub Release.

Until that work is opened and approved, use the retained 1.0 receipts for
historical context and this document for the current decision.
