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
export function zStringList<S extends z.ZodTypeAny = z.ZodArray<z.ZodString>>(
    schema?: S,
): z.ZodEffects<S, z.output<S>, unknown> {
    const inner = (schema ?? z.array(z.string().min(1))) as S;
    return z.preprocess((value) => (typeof value === "string" ? [value] : value), inner);
}

/**
 * Accept a numeric string for a number (`"40.5"` => 40.5). Non-numeric and
 * empty strings pass through untouched so the inner schema reports the real
 * type error; constraints (`.positive()`, `.int()`) apply AFTER coercion.
 */
export function zNumberLike<S extends z.ZodTypeAny = z.ZodNumber>(
    schema?: S,
): z.ZodEffects<S, z.output<S>, unknown> {
    const inner = (schema ?? z.number()) as S;
    return z.preprocess((value) => {
        if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
        return value;
    }, inner);
}

/**
 * invalid_args copy the agent loop can self-correct from: each issue prefixed
 * with its field path ("userIds: Expected array, received string";
 * "items.0.amount: ..."). A bare Zod message names the failure but not the
 * field — useless to a model holding ten arguments.
 */
export function formatZodIssues(error: z.ZodError): string {
    return error.issues
        .map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
        .join("; ");
}

/** Iterative two-row Levenshtein edit distance. */
function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
        const cur = [i];
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
        }
        prev = cur;
    }
    return prev[b.length]!;
}

function tokens(value: string): Set<string> {
    return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

/**
 * The nearest catalog-style names to `query`, best first, at most `limit`. Empty
 * when nothing is genuinely similar (an unrelated/empty query gets no suggestion).
 * Two signals: TOKEN OVERLAP (>=2 shared tokens) OR small LEVENSHTEIN distance,
 * so a truly unrelated string yields NO suggestion (never noise).
 */
export function nearestNames(query: string, candidates: readonly string[], limit = 3): string[] {
    const q = query.toLowerCase();
    if (q.length === 0) return [];
    const queryTokens = tokens(query);

    const scored = candidates.map((name) => {
        const nameTokens = tokens(name);
        let overlap = 0;
        for (const t of queryTokens) if (nameTokens.has(t)) overlap += 1;
        return { name, overlap, distance: levenshtein(q, name.toLowerCase()) };
    });

    const close = scored.filter(
        (c) => c.overlap >= 2 || c.distance <= Math.ceil(Math.max(q.length, c.name.length) * 0.34),
    );
    close.sort((a, b) => b.overlap - a.overlap || a.distance - b.distance || a.name.localeCompare(b.name));
    return close.slice(0, limit).map((c) => c.name);
}

/** A recovery hint string for an unknown name, or undefined when nothing is close. */
export function didYouMeanHint(query: string, candidates: readonly string[]): string | undefined {
    const near = nearestNames(query, candidates);
    return near.length ? `Did you mean: ${near.join(", ")}?` : undefined;
}
