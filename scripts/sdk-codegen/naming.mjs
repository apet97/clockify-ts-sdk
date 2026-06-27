export function literal(value) {
    return JSON.stringify(value);
}

export function tagToResource(tag) {
    return toCamel(tag.replace(/[()]/g, " "));
}

export function toCamel(value) {
    const words = wordsFrom(value);
    if (words.length === 0) return "value";
    return words[0].toLowerCase() + words.slice(1).map(capitalize).join("");
}

export function toPascal(value) {
    return wordsFrom(value).map(capitalize).join("") || "Value";
}

export function wordsFrom(value) {
    return String(value)
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean);
}

export function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

export function refToName(ref) {
    return ref.split("/").at(-1);
}

export function propertyAccess(objectName, propertyName) {
    return identifier(propertyName) ? `${objectName}.${propertyName}` : `${objectName}[${JSON.stringify(propertyName)}]`;
}

export function identifier(name) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

export function indent(text, spaces) {
    const prefix = " ".repeat(spaces);
    return text
        .split("\n")
        .map((line) => (line ? prefix + line : line))
        .join("\n");
}
