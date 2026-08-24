/** Parse one exact canonical HTTPS URL without accepting hidden URL components. */
export function requireExactHttpsUrl(value: string, label: string): URL {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new TypeError(`${label} must be an absolute HTTPS URL`);
    }
    if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        value.includes("?") ||
        value.includes("#") ||
        url.href !== value
    ) {
        throw new TypeError(
            `${label} must be one canonical HTTPS URL without credentials, query, or fragment`,
        );
    }
    return url;
}
