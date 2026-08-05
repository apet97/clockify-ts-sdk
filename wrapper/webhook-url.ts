/**
 * Offline SSRF guard for outbound webhook callback URLs.
 *
 * Promoted from mcp/src/orchestration/webhook-url.ts so the SDK, CLI,
 * and MCP server share one literal-host validation rule. Clockify will
 * POST event payloads to the callback URL we register, so a caller who
 * can choose that URL can coax Clockify into hitting internal targets
 * (cloud metadata endpoints, loopback admin panels, RFC-1918 hosts, ...).
 *
 * Scope: literal hosts only. A literal must be ordinary global-unicast space;
 * private, loopback, link-local, documentation, benchmarking, translation,
 * multicast, and other special-purpose ranges fail closed. Localhost-ish
 * hostnames are rejected too. DNS-rebinding defence needs network resolution
 * and a resolve-then-pin transport, which is intentionally out of scope for
 * this offline guard.
 */

export type WebhookUrlValidation = { ok: true; url: URL } | { ok: false; reason: string };

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
            // url.protocol is always a non-empty "<scheme>:" on a parsed URL
            // (scheme-less candidates throw in new URL()), so no fallback is
            // needed here.
            reason: `webhook URL must use https (got ${url.protocol.replace(/:$/, "")} scheme)`,
        };
    }

    if (url.username || url.password) {
        return { ok: false, reason: "webhook URL must not contain embedded credentials" };
    }

    const hostname = url.hostname.toLowerCase();
    const bare =
        hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

    const hostReason = classifyHost(bare);
    if (hostReason) {
        return { ok: false, reason: `webhook URL host ${bare} is not allowed: ${hostReason}` };
    }

    return { ok: true, url };
}

export function assertSafeWebhookUrl(candidate: string): URL {
    const result = validateWebhookUrl(candidate);
    if (!result.ok) throw new Error(result.reason);
    return result.url;
}

function classifyHost(host: string): string | null {
    // No `host.length === 0` pre-guard here: WHATWG https URLs never surface an
    // empty hostname (every maps-to-empty candidate throws in new URL()), and
    // even a hypothetical "" reduces to "" through the trailing-dot strip and
    // is caught by the post-normalize guard below with the identical reason.

    // Node's WHATWG URL parser folds only a SINGLE trailing dot into the IPv4
    // form (127.0.0.1. -> 127.0.0.1); two or more are preserved verbatim
    // (127.0.0.1.. stays 127.0.0.1..). Such a host slips past parseIpv4
    // (split('.') yields length != 4), leaking a loopback/metadata IPv4
    // literal. Collapse all trailing dots once before classification — this is
    // the ONLY trailing-dot normalization, which is why classifyHostname needs
    // none of its own. (Leading/internal empty labels make
    // `new URL()` itself throw, so trailing dots are the only live vector.)
    const normalized = host.replace(/\.+$/, "");
    if (normalized.length === 0) return "empty host";

    const ipv4Reason = classifyIpv4(normalized);
    if (ipv4Reason !== "not-ipv4") return ipv4Reason;

    const ipv6Reason = classifyIpv6(normalized);
    if (ipv6Reason !== "not-ipv6") return ipv6Reason;

    return classifyHostname(normalized);
}

function classifyHostname(name: string): string | null {
    if (name === "localhost") return "loopback hostname";
    if (name.endsWith(".localhost")) return "loopback hostname";
    if (name === "local" || name.endsWith(".local")) return "mDNS/.local internal hostname";
    if (name === "internal" || name.endsWith(".internal")) return ".internal hostname";
    if (name === "home.arpa" || name.endsWith(".home.arpa")) {
        return "RFC 8375 home network range (.home.arpa)";
    }
    if (name === "lan" || name.endsWith(".lan")) return "internal network TLD (.lan)";
    if (name === "corp" || name.endsWith(".corp")) return "internal network TLD (.corp)";
    if (name === "intranet" || name.endsWith(".intranet")) {
        return "internal network TLD (.intranet)";
    }
    return null;
}

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

