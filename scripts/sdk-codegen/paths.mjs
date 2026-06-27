import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function resolveFromRoot(value) {
    return path.isAbsolute(value) ? value : path.join(root, value);
}

export function relativeToRoot(value) {
    return path.relative(root, value).replace(/\\/g, "/") || ".";
}
