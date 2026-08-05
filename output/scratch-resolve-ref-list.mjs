import { resolveGroupRefs, resolveUserRefs } from "../wrapper/resolve.js";

const HEX_NOT_IN_LIST = "999999999999999999999999";
const groups = [
    { id: "g1", name: "Devs" },
    { id: "g2", name: HEX_NOT_IN_LIST }, // group named exactly like the hex id
];
const r1 = await resolveGroupRefs([HEX_NOT_IN_LIST], { verb: "add", listGroups: async () => groups });
console.log("resolveGroupRefs([hex-unknown]):", JSON.stringify(r1));

const users = [
    { id: "u1", name: "Alice" },
    { id: "u2", name: HEX_NOT_IN_LIST },
];
const r2 = await resolveUserRefs([HEX_NOT_IN_LIST], { verb: "assign", meUserId: "x", listUsers: async () => users, verifyIds: true });
console.log("resolveUserRefs([hex-unknown], verifyIds):", JSON.stringify(r2));
