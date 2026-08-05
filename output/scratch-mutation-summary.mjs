import fs from "node:fs";
const r = JSON.parse(fs.readFileSync("/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/reports/mutation/mutation.json", "utf8"));
let surv = 0, tot = 0;
for (const [f, info] of Object.entries(r.files)) {
    tot += info.mutants.length;
    const sv = info.mutants.filter((m) => m.status === "Survived");
    surv += sv.length;
    console.log(f.split("/").pop(), "mutants:", info.mutants.length, "survived:", sv.length);
    for (const m of sv) {
        console.log("   ", m.id, m.mutatorName, "->", JSON.stringify(m.replacement).slice(0, 160), "loc:", JSON.stringify(m.location).slice(0, 120));
    }
}
console.log("TOTAL survived:", surv, "of", tot);
