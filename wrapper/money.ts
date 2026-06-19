/**
 * Amount-unit conversion — the single source of truth for the major↔minor
 * (×100) mapping that Clockify's money fields want as integer minor units.
 *
 * Clockify's money wire shapes are NOT uniform, and copying a conversion
 * per-call-site has historically been a silent-corruption bug source (rounding
 * before vs. after the ×100, divergent inline copies, or assuming every field
 * uses the same unit). The unit each resource uses on the wire is recorded in
 * {@link CLOCKIFY_AMOUNT_UNITS}; route every major/minor amount through
 * {@link toMinor} so the mapping is fixed in exactly one place.
 *
 * Live-verified against the real Clockify API (ai-assistant addon, June 2026):
 * invoices/payments/rates are minor (cents) on the wire, **expenses are MAJOR
 * (dollars)**, and an invoice item's `unitPrice` is minor×100 (hundredths of a
 * cent) because Clockify computes `amount = unitPrice × quantity / 100`.
 */

/** Whether an incoming amount is already in minor units (cents) or in major units. */
export type AmountUnit = "minor" | "major";

/**
 * Resolve a major/minor amount to the integer minor units (cents) Clockify
 * wants. Rounds AFTER the ×100 so float dust (e.g. `19.99 * 100`) never
 * under-bills.
 *
 * @example
 * ```ts
 * const cents = toMinor(129.5, "major");
 * const invoiceUnitPrice = invoiceItemUnitPriceToWire(cents);
 * ```
 */
export function toMinor(amount: number, unit: AmountUnit): number {
    return unit === "minor" ? Math.round(amount) : Math.round(amount * 100);
}

/** Convert integer minor units (cents) to a major-unit number for display/preview. */
export function toMajor(minor: number): number {
    return minor / 100;
}

/**
 * An invoice item's `unitPrice` is **minor×100** on the wire (hundredths of a
 * cent), distinct from every other money field. Sending plain minor billed a
 * $1000 item as $10 (live-probed). Use the helpers below at the item boundary.
 */
export const INVOICE_ITEM_UNIT_PRICE_WIRE_SCALE = 100;

/** Map a unit price in minor units (cents) to the invoice-item wire value (minor×100). */
export function invoiceItemUnitPriceToWire(minor: number): number {
    return Math.round(minor * INVOICE_ITEM_UNIT_PRICE_WIRE_SCALE);
}

/** Map an invoice-item wire `unitPrice` (minor×100) back to minor units (cents). */
export function invoiceItemUnitPriceFromWire(wire: number): number {
    return Math.round(wire / INVOICE_ITEM_UNIT_PRICE_WIRE_SCALE);
}

/**
 * The wire unit each Clockify money field uses, so callers never have to guess.
 * Getting this wrong silently zeroes or 100×s money values.
 *
 * - `invoice` / `invoicePayment`: minor units (cents) on the wire.
 * - `expense`: **major** units (dollars) on the wire — the odd one out.
 * - `rate` (hourly/cost): integer minor units (cents) in a PUT `{ amount }` body.
 *
 * The invoice **item** `unitPrice` is a special minor×100 scale; see
 * {@link invoiceItemUnitPriceToWire}.
 */
export const CLOCKIFY_AMOUNT_UNITS = {
    invoice: "minor",
    invoicePayment: "minor",
    expense: "major",
    rate: "minor",
} as const satisfies Record<string, AmountUnit>;
