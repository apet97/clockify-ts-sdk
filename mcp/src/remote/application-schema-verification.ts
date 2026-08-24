import {
    APPLICATION_COLUMNS,
    APPLICATION_CONSTRAINTS,
    CRITICAL_INDEXES,
    type ApplicationTable,
    type ConstraintSpec,
} from "./application-schema-contract.js";
import type { SqlConnection } from "./types.js";

interface ApplicationColumn extends Record<string, unknown> {
    table_name: string;
    column_name: string;
    data_type: string;
    character_maximum_length: number | null;
    is_nullable: string;
    column_default: string | null;
}

interface ApplicationConstraint extends Record<string, unknown> {
    table_name: string;
    constraint_type: "p" | "u" | "f" | "c";
    columns: string[];
    referenced_table: string | null;
    referenced_in_current_schema: boolean;
    referenced_columns: string[];
    delete_action: string;
    definition: string;
    is_validated: boolean;
    is_deferrable: boolean;
    is_deferred: boolean;
    backing_index_valid: boolean;
}

interface ApplicationIndex extends Record<string, unknown> {
    table_name: string;
    index_name: string;
    method: string;
    is_unique: boolean;
    is_valid: boolean;
    is_ready: boolean;
    key_attribute_count: number;
    attribute_count: number;
    columns: string[];
    predicate: string | null;
    expressions: string | null;
}

export async function validateApplicationSchema(connection: SqlConnection): Promise<void> {
    const tables = Object.keys(APPLICATION_COLUMNS) as ApplicationTable[];
    const columns = await connection.query<ApplicationColumn>(
        `SELECT table_name, column_name, data_type, character_maximum_length,
                is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = ANY($1::text[])
          ORDER BY table_name, ordinal_position`,
        [tables],
    );
    assertApplicationColumns(columns.rows);

    const constraints = await connection.query<ApplicationConstraint>(
        `SELECT relation.relname AS table_name,
                constraint_record.contype AS constraint_type,
                ARRAY(
                    SELECT attribute.attname::text
                      FROM unnest(constraint_record.conkey) WITH ORDINALITY
                           AS key_column(attnum, position)
                      JOIN pg_attribute AS attribute
                        ON attribute.attrelid = constraint_record.conrelid
                       AND attribute.attnum = key_column.attnum
                     ORDER BY key_column.position
                ) AS columns,
                referenced_relation.relname AS referenced_table,
                CASE WHEN constraint_record.contype = 'f'
                     THEN referenced_namespace.nspname = current_schema()
                     ELSE true END AS referenced_in_current_schema,
                CASE WHEN constraint_record.contype = 'f' THEN ARRAY(
                    SELECT attribute.attname::text
                      FROM unnest(constraint_record.confkey) WITH ORDINALITY
                           AS key_column(attnum, position)
                      JOIN pg_attribute AS attribute
                        ON attribute.attrelid = constraint_record.confrelid
                       AND attribute.attnum = key_column.attnum
                     ORDER BY key_column.position
                ) ELSE ARRAY[]::text[] END AS referenced_columns,
                constraint_record.confdeltype AS delete_action,
                pg_get_constraintdef(constraint_record.oid, false) AS definition,
                constraint_record.convalidated AS is_validated,
                constraint_record.condeferrable AS is_deferrable,
                constraint_record.condeferred AS is_deferred,
                CASE WHEN constraint_record.contype IN ('p', 'u')
                     THEN coalesce(backing_index.indisvalid AND backing_index.indisready, false)
                     ELSE true END AS backing_index_valid
           FROM pg_constraint AS constraint_record
           JOIN pg_class AS relation
             ON relation.oid = constraint_record.conrelid
           JOIN pg_namespace AS namespace
             ON namespace.oid = relation.relnamespace
           LEFT JOIN pg_class AS referenced_relation
             ON referenced_relation.oid = constraint_record.confrelid
           LEFT JOIN pg_namespace AS referenced_namespace
             ON referenced_namespace.oid = referenced_relation.relnamespace
           LEFT JOIN pg_index AS backing_index
             ON backing_index.indexrelid = constraint_record.conindid
          WHERE namespace.nspname = current_schema()
            AND relation.relname = ANY($1::text[])
            AND constraint_record.contype IN ('p', 'u', 'f', 'c')
          ORDER BY relation.relname, constraint_record.contype, constraint_record.conname`,
        [tables],
    );
    assertApplicationConstraints(constraints.rows);

    const indexNames = Object.keys(CRITICAL_INDEXES);
    const indexes = await connection.query<ApplicationIndex>(
        `SELECT relation.relname AS table_name,
                index_relation.relname AS index_name,
                access_method.amname AS method,
                index_record.indisunique AS is_unique,
                index_record.indisvalid AS is_valid,
                index_record.indisready AS is_ready,
                index_record.indnkeyatts AS key_attribute_count,
                index_record.indnatts AS attribute_count,
                ARRAY(
                    SELECT attribute.attname::text
                      FROM unnest(index_record.indkey) WITH ORDINALITY
                           AS key_column(attnum, position)
                      JOIN pg_attribute AS attribute
                        ON attribute.attrelid = index_record.indrelid
                       AND attribute.attnum = key_column.attnum
                     WHERE key_column.position <= index_record.indnkeyatts
                     ORDER BY key_column.position
                ) AS columns,
                pg_get_expr(index_record.indpred, index_record.indrelid) AS predicate,
                pg_get_expr(index_record.indexprs, index_record.indrelid) AS expressions
           FROM pg_index AS index_record
           JOIN pg_class AS relation
             ON relation.oid = index_record.indrelid
           JOIN pg_namespace AS namespace
             ON namespace.oid = relation.relnamespace
           JOIN pg_class AS index_relation
             ON index_relation.oid = index_record.indexrelid
           JOIN pg_am AS access_method
             ON access_method.oid = index_relation.relam
          WHERE namespace.nspname = current_schema()
            AND index_relation.relname = ANY($1::text[])
          ORDER BY index_relation.relname`,
        [indexNames],
    );
    assertCriticalIndexes(indexes.rows);
}

