# Rejected findings

Findings that were investigated and **not** accepted, with the evidence that
settled them. This file exists so the same false positive is not re-raised by
the next audit, and so a reader can tell "nobody looked at this" from "somebody
looked at this and it was wrong".

## When to add an entry

Add one when a reported defect is closed **without** a code change, for any of
these reasons:

- **Refuted** — a probe or a source read shows the reported behavior is not the
  real behavior.
- **Not reproduced** — the report may have been true where it was observed, but
  it does not reproduce here, so it cannot be recorded as evidence.
- **Working as designed** — the behavior is real and intended, and the report
  mistook it for a defect.

Do **not** add an entry for a finding that was accepted and fixed. That belongs
in the changelog and, if it is about wire behavior, in
[`../spec/evidence/discrepancies.md`](../spec/evidence/discrepancies.md).

Each entry states: the claim as reported, who reported it, what was checked,
what the check showed, and the disposition. Keep the claim in the reporter's
terms — a rewritten claim is a claim nobody made, and the next auditor will not
recognize it as already settled.

---

## 2026-08-08 — consumer-report probe wave

Source: `addons-me/restoretime`, a blueprint-stage consumer of the published
2.0.0 SDK that live-probed Clockify and read the SDK source. Its accepted
findings became the `errors.body-code.is-numeric-not-string` fix and the
2026-08-08 wave in the evidence ledger. These four did not survive.

### `CustomFieldStatus` is missing an `"ACTIVE"` member — REFUTED

- **Claim:** the generated union
  `CustomFieldStatus = "INACTIVE" | "VISIBLE" | "INVISIBLE"` is incomplete, so
  the natural consumer check `status === "ACTIVE"` never matches and every
  custom field reads as gone. Rated high severity by the reporter.
- **Checked:** `GET /workspaces/{ws}/custom-fields?page-size=200` on the
  sacrificial workspace, 2026-08-08 — 35 fields.
- **Result:** the observed status set is exactly
  `{INACTIVE, INVISIBLE, VISIBLE}`. No field returned `"ACTIVE"`. The generated
  union matches the wire.
- **Disposition:** refuted as an SDK defect. The real hazard is that
  `"ACTIVE"` is a plausible-sounding value that does not exist, so a consumer
  can write a check that compiles against a widened type and silently matches
  nothing. That is a consumer trap, not a wrong union, and no spec change is
  warranted. `VISIBLE` is the value that means "in use".

### Windowed `listForUser` is eventually consistent — NOT REPRODUCED

- **Claim:** a freshly created time entry stays invisible to a `start`/`end`
  windowed `listForUser` for more than 45 seconds, while description-filtered
  and unfiltered lists show it immediately.
- **Checked:** created one entry, then polled all three filter shapes at
  roughly 0, 5, 15, 30 and 50 seconds, 2026-08-08.
- **Result:** the **windowed** query returned the entry at the first poll, at
  roughly 0 seconds, and at every poll after. The unfiltered query appeared to
  miss it, but that was sort order, not lag: the list is ordered by start time
  descending, the workspace holds entries dated 2027, and the probe entry sat
  at index 29 — outside the requested `page-size=5`. At `page-size=200` it was
  present immediately.
- **Disposition:** not reproduced. Recorded because the false conclusion is
  easy to reach: a small page size on a descending-ordered list looks exactly
  like replication lag.

### An archived tag on create returns 400 — NOT REPRODUCED

- **Claim:** passing an archived tag id when creating a time entry returns 400
  with `code: 501`, in contrast to an archived project, which returns 201.
- **Checked:** `POST .../user/{uid}/time-entries` with an archived tag id and
  an active project, 2026-08-08.
- **Result:** **201**. The entry was created and came back carrying the
  archived tag id in `tagIds`.
- **Disposition:** not reproduced. The archived-**project** half of the same
  report did reproduce and is recorded in the evidence ledger as
  `time-entries.create.archived-project-accepted`. The tag half may depend on a
  workspace setting that is not set here; it is not recorded as evidence
  because it did not reproduce. Re-probe before relying on either outcome.

### `mapAddonTokenRestriction`'s docstring over-warns — REFUTED

- **Claim:** the docstring names custom-field management and account-level
  `GET /workspaces` as walled off from add-on tokens, but probes showed
  `customFields.listForWorkspace` and `workspaces.get` both returning 200, so
  the docstring is steering consumers away from reachable routes.
- **Checked:** compared the two probes against the independent live probes in
  `addons-me/ai-assistant-addon`, which recorded the restricted set as
  "webhooks (ALL), custom-field CREATE, account-level `GET /workspaces`".
- **Result:** the two reports agree with each other and with the docstring. The
  reporter probed **different routes** than the docstring described: a
  custom-field **read** rather than custom-field management, and the
  workspace-scoped `workspaces.get` rather than the account-level
  `workspaces.list`.
- **Disposition:** refuted as a behavior claim. The wording was genuinely
  ambiguous, though — two readers took "custom-field management" and
  "account-level `GET /workspaces`" to mean different operations — so the
  docstring now names the exact operations and states that reads stay
  reachable. No behavior changed.
