# Unique-claim inventory policy

The canonical claim universe is limited to current readiness/release posture,
current open or accepted readiness risks, active roadmap task state/dependency/
closure requirements, and user-facing workflow availability already governed by
`docs/product-surface.json`. Archived plans and historical receipts are excluded
unless they are evidence for a current claim.

Each row is an evidence map with one normalized `claimKey`, exact locations,
evidence, boundary, status, and one source of truth. It is not completion proof:
a source marker, inventory row, passing static checker, and receipt alone never
close a roadmap task. The roadmap's exact closure command and tracked receipt
remain authoritative.