function ipv4Reason([a, b, c]: [number, number, number, number]): string | null {
    if (a === 0) return "reserved/unspecified range (0.0.0.0/8)";
    if (a === 127) return "loopback range (127.0.0.0/8)";
    if (a === 10) return "private range (10.0.0.0/8)";
    if (a === 172 && b >= 16 && b <= 31) return "private range (172.16.0.0/12)";
    if (a === 192 && b === 168) return "private range (192.168.0.0/16)";
    if (a === 169 && b === 254) return "link-local / cloud metadata range (169.254.0.0/16)";
    if (a === 100 && b >= 64 && b <= 127) return "carrier-grade NAT range (100.64.0.0/10)";
    if (a === 64 && b === 0 && c === 0) {
        return "special-purpose translation range (64.0.0.0/24)";
    }
    if (a === 192 && b === 0 && c === 0) {
        return "special-purpose protocol range (192.0.0.0/24)";
    }
    if (a === 192 && b === 0 && c === 2) return "documentation range (192.0.2.0/24)";
    if (a === 192 && b === 88 && c === 99) {
        return "special-purpose relay range (192.88.99.0/24)";
    }
    if (
        a === 192 &&
        ((b === 31 && c === 196) ||
            (b === 52 && c === 193) ||
            (b === 175 && c === 48))
    ) {
        return "special-purpose service range";
    }
    if (a === 198 && (b === 18 || b === 19)) return "benchmark range (198.18.0.0/15)";
    if (a === 198 && b === 51 && c === 100) return "documentation range (198.51.100.0/24)";
    if (a === 203 && b === 0 && c === 113) return "documentation range (203.0.113.0/24)";
    // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved (Class E), and 255.255.255.255
    // limited broadcast are all non-unicast — never a valid public webhook target.
    // Any first octet >= 224 is one of these, so block the whole range.
    if (a >= 224) return "multicast / reserved / broadcast range (224.0.0.0/4 + 240.0.0.0/4)";
    return null;
}

function classifyIpv6(host: string): string | null {
    if (!host.includes(":")) return "not-ipv6";

    // No dotted-tail ("::ffff:10.0.0.1") arm here. The WHATWG parser
    // canonicalizes every bracketed IPv6 literal to pure lowercase hex groups
    // before url.hostname reaches this guard, so that arm was URL-unreachable
    // dead code (classifyIpv6 is module-private with this single URL-derived
    // call chain) and generated permanent unkillable mutation survivors. The
    // live embedded-IPv4 defence is the hex-group decode in ipv6Reason.
    //
    // The null guard below stays. It is also URL-unreachable today — a
    // malformed literal throws inside new URL() first — but it keeps the
    // fail-closed contract of this function: validateWebhookUrl must RETURN a
    // reason, never throw. Its mutants are documented as equivalent in the
    // ledger in wrapper/tests/webhook-url.test.ts.
    const groups = expandIpv6(host);
    if (!groups) return "malformed IPv6 literal";
    return ipv6Reason(groups);
}

