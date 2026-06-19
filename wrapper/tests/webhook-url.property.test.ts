import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { assertSafeWebhookUrl, validateWebhookUrl } from "../webhook-url.js";

const octet = fc.integer({ min: 0, max: 255 });
const ipv4 = fc.tuple(octet, octet, octet, octet);

function dotted(parts: readonly number[]): string {
    return parts.join(".");
}

function isBlockedIpv4([a, b]: readonly [number, number, number, number]): boolean {
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 169 && b === 254) ||
        (a === 100 && b >= 64 && b <= 127)
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
                ),
                (host) => {
                    expect(validateWebhookUrl(`https://[${host}]/hook`).ok).toBe(false);
                },
            ),
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
