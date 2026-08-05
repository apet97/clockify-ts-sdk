import { classifyClockifyBaseUrl, CLOCKIFY_PROD_HOSTS } from "../wrapper/internal/authenticated-boundary-fetch.js";

const candidates = [
    "https://api.clockify.me/v1/workspaces",
    "https://api.clockify.me./v1/workspaces",
    "https://api.clockify.me../v1/workspaces",
    "https://API.Clockify.ME/v1",
    "https://api.clockify.me.evil.com/v1",
    "https://evil.com.clockify.me/v1",
    "https://sub.clockify.me/v1",
    "https://a.b.clockify.me/v1",
    "https://clockify.me/v1",
    "https://my_ws.clockify.me/v1",
    "https://my-ws.clockify.me/v1",
    "https://api.clockify.me%2eevil.com/v1",
    "https://api.clockify.me@evil.com/v1",
    "http://api.clockify.me/v1",
    "http://localhost:8080/v1",
    "https://localhost/v1",
    "https://127.0.0.1/v1",
    "https://[::1]/v1",
    "https://[::ffff:7f00:1]/v1",
    "https://0x7f000001/v1",
    "https://2130706433/v1",
    "https://127.1/v1",
    "https://0177.0.0.1/v1",
    "https://api.clockify.me:443/v1",
    "https://api.clockify.me:8443/v1",
    "https://user:pass@api.clockify.me/v1",
    "https://api.clockify.me./v1",
    "https://%61pi.clockify.me/v1",
    "https://xn--api.clockify.me/v1",
    "https://euc1.clockify.me/v1",
    "https://pto.api.clockify.me/v1",
    "https://api.clockify.me.evil.com./v1",
    "https://sub.clockify.me.evil.com/v1",
    "https://api.clockify.me:badport/v1",
    "https://foo.clockify.me:443/",
    "https://-bad.clockify.me/v1",
    "https://bad-.clockify.me/v1",
    "https://a..b.clockify.me/v1",
];
for (const c of candidates) {
    const r = classifyClockifyBaseUrl(c);
    console.log((r.allowed ? "ALLOW " : "DENY  ") + JSON.stringify(c), "=>", r.category, r.host ?? "", r.allowed ? "" : "(" + r.reason + ")");
}
console.log("--- prod hosts:", [...CLOCKIFY_PROD_HOSTS].join(", "));
