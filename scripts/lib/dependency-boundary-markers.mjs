// Forbidden-import-marker scanning for scripts/check-dependency-boundary.mjs.
//
// Direction matters. These markers are FORBIDDEN: presence in code fails the
// gate. A naive `text.includes(marker)` therefore reds on a doc comment that
// merely mentions a marker — a false RED, the inverse of the false-green shape
// that check-replay-fixtures.mjs had. The precise fix is to strip comments
// before scanning and keep every code position (imports, requires, string
// literals) failing. Do not narrow the code-side match to import position:
// that would quiet the gate, not sharpen it.

/**
 * Replace comment text with spaces, preserving string and template literals
 * and keeping every character offset (so line numbers stay correct).
 *
 * Handled states: line comments, block comments, single/double-quoted
 * strings with escapes, and template literals (including nested `${ }`
 * expressions). Regex literals are not modeled; the markers this gate scans
 * for are path fragments, which cannot begin a comment misparse from inside
 * a regex without an unescaped `/*` or `//` sequence.
 *
 * @param {string} text
 * @returns {string} same length as `text`, with comment bytes blanked
 */
export function blankComments(text) {
    const out = text.split("");
    let state = "code";
    // Template-literal nesting: each entry is the brace depth of one `${ }`
    // expression opened from a template literal.
    const templateStack = [];
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        const next = text[i + 1];
        if (state === "code") {
            if (ch === "/" && next === "/") {
                state = "line";
                out[i] = " ";
            } else if (ch === "/" && next === "*") {
                state = "block";
                out[i] = " ";
            } else if (ch === '"') {
                state = "double";
            } else if (ch === "'") {
                state = "single";
            } else if (ch === "`") {
                state = "template";
            } else if (templateStack.length > 0 && ch === "{") {
                templateStack[templateStack.length - 1] += 1;
            } else if (templateStack.length > 0 && ch === "}") {
                templateStack[templateStack.length - 1] -= 1;
                if (templateStack[templateStack.length - 1] === 0) {
                    templateStack.pop();
                    state = "template";
                }
            }
        } else if (state === "line") {
            if (ch === "\n") state = "code";
            else out[i] = " ";
        } else if (state === "block") {
            if (ch === "*" && next === "/") {
                out[i] = " ";
                out[i + 1] = " ";
                i += 1;
                state = "code";
            } else if (ch !== "\n") {
                out[i] = " ";
            }
        } else if (state === "double" || state === "single") {
            if (ch === "\\") i += 1;
            else if (ch === (state === "double" ? '"' : "'")) state = "code";
            else if (ch === "\n") state = "code"; // unterminated; fail safe
        } else if (state === "template") {
            if (ch === "\\") i += 1;
            else if (ch === "`") state = "code";
            else if (ch === "$" && next === "{") {
                templateStack.push(1);
                i += 1;
                state = "code";
            }
        }
    }
    return out.join("");
}

/**
 * Scan one source file's text for forbidden import markers, ignoring
 * comments. Returns one finding per (marker, line) hit.
 *
 * @param {string} text source file contents
 * @param {readonly string[]} markers forbidden marker substrings
 * @returns {{ marker: string, line: number }[]}
 */
export function forbiddenMarkerFindings(text, markers) {
    const findings = [];
    const blanked = blankComments(text);
    const lines = blanked.split("\n");
    for (const marker of markers) {
        if (typeof marker !== "string" || marker.length === 0) continue;
        for (let index = 0; index < lines.length; index += 1) {
            if (lines[index].includes(marker)) {
                findings.push({ marker, line: index + 1 });
            }
        }
    }
    return findings;
}
