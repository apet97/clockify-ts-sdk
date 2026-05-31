import { describe, expect, it } from "vitest";

import { assertSafeWebhookUrl, validateWebhookUrl } from "../src/orchestration/webhook-url.js";

// These tests exercise the offline SSRF guard for the webhook setup path.
// DNS-rebinding is intentionally out of scope (no network in this guard);
// the validator works on the literal URL host only.

describe("validateWebhookUrl", () => {
    it("accepts a normal public HTTPS URL", () => {
        const result = validateWebhookUrl("https://example.com/hook");
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.url.hostname).toBe("example.com");
    });

    it("accepts a public HTTPS URL with a path, query, and port", () => {
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

    it("rejects an unparseable URL", () => {
        const result = validateWebhookUrl("not a url");
        expect(result.ok).toBe(false);
    });

    it("rejects URLs that embed credentials", () => {
        const result = validateWebhookUrl("https://user:pass@example.com/hook");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toMatch(/credential/i);
    });

    const privateIpv4 = [
        "https://127.0.0.1/hook", // loopback
        "https://127.5.6.7/hook", // 127.0.0.0/8
        "https://10.0.0.1/hook", // 10.0.0.0/8
        "https://10.255.255.255/hook",
        "https://172.16.0.1/hook", // 172.16.0.0/12
        "https://172.31.255.255/hook",
        "https://192.168.1.1/hook", // 192.168.0.0/16
        "https://169.254.169.254/hook", // link-local / cloud metadata
        "https://0.0.0.0/hook", // unspecified
        "https://100.64.0.1/hook", // CGNAT 100.64.0.0/10
        "https://100.127.255.255/hook",
    ];
    for (const candidate of privateIpv4) {
        it(`rejects private/loopback/link-local IPv4: ${candidate}`, () => {
            const result = validateWebhookUrl(candidate);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.reason).toMatch(/private|loopback|link-local|internal|metadata|reserved|nat/i);
            }
        });
    }

    it("accepts a routable public IPv4 literal", () => {
        // 172.32.x is just outside the 172.16.0.0/12 private block.
        expect(validateWebhookUrl("https://172.32.0.1/hook").ok).toBe(true);
        expect(validateWebhookUrl("https://8.8.8.8/hook").ok).toBe(true);
        expect(validateWebhookUrl("https://100.63.255.255/hook").ok).toBe(true);
    });

    const privateIpv6 = [
        "https://[::1]/hook", // loopback
        "https://[::]/hook", // unspecified
        "https://[fc00::1]/hook", // ULA fc00::/7
        "https://[fd12:3456::1]/hook", // ULA
        "https://[fe80::1]/hook", // link-local fe80::/10
        "https://[::ffff:127.0.0.1]/hook", // IPv4-mapped loopback
        "https://[::ffff:10.0.0.1]/hook", // IPv4-mapped private
        "https://[::ffff:169.254.169.254]/hook", // IPv4-mapped metadata
    ];
    for (const candidate of privateIpv6) {
        it(`rejects private/loopback/link-local IPv6: ${candidate}`, () => {
            const result = validateWebhookUrl(candidate);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.reason).toMatch(/private|loopback|link-local|internal|reserved|unspecified|nat/i);
            }
        });
    }

    it("accepts a routable public IPv6 literal", () => {
        expect(validateWebhookUrl("https://[2606:4700:4700::1111]/hook").ok).toBe(true);
    });

    const localishNames = [
        "https://localhost/hook",
        "https://LOCALHOST/hook",
        "https://api.localhost/hook",
        "https://service.local/hook",
        "https://db.internal/hook",
        "https://host.internal./hook", // trailing dot
    ];
    for (const candidate of localishNames) {
        it(`rejects localhost-ish hostname: ${candidate}`, () => {
            const result = validateWebhookUrl(candidate);
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.reason).toMatch(/localhost|internal|\.local/i);
        });
    }

    it("names the rejected host in the reason", () => {
        const result = validateWebhookUrl("https://169.254.169.254/latest/meta-data");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toContain("169.254.169.254");
    });
});

describe("assertSafeWebhookUrl", () => {
    it("returns the normalized URL for a public HTTPS host", () => {
        const url = assertSafeWebhookUrl("https://example.com/hook");
        expect(url.protocol).toBe("https:");
        expect(url.hostname).toBe("example.com");
    });

    it("throws for a private host", () => {
        expect(() => assertSafeWebhookUrl("https://10.0.0.1/hook")).toThrow(/private|loopback|reserved|internal/i);
    });

    it("throws for a non-HTTPS scheme", () => {
        expect(() => assertSafeWebhookUrl("http://example.com/hook")).toThrow(/https/i);
    });
});
