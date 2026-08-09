import { z } from "zod";

/**
 * Forgiving scalar shapes for model-emitted arguments. The planner sometimes
 * sends a single string where an array is expected (`userIds: "Bob"`) or a
 * numeric string where a number is expected (`amount: "75"`). The MCP SDK's
 * zod-to-json-schema unwraps `z.preprocess` to the INNER schema, so the
 * model-visible tool schema (and docs/mcp-tools.json) stays the canonical
 * array/number — only the server's acceptance widens. Coercion is conservative:
 * no comma splitting (names may contain commas), no boolean coercion, and never
 * `""` -> 0 (a silent $0 amount would be a money bug).
 */

/**
 * Accept a bare string for a string list (`"x"` => `["x"]`). Pass a constrained
 * array schema to keep its rules: `zStringList(z.array(z.string().min(1)))`.
 * Generic so `z.infer` keeps the array element type at every adoption site.
 */
export function zStringList<S extends z.ZodType = z.ZodArray<z.ZodString>>(
    schema?: S,
): z.ZodType<z.output<S>> {
    const inner = (schema ?? z.array(z.string().min(1))) as S;
    return z.preprocess((value) => (typeof value === "string" ? [value] : value), inner);
}

/**
 * Accept a numeric string for a number (`"40.5"` => 40.5). Non-numeric and
 * empty strings pass through untouched so the inner schema reports the real
 * type error; constraints (`.positive()`, `.int()`) apply AFTER coercion.
 *
 * Only plain decimal strings coerce. `Number()` alone also parses hex/octal/
 * binary (`"0x10"` -> 16) and exponent (`"1e3"` -> 1000) forms — syntax no
 * model or API uses for a money/duration field, where a silent 16 or 1000 is
 * the same class of bug as `""` -> 0. Those fall through to the inner
 * schema's normal type error.
 */
const PLAIN_DECIMAL_STRING = /^-?\d+(\.\d+)?$/;

export function zNumberLike<S extends z.ZodType = z.ZodNumber>(
    schema?: S,
): z.ZodType<z.output<S>> {
    const inner = (schema ?? z.number()) as S;
    return z.preprocess((value) => {
        if (typeof value === "string" && PLAIN_DECIMAL_STRING.test(value.trim())) {
            return Number(value.trim());
        }
        return value;
    }, inner);
}