function expandIpv6(host: string): number[] | null {
    const doubleColon = host.indexOf("::");
    let headPart = host;
    let tailPart = "";
    if (doubleColon !== -1) {
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
    const zeros: number[] = Array.from({ length: missing }, () => 0);
    return [...headGroups, ...zeros, ...tailGroups];
}

/**
 * Decode the IPv4 embedded in the low 32 bits of an IPv6 group pair and, when it
 * lands in a blocked range, name it with `label`. Shared by every embedding
 * prefix below (mapped, translated, NAT64, 6to4, IPv4-compatible).
 */
function embeddedIpv4Reason(hi: number, lo: number, label: string): string | null {
    const embedded = ipv4Reason([(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff]);
    return embedded ? `${label} of a ${embedded}` : null;
}

function ipv6Reason(groups: number[]): string | null {
    if (groups.every((g) => g === 0)) return "unspecified address (::)";
    if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) {
        return "loopback address (::1)";
    }
    if ((groups[0]! & 0xffc0) === 0xfec0) return "site-local address (fec0::/10)";

    const isMapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
    if (isMapped) {
        return (
            embeddedIpv4Reason(groups[6]!, groups[7]!, "IPv4-mapped IPv6") ??
            "non-global IPv4-mapped IPv6 range"
        );
    }

    // IPv4-translated IPv6 address (::ffff:0:0:0/96, RFC 2765 SIIT): sibling of
    // the ::ffff:0:0/96 mapped prefix, but with 0xffff in group[4] and
    // group[5] == 0, so the low 32 bits embed an IPv4 reachable through a
    // stateless (SIIT) translator on the egress path (e.g. ::ffff:0:a9fe:a9fe
    // -> 169.254.169.254). Node serializes the literal in hex (and folds the
    // dotted ::ffff:0:a.b.c.d form to hex too), so the guard always sees the
    // hex form. Decode and re-check like the mapped branch so a
    // blocked embedded v4 retains its specific reason; the translation prefix
    // itself remains non-global for every other address.
    const isTranslated =
        groups.slice(0, 4).every((g) => g === 0) && groups[4] === 0xffff && groups[5] === 0;
    if (isTranslated) {
        return (
            embeddedIpv4Reason(groups[6]!, groups[7]!, "IPv4-translated IPv6") ??
            "non-global IPv4-translated IPv6 range"
        );
    }

    // NAT64 well-known prefix (64:ff9b::/96, RFC 6052): the low 32 bits embed an
    // IPv4 address, so an attacker can reach a private/metadata v4 through a
    // NAT64 gateway (e.g. 64:ff9b::a9fe:a9fe -> 169.254.169.254). Decode and
    // re-check exactly like the ::ffff: mapped branch above. Even with a public
    // embedded v4, the literal callback itself is translation space.
    const isNat64 =
        groups[0] === 0x0064 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0);
    if (isNat64) {
        return (
            embeddedIpv4Reason(groups[6]!, groups[7]!, "NAT64-embedded IPv4") ??
            "non-global NAT64 translation range (64:ff9b::/96)"
        );
    }

    // 6to4 prefix (2002::/16, RFC 3056): groups[1]/groups[2] hold the upper/lower
    // halves of the embedded IPv4, so a 6to4 literal can reach a private/metadata
    // v4 through a 6to4 relay (e.g. 2002:a9fe:a9fe:: -> 169.254.169.254). Decode
    // and re-check exactly like the NAT64 branch. The deprecated 6to4 range is
    // special-purpose even when its embedded v4 is public.
    if (groups[0] === 0x2002) {
        return (
            embeddedIpv4Reason(groups[1]!, groups[2]!, "6to4-embedded IPv4") ??
            "special-purpose 6to4 range (2002::/16)"
        );
    }

    // IPv4-compatible IPv6 (::/96, deprecated by RFC 4291 §2.5.5.1 but still
    // routable on some stacks): the low 32 bits embed an IPv4 address with the
    // top 96 bits zero (e.g. ::a9fe:a9fe -> 169.254.169.254). The :: and ::1
    // early-returns above already consumed the unspecified/loopback cases, so any
    // remaining all-zero-prefix literal carries a real embedded v4. Decode and
    // re-check like the mapped branch; the deprecated compatibility range is
    // non-global even when its embedded v4 is public.
    if (groups.slice(0, 6).every((g) => g === 0)) {
        return (
            embeddedIpv4Reason(groups[6]!, groups[7]!, "IPv4-compatible IPv6") ??
            "non-global IPv4-compatible IPv6 range"
        );
    }

    const first = groups[0]!;
    const firstByte = (first >> 8) & 0xff;
    if (firstByte === 0xfc || firstByte === 0xfd) return "private unique-local range (fc00::/7)";
    if (first >= 0xfe80 && first <= 0xfebf) return "link-local range (fe80::/10)";
    // ff00::/8 multicast (ff02::1 all-nodes, ff0e::1 global, etc.) — non-unicast,
    // never a valid public webhook target. `new URL()` keeps these un-folded.
    if (firstByte === 0xff) return "multicast range (ff00::/8)";

    // Current ordinary IPv6 global-unicast allocation is 2000::/3. Explicitly
    // exclude IANA special-purpose subranges inside it as well; a syntactically
    // valid documentation or benchmarking address is not a public callback.
    if (first < 0x2000 || first > 0x3fff) {
        return "non-global IPv6 range (outside 2000::/3)";
    }
    if (first === 0x2001 && groups[1]! <= 0x01ff) {
        return "special-purpose IPv6 range (2001::/23)";
    }
    if (first === 0x2001 && groups[1] === 0x0db8) {
        return "documentation range (2001:db8::/32)";
    }
    if (first === 0x3fff && (groups[1]! & 0xf000) === 0) {
        return "documentation range (3fff::/20)";
    }
    if (first === 0x2620 && groups[1] === 0x004f && groups[2] === 0x8000) {
        return "special-purpose service range (2620:4f:8000::/48)";
    }

    return null;
}

function truncate(value: string): string {
    return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}