function assertApplicationColumns(rows: readonly ApplicationColumn[]): void {
    const expected = new Map<string, string>();
    for (const [table, columns] of Object.entries(APPLICATION_COLUMNS)) {
        for (const [name, [type, nullable, defaultValue]] of Object.entries(columns)) {
            expected.set(`${table}.${name}`, columnSignature(type, nullable, defaultValue ?? null));
        }
    }

    const actual = new Map<string, string>();
    for (const row of rows) {
        if (
            typeof row.table_name !== "string" ||
            typeof row.column_name !== "string" ||
            typeof row.data_type !== "string" ||
            (row.character_maximum_length !== null &&
                !Number.isSafeInteger(row.character_maximum_length)) ||
            (row.is_nullable !== "YES" && row.is_nullable !== "NO") ||
            (row.column_default !== null && typeof row.column_default !== "string")
        ) {
            throw malformedApplicationSchema("column catalog returned malformed data");
        }
        const key = `${row.table_name}.${row.column_name}`;
        if (actual.has(key)) {
            throw malformedApplicationSchema(`column ${key} is duplicated`);
        }
        const type =
            row.character_maximum_length === null
                ? row.data_type
                : `${row.data_type}(${row.character_maximum_length})`;
        actual.set(key, columnSignature(type, row.is_nullable === "YES", row.column_default));
    }
    assertExactInventory("column", expected, actual);
}

function assertApplicationConstraints(rows: readonly ApplicationConstraint[]): void {
    const expectedSignatures: string[] = [];
    for (const constraint of APPLICATION_CONSTRAINTS) {
        expectedSignatures.push(constraintSignature(constraint));
    }
    const expected = countedInventory(expectedSignatures);

    const actualSignatures: string[] = [];
    for (const constraint of rows) {
        if (
            !isApplicationTable(constraint.table_name) ||
            !["p", "u", "f", "c"].includes(constraint.constraint_type) ||
            !isStringArray(constraint.columns) ||
            !isStringArray(constraint.referenced_columns) ||
            (constraint.referenced_table !== null &&
                typeof constraint.referenced_table !== "string") ||
            typeof constraint.referenced_in_current_schema !== "boolean" ||
            typeof constraint.delete_action !== "string" ||
            typeof constraint.definition !== "string" ||
            typeof constraint.is_validated !== "boolean" ||
            typeof constraint.is_deferrable !== "boolean" ||
            typeof constraint.is_deferred !== "boolean" ||
            typeof constraint.backing_index_valid !== "boolean"
        ) {
            throw malformedApplicationSchema("constraint catalog returned malformed data");
        }
        if (
            !constraint.is_validated ||
            !constraint.referenced_in_current_schema ||
            constraint.is_deferrable ||
            constraint.is_deferred ||
            !constraint.backing_index_valid
        ) {
            throw malformedApplicationSchema(
                `constraint on ${constraint.table_name} is not fully enforced`,
            );
        }
        actualSignatures.push(
            constraintSignature({
                table: constraint.table_name,
                type: constraint.constraint_type,
                columns: constraint.columns,
                ...(constraint.constraint_type === "f"
                    ? {
                          referencedTable: requireApplicationTable(constraint.referenced_table),
                          referencedColumns: constraint.referenced_columns,
                          deleteAction: requireCascade(constraint.delete_action),
                      }
                    : {}),
                ...(constraint.constraint_type === "c"
                    ? { definition: constraint.definition }
                    : {}),
            }),
        );
    }
    const actual = countedInventory(actualSignatures);
    assertExactCounts("constraint", expected, actual);
}

