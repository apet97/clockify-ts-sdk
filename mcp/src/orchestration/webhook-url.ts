/**
 * Offline SSRF guard for outbound webhook callback URLs.
 *
 * Clockify will POST event payloads to the callback URL we register, so a
 * caller who can choose that URL can coax the Clockify side into hitting
 * internal targets (cloud metadata endpoints, loopback admin panels,
 * RFC-1918 hosts, …). This validator rejects the obvious SSRF shapes
 * before a webhook is ever previewed or created.
 *
 * Scope: literal hosts only. We reject IP literals in private / loopback /
 * link-local / unique-local / reserved ranges (IPv4, IPv6, and IPv4-mapped
 * IPv6) plus localhost-ish hostnames. DNS-rebinding defence (resolving a
 * public name that points at a private address, or a name that flips after
 * the check) is intentionally NOT covered here — that needs a network
 * lookup and a resolve-then-pin transport, which is out of scope for a
 * build-free, offline guard. A literal-IP + hostname blocklist is the
 * right, testable scope for this layer.
 */

export type WebhookUrlValidation = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * validateWebhookUrl classifies a candidate webhook URL without throwing.
 * Returns `{ ok: true, url }` for a routable public HTTPS target, or
 * `{ ok: false, reason }` naming the rejected host/scheme and why.
 */
export function validateWebhookUrl(candidate: string): WebhookUrlValidation {
    let url: URL;
    try {
        url = new URL(candidate);
    } catch {
        return { ok: false, reason: `webhook URL is not a valid URL: ${truncate(candidate)}` };
    }

    if (url.protocol !== "https:") {
        return {
            ok: false,
            reason: `webhook URL must use https (got ${url.protocol.replace(/:$/, "") || "no"} scheme)`,
        };
    }

    if (url.username || url.password) {
        return { ok: false, reason: "webhook URL must not contain embedded credentials" };
    }

    // URL keeps IPv6 hosts wrapped in brackets; strip them for classification.
    const hostname = url.hostname.toLowerCase();
    const bare = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

    const hostReason = classifyHost(bare);
    if (hostReason) {
        return { ok: false, reason: `webhook URL host ${bare} is not allowed: ${hostReason}` };
    }

    return { ok: true, url };
}

/**
 * assertSafeWebhookUrl is the throwing form used by the webhook setup path.
 * Returns the normalized URL on success; throws an Error whose message
 * names the rejected host/reason on failure.
 */
export function assertSafeWebhookUrl(candidate: string): URL {
    const result = validateWebhookUrl(candidate);
    if (!result.ok) throw new Error(result.reason);
    return result.url;
}

/**
 * classifyHost returns a human-readable rejection reason for a disallowed
 * host, or null when the host is acceptable. The host must already be the
 * bare form (IPv6 brackets stripped, lowercased).
 */
function classifyHost(host: string): string | null {
    if (host.length === 0) return "empty host";

    const ipv4Reason = classifyIpv4(host);
    if (ipv4Reason !== "not-ipv4") return ipv4Reason;

    const ipv6Reason = classifyIpv6(host);
    if (ipv6Reason !== "not-ipv6") return ipv6Reason;

    // Not an IP literal — apply the hostname blocklist.
    return classifyHostname(host);
}

function classifyHostname(host: string): string | null {
    // Tolerate a single trailing dot (fully-qualified form).
    const name = host.endsWith(".") ? host.slice(0, -1) : host;
    if (name === "localhost") return "loopback hostname";
    if (name.endsWith(".localhost")) return "loopback hostname";
    if (name.endsWith(".local")) return "mDNS/.local internal hostname";
    if (name.endsWith(".internal")) return ".internal hostname";
    return null;
}

/**
 * classifyIpv4 returns a rejection reason for a private/reserved IPv4
 * literal, null for an acceptable public IPv4 literal, or the sentinel
 * "not-ipv4" when `host` is not an IPv4 literal at all.
 */
function classifyIpv4(host: string): string | null {
    const octets = parseIpv4(host);
    if (!octets) return "not-ipv4";
    return ipv4Reason(octets);
}

function parseIpv4(host: string): [number, number, number, number] | null {
    const parts = host.split(".");
    if (parts.length !== 4) return null;
    const nums: number[] = [];
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part)) return null;
        const value = Number(part);
        if (value > 255) return null;
        nums.push(value);
    }
    return nums as [number, number, number, number];
}

