const forms = [
    "http://127.1/",
    "http://127.0.1/",
    "http://0177.0.0.1/",
    "http://0x7f.0.0.1/",
    "http://2130706433/",
    "http://127.0.0.1/",
    "http://0x7f000001/",
    "http://017700000001/",
    "http://127.0.0.1../",
    "http://127.0.0.1.../",
    "http://127.0.0.1./",
    "http://2130706433./",
    "http://0x7f.1/",
    "http://0177.1/",
    "http://①②⑦.0.0.1/",
    "http://127.0.0.1%2e/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/",
    "http://[::127.0.0.1]/",
    "http://[0:0:0:0:0:ffff:127.0.0.1]/",
    "http://[2002:7f00:0001::]/",
];
for (const f of forms) {
    try {
        const u = new URL(f);
        console.log(JSON.stringify(f), "=> hostname:", JSON.stringify(u.hostname), "href:", u.href);
    } catch (e) {
        console.log(JSON.stringify(f), "=> THROWS", e.constructor.name);
    }
}
