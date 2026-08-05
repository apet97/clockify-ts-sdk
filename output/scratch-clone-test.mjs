// Empirical check: can a Request be cloned repeatedly (as composed-fetch's
// retry path does), or does the second clone() throw?
const r = new Request("https://example.com/api", { method: "POST", body: "hello-body" });
try {
    const c0 = r.clone(); // eager clone
    console.log("clone #1 (eager): OK");
    const c1 = r.clone(); // attempt 0
    console.log("clone #2 (attempt 0): OK");
    const c2 = r.clone(); // attempt 1
    console.log("clone #3 (attempt 1): OK");
} catch (e) {
    console.log("clone threw:", e.constructor.name, "-", e.message);
}