function ipv4Reason([a, b]: [number, number, number, number]): string | null {
    if (a === 0) return "reserved/unspecified range (0.0.0.0/8)";
    if (a === 127) return "loopback range (127.0.0.0/8)";
    if (a === 10) return "private range (10.0.0.0/8)";
    if (a === 172 && b >= 16 && b <= 31) return "private range (172.16.0.0/12)";
    if (a === 192 && b === 168) return "private range (192.168.0.0/16)";
    if (a === 169 && b === 254) return "link-local / cloud metadata range (169.254.0.0/16)";
    // CGNAT 100.64.0.0/10 → second octet 64..127.
    if (a === 100 && b >= 64 && b <= 127) return "carrier-grade NAT range (100.64.0.0/10)";
    return null;
}

/**
 * classifyIpv6 returns a rejection reason for a private/reserved IPv6
 * literal, null for an acceptable public IPv6 literal, or the sentinel
 * "not-ipv6" when `host` is not an IPv6 literal.
 *
 * Note: `new URL(...)` normalises IPv4-mapped IPv6 to the hex form
 * (`::ffff:127.0.0.1` → `::ffff:7f00:1`), so the dotted-quad tail is
 * usually gone by the time we get here. `ipv6Reason` decodes the embedded
 * IPv4 back out of the trailing hex groups. We still handle a literal
 * dotted tail for robustness against any caller that hasn't gone through
 * the URL parser.
 */
function classifyIpv6(host: string): string | null {
    if (!host.includes(":")) return "not-ipv6";

    // IPv4-mapped (::ffff:a.b.c.d) / IPv4-compatible (::a.b.c.d) literal
    // dotted forms: classify the embedded IPv4 directly.
    const lastColon = host.lastIndexOf(":");
    const tail = host.slice(lastColon + 1);
    if (tail.includes(".")) {
        const embedded = classifyIpv4(tail);
        if (embedded === "not-ipv4") return "malformed IPv4-mapped IPv6 literal";
        if (embedded) return `IPv4-mapped IPv6 of a ${embedded}`;
        return null;
    }

    const groups = expandIpv6(host);
    if (!groups) return "malformed IPv6 literal";
    return ipv6Reason(groups);
}

/**
 * expandIpv6 turns an IPv6 literal into its 8 16-bit groups, handling the
 * "::" zero-compression. Returns null on malformed input.
 */
function expandIpv6(host: string): number[] | null {
    const doubleColon = host.indexOf("::");
    let headPart = host;
    let tailPart = "";
    if (doubleColon !== -1) {
        // Reject more than one "::".
        if (host.indexOf("::", doubleColon + 1) !== -1) return null;
        headPart = host.slice(0, doubleColon);
        tailPart = host.slice(doubleColon + 2);
    }

    const head = headPart.length > 0 ? headPart.split(":") : [];
    const tail = tailPart.length > 0 ? tailPart.split(":") : [];

    const toGroups = (parts: string[]): number[] | null => {
        const out: number[] = [];
        for (const part of parts) {
            if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
            out.push(parseInt(part, 16));
        }
        return out;
    };

    const headGroups = toGroups(head);
    const tailGroups = toGroups(tail);
    if (!headGroups || !tailGroups) return null;

    if (doubleColon === -1) {
        return headGroups.length === 8 ? headGroups : null;
    }

    const missing = 8 - (headGroups.length + tailGroups.length);
    if (missing < 0) return null;
    return [...headGroups, ...new Array(missing).fill(0), ...tailGroups];
}

function ipv6Reason(groups: number[]): string | null {
    const allZero = groups.every((g) => g === 0);
    if (allZero) return "unspecified address (::)";
    // ::1 loopback.
    if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return "loopback address (::1)";

    // IPv4-mapped IPv6 ::ffff:a.b.c.d normalises to groups
    // [0,0,0,0,0,0xffff, (a<<8|b), (c<<8|d)] — decode and apply IPv4 rules
    // so mapped private/loopback/metadata hosts are rejected.
    const isMapped =
        groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
    if (isMapped) {
        const hi = groups[6]!;
        const lo = groups[7]!;
        const octets: [number, number, number, number] = [
            (hi >> 8) & 0xff,
            hi & 0xff,
            (lo >> 8) & 0xff,
            lo & 0xff,
        ];
        const embedded = ipv4Reason(octets);
        if (embedded) return `IPv4-mapped IPv6 of a ${embedded}`;
        return null;
    }

    const first = groups[0]!;
    // Unique-local fc00::/7 → top 7 bits are 1111110 → first byte 0xfc or 0xfd.
    const firstByte = (first >> 8) & 0xff;
    if (firstByte === 0xfc || firstByte === 0xfd) return "private unique-local range (fc00::/7)";
    // Link-local fe80::/10 → first 10 bits 1111111010 → 0xfe80..0xfebf.
    if (first >= 0xfe80 && first <= 0xfebf) return "link-local range (fe80::/10)";

    return null;
}

function truncate(value: string): string {
    return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}
