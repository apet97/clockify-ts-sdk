import { describe, expect, it } from "vitest";

import { pruneExpiredConfirmations } from "../src/remote/confirmations.js";
import type { QueryResult, SqlQueryable } from "../src/remote/types.js";

describe("expired confirmation cleanup", () => {
    it("uses one bounded skip-locked deletion", async () => {
        const database = new RecordingDatabase();

        await expect(pruneExpiredConfirmations(database, 400)).resolves.toBe(37);
        expect(database.text).toContain("LIMIT $1");
        expect(database.text).toContain("FOR UPDATE SKIP LOCKED");
        expect(database.values).toEqual([400]);
    });

    it.each([0, -1, 10_001, 1.5])("rejects invalid batch size %s", async (size) => {
        await expect(
            pruneExpiredConfirmations(new RecordingDatabase(), size),
        ).rejects.toThrow(/between 1 and 10000/u);
    });
});

class RecordingDatabase implements SqlQueryable {
    text = "";
    values: readonly unknown[] = [];

    async query<Row extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        values: readonly unknown[] = [],
    ): Promise<QueryResult<Row>> {
        this.text = text;
        this.values = values;
        return { rows: [], rowCount: 37 };
    }
}
