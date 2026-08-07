All work complete. Final acceptance report:

## Completed

Audited all 6 ledger entries for the INVOICES group with fresh live probes against the sacrificial sandbox, compared official / corrected / official-live specs, and wrote findings to `/tmp/clockify-openapi-audit/findings/invoices.md`. All 6 entries CONFIRMED live (with new nuances for entries 1, 3, 5), plus 9 unledgered differences. All `DSAUDIT*` probe invoices and settings mutations were cleaned up/restored (verified: zero leftovers, settings byte-identical to pre-probe state, invoice #13 restored field-for-field). No API key appears anywhere in the findings (grep-verified).

## Files Changed
- `/tmp/clockify-openapi-audit/findings/invoices.md` — created (142 lines): per-entry reports (ID | status | corrected judgment | official judgment | confidence | severity | live probe record | recommended action), cross-cutting verifications, UNLEDGERED-DIFFERENCES (a–i), probe artifact index. The repository itself was never written (read-only respected).

## Notes (for the parent)
- Entry 3 twist: corrected spec has `billFrom`/`clientAddress` on `UpdateInvoiceRequest`; live PUT **accepts but silently ignores** both (drafts lose create-time `billFrom:"WORKSPACE"`; company-backed invoices preserve by omission). `official-live.json` still lacks them — official NOT caught up.
- Entry 5 residual risk resolved positively: `DELETE /invoices/{id}` works on a PAID invoice with a payment still attached (200).
- Unledgered item (b) is a genuine corrected-spec bug: `order` path param modeled as `string`; live server binds `int` (400 conversion error on non-numeric). Official is right here.
- Unledgered item (a): live honors `statuses` single, exploded, AND comma spellings; corrected's array model is the most accurate.