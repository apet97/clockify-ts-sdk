# Snippet Method Parity Policy

Agent-facing SDK snippets must name methods that exist on the generated Clockify client.
A snippet that says `clockify.tags.getTags` when the generated
client exposes `clockify.tags.list` teaches agents the wrong API.

Rules:

- Every `clockify.<group>.<method>` reference in a scanned snippet surface must
  resolve to a public method on `wrapper/src/api/resources/<group>/client/Client.ts`.
- Client-level helpers that are not resource-group methods are allowlisted in
  `docs/snippet-method-parity-contract.json`.
- The checker skips generated-client method validation when `wrapper/src/` is
  absent, but still validates its own wiring so fresh clones fail only on real
  contract drift.
