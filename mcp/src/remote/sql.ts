import type { SqlConnection, SqlPool } from "./types.js";

export async function withTransaction<T>(
    pool: SqlPool,
    run: (connection: SqlConnection) => Promise<T>,
): Promise<T> {
    const connection = await pool.connect();
    try {
        await connection.query("BEGIN");
        const result = await run(connection);
        await connection.query("COMMIT");
        return result;
    } catch (error) {
        try {
            await connection.query("ROLLBACK");
        } catch {
            // Preserve the owning transaction failure.
        }
        throw error;
    } finally {
        connection.release();
    }
}
