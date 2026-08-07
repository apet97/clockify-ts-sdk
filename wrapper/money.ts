/**
 * Amount-unit conversion — the single source of truth for the major↔minor
 * (×100) mapping that Clockify's money fields want as integer minor units.
 *
 * Clockify's money wire shapes are NOT uniform, and copying a conversion
 * per-call-site has historically been a silent-corruption bug source (rounding
 * before vs. after the ×100, divergent inline copies, or assuming every field
 * uses the same unit). The unit each resource uses on the wire is recorded in
 * {@link CLOCKIFY_AMOUNT_UNITS}. `toMinor` describes the caller's input unit,
 * not the destination field's wire unit. In particular, expense request
 * `amount` is already major-unit wire data and must use
 * {@link expenseAmountToWire} instead of `toMinor`.
 *
 * Live-verified against the real Clockify API (ai-assistant addon, June 2026):
 * invoice/payment/rate request and response fields are minor (cents) on the
 * wire, while an expense create/update `amount` is MAJOR (dollars) and the
 * expense response `total` is MINOR (cents). An invoice item's `unitPrice` is
 * minor×100 (hundredths of a cent) because Clockify computes
 * `amount = unitPrice × quantity / 100`.
 */

/** Whether an incoming amount is already in minor units (cents) or in major units. */
export type AmountUnit = "minor" | "major";

/**
 * Guard the money helpers' shared invariant: every wire minor-unit amount
 * (cents, or an invoice item's minor×100) must be an exact integer inside
 * `Number.isSafeInteger`'s ±2^53−1 envelope. A value outside it has already
 * lost precision — continuing silently would be exactly the kind of
 * silent-corruption bug this module exists to prevent (see the module doc
 * comment above).
 */
function assertSafeMinorUnits(value: number, context: string): number {
    if (!Number.isSafeInteger(value)) {
        throw new RangeError(
            `${context}: ${value} is outside the exact-integer envelope (±${Number.MAX_SAFE_INTEGER}); ` +
                "Clockify money fields must fit an exact integer number of minor units.",
        );
    }
    return value;
}

/**
 * Resolve a major/minor amount to the integer minor units (cents) Clockify
 * wants. Rounds AFTER the ×100 so float dust (e.g. `19.99 * 100`) never
 * under-bills. Throws `RangeError` if the result would fall outside the
 * exact-integer envelope — see {@link assertSafeMinorUnits}.
 *
 * @example
 * ```ts
 * const cents = toMinor(129.5, "major");
 * const invoiceUnitPrice = invoiceItemUnitPriceToWire(cents);
 * ```
 */
export function toMinor(amount: number, unit: AmountUnit): number {
    const minor = unit === "minor" ? Math.round(amount) : Math.round(amount * 100);
    return assertSafeMinorUnits(minor, "toMinor");
}

/**
 * Convert integer minor units (cents) to a major-unit number for
 * display/preview. Throws `RangeError` if `minor` is already outside the
 * exact-integer envelope — see {@link assertSafeMinorUnits}.
 */
export function toMajor(minor: number): number {
    return assertSafeMinorUnits(minor, "toMajor") / 100;
}

/**
 * Guard the major-unit counterpart of {@link assertSafeMinorUnits}. A major
 * amount is legitimately fractional (`12.34` dollars), so integrality is the
 * wrong test here — what must hold is that the value is finite and inside the
 * exact-integer envelope, because past ±2^53−1 `JSON.stringify` silently
 * rounds the wire value and the caller over- or under-bills by whole units.
 */
function assertSafeMajorAmount(value: number, context: string): number {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
        throw new RangeError(
            `${context}: ${value} is outside the exact-integer envelope (±${Number.MAX_SAFE_INTEGER}); ` +
                "Clockify money fields must serialize to an exact wire amount.",
        );
    }
    return value;
}

/**
 * Map an expense create/update amount in major units to its wire value.
 *
 * Clockify is asymmetric here: request `amount` stays in major units, while
 * response `total` is minor units. This explicit pass-through prevents the
 * destructive `toMinor(amount, "major")` 100× conversion at this boundary. It
 * still enforces the module's precision envelope — see
 * {@link assertSafeMajorAmount} — so no money helper can emit a wire amount
 * that has already lost precision.
 */
export function expenseAmountToWire(major: number): number {
    return assertSafeMajorAmount(major, "expenseAmountToWire");
}

/**
 * An invoice item's `unitPrice` is **minor×100** on the wire (hundredths of a
 * cent), distinct from every other money field. Sending plain minor billed a
 * $1000 item as $10 (live-probed). Use the helpers below at the item boundary.
 */
export const INVOICE_ITEM_UNIT_PRICE_WIRE_SCALE = 100;

/**
 * Map a unit price in minor units (cents) to the invoice-item wire value
 * (minor×100). Throws `RangeError` if the result would fall outside the
 * exact-integer envelope — see {@link assertSafeMinorUnits}.
 */
export function invoiceItemUnitPriceToWire(minor: number): number {
    return assertSafeMinorUnits(Math.round(minor * INVOICE_ITEM_UNIT_PRICE_WIRE_SCALE), "invoiceItemUnitPriceToWire");
}

/**
 * Map an invoice-item wire `unitPrice` (minor×100) back to minor units
 * (cents). Throws `RangeError` if `wire` is already outside the
 * exact-integer envelope — see {@link assertSafeMinorUnits}.
 */
export function invoiceItemUnitPriceFromWire(wire: number): number {
    return Math.round(assertSafeMinorUnits(wire, "invoiceItemUnitPriceFromWire") / INVOICE_ITEM_UNIT_PRICE_WIRE_SCALE);
}

/**
 * The wire unit each Clockify money field uses, so callers never have to guess.
 * Getting this wrong silently zeroes or 100×s money values.
 *
 * - `invoice` / `invoicePayment`: minor units (cents) on the wire.
 * - `expenseAmount`: **major** units for create/update request `amount`; use
 *   {@link expenseAmountToWire}, never `toMinor`, at this boundary.
 * - `expenseTotal`: **minor** units for the read-side response `total`.
 * - `rate` (hourly/cost): integer minor units (cents) in a PUT `{ amount }` body.
 *
 * The invoice **item** `unitPrice` is a special minor×100 scale; see
 * {@link invoiceItemUnitPriceToWire}.
 */
export const CLOCKIFY_AMOUNT_UNITS = {
    invoice: "minor",
    invoicePayment: "minor",
    expenseAmount: "major",
    expenseTotal: "minor",
    rate: "minor",
} as const satisfies Record<string, AmountUnit>;
