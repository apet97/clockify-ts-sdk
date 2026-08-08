import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { assertSafeWebhookUrl, validateWebhookUrl } from "../webhook-url.js";

const octet = fc.integer({ min: 0, max: 255 });
const ipv4 = fc.tuple(octet, octet, octet, octet);

function dotted(parts: readonly number[]): string {
    return parts.join(".");
}

// Mirrors every range `classifyIpv4` in ../webhook-url.ts rejects. It must stay
// complete, not merely representative: the "accepts public IPv4" property below
// generates any address this returns false for and asserts the guard allows it,
// so a range the guard blocks and this omits is a random-seed time bomb. That is
// how 198.18.0.0/15 surfaced — after this oracle had shipped without it.
function isBlockedIpv4([a, b, c]: readonly [number, number, number, number]): boolean {
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 169 && b === 254) ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 64 && b === 0 && c === 0) ||
        (a === 192 && b === 0 && c === 0) ||
        (a === 192 && b === 0 && c === 2) ||
        (a === 192 && b === 88 && c === 99) ||
        (a === 192 && ((b === 31 && c === 196) || (b === 52 && c === 193) || (b === 175 && c === 48))) ||
        (a === 198 && (b === 18 || b === 19)) ||
        (a === 198 && b === 51 && c === 100) ||
        (a === 203 && b === 0 && c === 113) ||
        // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.255.255.255 broadcast.
        a >= 224
    );
}

const blockedFamilies = fc.oneof(
    fc.tuple(fc.constant(127), octet, octet, octet),
    fc.tuple(fc.constant(10), octet, octet, octet),
    fc.tuple(fc.constant(172), fc.integer({ min: 16, max: 31 }), octet, octet),
    fc.tuple(fc.constant(192), fc.constant(168), octet, octet),
    fc.tuple(fc.constant(169), fc.constant(254), octet, octet),
    fc.tuple(fc.constant(100), fc.integer({ min: 64, max: 127 }), octet, octet),
    fc.tuple(fc.constant(0), octet, octet, octet),
    // 224-255 first octet: multicast (224-239), reserved (240-254), broadcast (255).
    fc.tuple(fc.integer({ min: 224, max: 255 }), octet, octet, octet),
);

describe("webhook URL validation properties", () => {
    it("rejects every blocked IPv4 family", () => {
        fc.assert(
            fc.property(blockedFamilies, (parts) => {
                expect(validateWebhookUrl(`https://${dotted(parts)}/hook`).ok).toBe(false);
            }),
        );
    });

    it("accepts public IPv4 literals not in the blocked families", () => {
        fc.assert(
            fc.property(
                ipv4.filter((parts) => !isBlockedIpv4(parts)),
                (parts) => {
                    expect(validateWebhookUrl(`https://${dotted(parts)}/hook`).ok).toBe(true);
                },
            ),
        );
    });

    it("rejects unsafe IPv6 literals and IPv4-mapped unsafe literals", () => {
        fc.assert(
            fc.property(
                fc.constantFrom(
                    "::",
                    "::1",
                    "fc00::1",
                    "fd12:3456::1",
                    "fe80::1",
                    "::ffff:127.0.0.1",
                    "::ffff:169.254.169.254",
                    "64:ff9b::a9fe:a9fe",
                    "64:ff9b::7f00:1",
                    // 6to4 (2002::/16) embedding a private/metadata v4.
                    "2002:a9fe:a9fe::",
                    "2002:7f00:1::",
                    // IPv4-compatible (::/96) embedding a private/metadata v4.
                    "::a9fe:a9fe",
                    "::7f00:1",
                    // ff00::/8 multicast (link-local all-nodes + global).
                    "ff02::1",
                    "ff0e::1",
                ),
                (host) => {
                    expect(validateWebhookUrl(`https://[${host}]/hook`).ok).toBe(false);
                },
            ),
        );
    });

    it("rejects special-purpose IPv6 embeddings even when the embedded v4 is public", () => {
        // A public embedded IPv4 does not make the enclosing 6to4 or deprecated
        // IPv4-compatible address ordinary global-unicast space.
        fc.assert(
            fc.property(fc.constantFrom("2002:808:808::", "::808:808"), (host) => {
                expect(validateWebhookUrl(`https://[${host}]/hook`).ok).toBe(false);
            }),
        );
    });

    it("rejects non-HTTPS schemes regardless of host", () => {
        fc.assert(
            fc.property(fc.constantFrom("http", "ws", "ftp", "gopher", "file"), (scheme) => {
                expect(validateWebhookUrl(`${scheme}://example.com/hook`).ok).toBe(false);
            }),
        );
    });

    it("rejects embedded credentials", () => {
        fc.assert(
            fc.property(fc.constantFrom("user:pass@", "user@"), (credentials) => {
                expect(validateWebhookUrl(`https://${credentials}example.com/hook`).ok).toBe(false);
            }),
        );
    });

    it("rejects internal hostname suffixes with or without trailing dot", () => {
        fc.assert(
            fc.property(
                fc.constantFrom(
                    "localhost",
                    "x.localhost",
                    "a.local",
                    "b.internal",
                    "c.lan",
                    "d.corp",
                    "e.intranet",
                    "home.arpa",
                    "x.home.arpa",
                ),
                fc.boolean(),
                (host, trailingDot) => {
                    expect(validateWebhookUrl(`https://${host}${trailingDot ? "." : ""}/hook`).ok).toBe(
                        false,
                    );
                },
            ),
        );
    });

    it("assertSafeWebhookUrl throws exactly when validateWebhookUrl rejects", () => {
        fc.assert(
            fc.property(
                fc.oneof(
                    fc.webUrl({ validSchemes: ["https"] }),
                    fc.webUrl({ validSchemes: ["http", "ftp", "ws"] }),
                    fc.string(),
                ),
                (candidate) => {
                    const result = validateWebhookUrl(candidate);
                    if (result.ok) {
                        expect(() => assertSafeWebhookUrl(candidate)).not.toThrow();
                    } else {
                        expect(() => assertSafeWebhookUrl(candidate)).toThrow(result.reason);
                    }
                },
            ),
        );
    });
});
