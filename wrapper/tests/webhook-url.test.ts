import { describe, expect, it } from "vitest";

import { assertSafeWebhookUrl, validateWebhookUrl } from "../webhook-url.js";

describe("validateWebhookUrl", () => {
    it("accepts normal public HTTPS URLs", () => {
        expect(validateWebhookUrl("https://example.com/hook").ok).toBe(true);
        expect(validateWebhookUrl("https://hooks.example.com:8443/clockify?x=1").ok).toBe(true);
    });

    const nonHttps = [
        "http://example.com/hook",
        "ftp://example.com/hook",
        "ws://example.com/hook",
        "file:///etc/passwd",
    ];
    for (const candidate of nonHttps) {
        it(`rejects non-HTTPS scheme: ${candidate}`, () => {
            const result = validateWebhookUrl(candidate);
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.reason).toMatch(/https/i);
        });
    }

    it("rejects malformed URLs and embedded credentials", () => {
        expect(validateWebhookUrl("not a url").ok).toBe(false);
        const credentials = validateWebhookUrl("https://user:pass@example.com/hook");
        expect(credentials.ok).toBe(false);
        if (!credentials.ok) expect(credentials.reason).toMatch(/credential/i);
    });

    const privateIpv4 = [
        "https://0.0.0.0/hook",
        "https://10.0.0.1/hook",
        "https://100.64.0.1/hook",
        "https://127.0.0.1/hook",
        "https://169.254.169.254/hook",
        "https://172.16.0.1/hook",
        "https://192.168.1.1/hook",
    ];
    for (const candidate of privateIpv4) {
        it(`rejects private/reserved IPv4: ${candidate}`, () => {
            const result = validateWebhookUrl(candidate);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.reason).toMatch(/private|loopback|metadata|reserved|nat/i);
            }
        });
    }

    it("accepts routable public IPv4 literals", () => {
        expect(validateWebhookUrl("https://8.8.8.8/hook").ok).toBe(true);
        expect(validateWebhookUrl("https://172.32.0.1/hook").ok).toBe(true);
        expect(validateWebhookUrl("https://100.63.255.255/hook").ok).toBe(true);
    });

    const privateIpv6 = [
        "https://[::]/hook",
        "https://[::1]/hook",
        "https://[fc00::1]/hook",
        "https://[fd12:3456::1]/hook",
        "https://[fe80::1]/hook",
        "https://[::ffff:127.0.0.1]/hook",
        "https://[::ffff:10.0.0.1]/hook",
        "https://[::ffff:169.254.169.254]/hook",
    ];
    for (const candidate of privateIpv6) {
        it(`rejects private/reserved IPv6: ${candidate}`, () => {
            const result = validateWebhookUrl(candidate);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.reason).toMatch(/private|loopback|link-local|unspecified|metadata/i);
            }
        });
    }

    it("accepts routable public IPv6 literals", () => {
        expect(validateWebhookUrl("https://[2606:4700:4700::1111]/hook").ok).toBe(true);
        // first group 0xfec0 sits just ABOVE the fe80::/10 link-local band (<=0xfebf),
        // so it must be accepted — kills the ConditionalExpression->true mutant at
        // webhook-url.ts:189.
        expect(validateWebhookUrl("https://[fec0::1]/hook").ok).toBe(true);
        // 0xfebf is the EXACT top of the fe80::/10 band, so it must be REJECTED.
        // This pins the inclusive upper bound and kills the EqualityOperator
        // mutant (<=0xfebf -> <0xfebf) at webhook-url.ts:189, which [fec0::1]
        // alone cannot distinguish (both <= and < are false for 0xfec0).
        expect(validateWebhookUrl("https://[febf::1]/hook").ok).toBe(false);
    });

    const internalNames = [
        "https://localhost/hook",
        "https://api.localhost/hook",
        "https://service.local/hook",
        "https://db.internal/hook",
        "https://host.internal./hook",
        "https://printer.home.arpa/hook",
        "https://nas.lan/hook",
        "https://intranet.corp/hook",
        "https://wiki.intranet/hook",
    ];
    for (const candidate of internalNames) {
        it(`rejects internal hostname: ${candidate}`, () => {
            const result = validateWebhookUrl(candidate);
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.reason).toMatch(/localhost|internal|home network|TLD|\.local/i);
        });
    }
});

describe("assertSafeWebhookUrl", () => {
    it("returns the normalized URL for a public HTTPS host", () => {
        const url = assertSafeWebhookUrl("https://example.com/hook");
        expect(url.protocol).toBe("https:");
        expect(url.hostname).toBe("example.com");
    });

    it("throws for an unsafe host", () => {
        expect(() => assertSafeWebhookUrl("https://10.0.0.1/hook")).toThrow(
            /private|loopback|reserved|internal/i,
        );
    });
});
