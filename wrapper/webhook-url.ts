/**
 * Offline SSRF guard for outbound webhook callback URLs.
 *
 * Promoted from mcp/src/orchestration/webhook-url.ts so the SDK, CLI,
 * and MCP server share one literal-host validation rule. Clockify will
 * POST event payloads to the callback URL we register, so a caller who
 * can choose that URL can coax Clockify into hitting internal targets
 * (cloud metadata endpoints, loopback admin panels, RFC-1918 hosts, ...).
 *
 * Scope: literal hosts only. We reject IP literals in private / loopback /
 * link-local / unique-local / reserved ranges (IPv4, IPv6, and IPv4-mapped
 * IPv6) plus localhost-ish hostnames. DNS-rebinding defence needs network
 * resolution and a resolve-then-pin transport, which is intentionally out
 * of scope for this offline guard.
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
            reason: `webhook URL must use https (got ${url.protocol.replace(/:$/, "") || "no"} scheme)`,
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
    if (host.length === 0) return "empty host";

    const ipv4Reason = classifyIpv4(host);
    if (ipv4Reason !== "not-ipv4") return ipv4Reason;

    const ipv6Reason = classifyIpv6(host);
    if (ipv6Reason !== "not-ipv6") return ipv6Reason;

    return classifyHostname(host);
}

function classifyHostname(host: string): string | null {
    const name = host.endsWith(".") ? host.slice(0, -1) : host;
    if (name === "localhost") return "loopback hostname";
    if (name.endsWith(".localhost")) return "loopback hostname";
    if (name.endsWith(".local")) return "mDNS/.local internal hostname";
    if (name.endsWith(".internal")) return ".internal hostname";
    if (name === "home.arpa" || name.endsWith(".home.arpa")) {
        return "RFC 8375 home network range (.home.arpa)";
    }
    if (name.endsWith(".lan")) return "internal network TLD (.lan)";
    if (name.endsWith(".corp")) return "internal network TLD (.corp)";
    if (name.endsWith(".intranet")) return "internal network TLD (.intranet)";
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

function ipv4Reason([a, b]: [number, number, number, number]): string | null {
    if (a === 0) return "reserved/unspecified range (0.0.0.0/8)";
    if (a === 127) return "loopback range (127.0.0.0/8)";
    if (a === 10) return "private range (10.0.0.0/8)";
    if (a === 172 && b >= 16 && b <= 31) return "private range (172.16.0.0/12)";
    if (a === 192 && b === 168) return "private range (192.168.0.0/16)";
    if (a === 169 && b === 254) return "link-local / cloud metadata range (169.254.0.0/16)";
    if (a === 100 && b >= 64 && b <= 127) return "carrier-grade NAT range (100.64.0.0/10)";
    return null;
}

function classifyIpv6(host: string): string | null {
    if (!host.includes(":")) return "not-ipv6";

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

function ipv6Reason(groups: number[]): string | null {
    if (groups.every((g) => g === 0)) return "unspecified address (::)";
    if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) {
        return "loopback address (::1)";
    }

    const isMapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
    if (isMapped) {
        const hi = groups[6]!;
        const lo = groups[7]!;
        const embedded = ipv4Reason([
            (hi >> 8) & 0xff,
            hi & 0xff,
            (lo >> 8) & 0xff,
            lo & 0xff,
        ]);
        if (embedded) return `IPv4-mapped IPv6 of a ${embedded}`;
        return null;
    }

    // NAT64 well-known prefix (64:ff9b::/96, RFC 6052): the low 32 bits embed an
    // IPv4 address, so an attacker can reach a private/metadata v4 through a
    // NAT64 gateway (e.g. 64:ff9b::a9fe:a9fe -> 169.254.169.254). Decode and
    // re-check exactly like the ::ffff: mapped branch above. A NAT64 address
    // embedding a public v4 stays allowed (ipv4Reason returns null).
    const isNat64 =
        groups[0] === 0x0064 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0);
    if (isNat64) {
        const hi = groups[6]!;
        const lo = groups[7]!;
        const embedded = ipv4Reason([(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff]);
        if (embedded) return `NAT64-embedded IPv4 of a ${embedded}`;
        return null;
    }

    const first = groups[0]!;
    const firstByte = (first >> 8) & 0xff;
    if (firstByte === 0xfc || firstByte === 0xfd) return "private unique-local range (fc00::/7)";
    if (first >= 0xfe80 && first <= 0xfebf) return "link-local range (fe80::/10)";

    return null;
}

function truncate(value: string): string {
    return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}
