import { resolveUserRef } from "../wrapper/resolve.js";

const HEX_NOT_IN_LIST = "999999999999999999999999";
const listUsers = async () => [
    { id: "000000000000000000000601", name: "Ada Lovelace" },
    // A user whose NAME happens to be exactly the hex id that was passed as an id:
    { id: "000000000000000000000602", name: HEX_NOT_IN_LIST },
];

const result = await resolveUserRef(
    { id: HEX_NOT_IN_LIST }, // unknown verified hex id, NO name given
    { verb: "assign", meUserId: "x", listUsers, trustIds: false },
);
console.log("result:", JSON.stringify(result, null, 2));

// Contrast: same unknown hex id WITH a name → clarifies (documented guard).
const result2 = await resolveUserRef(
    { id: HEX_NOT_IN_LIST, name: "Ada Lovelace" },
    { verb: "assign", meUserId: "x", listUsers, trustIds: false },
);
console.log("with name:", JSON.stringify(result2, null, 2));

// Contrast: resolveEntityRef's equivalent guard (verifyId) — no name needed.
const { resolveEntityRef } = await import("../wrapper/resolve.js");
const result3 = await resolveEntityRef(
    { id: HEX_NOT_IN_LIST },
    {
        noun: "project",
        verb: "open",
        list: async () => [{ id: "000000000000000000000601", name: HEX_NOT_IN_LIST }],
        verifyId: true,
    },
);
console.log("resolveEntityRef verifyId:", JSON.stringify(result3, null, 2));
