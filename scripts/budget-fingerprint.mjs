import { createHash } from "node:crypto";

export function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}

export function budgetFingerprint(value) {
    return createHash("sha256").update(stableJson(value)).digest("hex");
}