function assertCriticalIndexes(rows: readonly ApplicationIndex[]): void {
    const expectedNames = new Set(Object.keys(CRITICAL_INDEXES));
    const found = new Set<string>();
    for (const row of rows) {
        if (
            typeof row.index_name !== "string" ||
            !isApplicationTable(row.table_name) ||
            typeof row.method !== "string" ||
            typeof row.is_unique !== "boolean" ||
            typeof row.is_valid !== "boolean" ||
            typeof row.is_ready !== "boolean" ||
            !Number.isSafeInteger(row.key_attribute_count) ||
            !Number.isSafeInteger(row.attribute_count) ||
            !isStringArray(row.columns) ||
            (row.predicate !== null && typeof row.predicate !== "string") ||
            (row.expressions !== null && typeof row.expressions !== "string")
        ) {
            throw malformedApplicationSchema("index catalog returned malformed data");
        }
        if (!expectedNames.has(row.index_name) || found.has(row.index_name)) {
            throw malformedApplicationSchema(`index ${row.index_name} is unexpected`);
        }
        const expected = CRITICAL_INDEXES[row.index_name as keyof typeof CRITICAL_INDEXES];
        if (
            row.table_name !== expected.table ||
            row.method !== "btree" ||
            row.is_unique ||
            !row.is_valid ||
            !row.is_ready ||
            row.key_attribute_count !== expected.columns.length ||
            row.attribute_count !== expected.columns.length ||
            row.predicate !== null ||
            row.expressions !== null ||
            row.columns.join("\0") !== expected.columns.join("\0")
        ) {
            throw malformedApplicationSchema(`index ${row.index_name} is malformed`);
        }
        found.add(row.index_name);
    }
    for (const name of expectedNames) {
        if (!found.has(name)) {
            throw malformedApplicationSchema(`index ${name} is missing`);
        }
    }
}

function constraintSignature(constraint: ConstraintSpec): string {
    const columns = constraint.columns?.join(",") ?? "";
    switch (constraint.type) {
        case "p":
        case "u":
            return `${constraint.table}|${constraint.type}|${columns}`;
        case "f":
            return `${constraint.table}|f|${columns}|${constraint.referencedTable ?? ""}|${constraint.referencedColumns?.join(",") ?? ""}|${constraint.deleteAction ?? ""}`;
        case "c":
            return `${constraint.table}|c|${normalizeCatalogSql(constraint.definition ?? "")}`;
    }
}

function columnSignature(type: string, nullable: boolean, defaultValue: string | null): string {
    return `${type}|${nullable ? "nullable" : "required"}|${defaultValue === null ? "none" : normalizeCatalogSql(defaultValue)}`;
}

function normalizeCatalogSql(value: string): string {
    const literals: string[] = [];
    const protectedValue = value.replace(/'(?:''|[^'])*'/gu, (literal) => {
        const marker = `\u0000${literals.length}\u0000`;
        literals.push(literal);
        return marker;
    });
    if (protectedValue.includes("'")) {
        throw malformedApplicationSchema("constraint catalog contains malformed SQL");
    }
    const normalized = protectedValue
        .toLowerCase()
        .replaceAll('"', "")
        .replace(/\s+/gu, "")
        .replace(/::(?:text|charactervarying|bigint|integer)/gu, "")
        .replace(/=any\(array\[(.*?)\]\)/gu, "in($1)")
        .replace(/[()]/gu, "");
    return normalized.replace(/\u0000(\d+)\u0000/gu, (_marker, index: string) => {
        const literal = literals[Number(index)];
        if (literal === undefined) {
            throw malformedApplicationSchema("constraint catalog contains malformed SQL");
        }
        return literal;
    });
}

function countedInventory(values: readonly string[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return counts;
}

function assertExactInventory(
    kind: string,
    expected: ReadonlyMap<string, string>,
    actual: ReadonlyMap<string, string>,
): void {
    for (const [key, signature] of expected) {
        if (actual.get(key) !== signature) {
            throw malformedApplicationSchema(`${kind} ${key} is missing or malformed`);
        }
    }
    for (const key of actual.keys()) {
        if (!expected.has(key)) {
            throw malformedApplicationSchema(`${kind} ${key} is unexpected`);
        }
    }
}

function assertExactCounts(
    kind: string,
    expected: ReadonlyMap<string, number>,
    actual: ReadonlyMap<string, number>,
): void {
    for (const [signature, count] of expected) {
        if (actual.get(signature) !== count) {
            throw malformedApplicationSchema(`${kind} ${signature} is missing or malformed`);
        }
    }
    for (const signature of actual.keys()) {
        if (!expected.has(signature)) {
            throw malformedApplicationSchema(`${kind} ${signature} is unexpected`);
        }
    }
}

function isApplicationTable(value: unknown): value is ApplicationTable {
    return (
        value === "mcp_principals" || value === "mcp_credentials" || value === "mcp_confirmations"
    );
}

function requireApplicationTable(value: string | null): ApplicationTable {
    if (!isApplicationTable(value)) {
        throw malformedApplicationSchema("foreign-key target is malformed");
    }
    return value;
}

function requireCascade(value: string): "c" {
    if (value !== "c") {
        throw malformedApplicationSchema("foreign-key delete action is malformed");
    }
    return value;
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function malformedApplicationSchema(detail: string): Error {
    return new Error(
        `database application schema is malformed (${detail}); restore it from a trusted backup`,
    );
}
