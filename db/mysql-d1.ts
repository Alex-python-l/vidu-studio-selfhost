import mysql, {
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";

type D1ResultLike<T = Record<string, unknown>> = {
  success: true;
  results: T[];
  meta: {
    changes: number;
    last_row_id: number;
    duration: number;
  };
};

let pool: Pool | undefined;

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error("DATABASE_URL is required for the MySQL runtime.");
  }
  return new URL(value);
}

function databasePool() {
  if (pool) return pool;
  const url = databaseUrl();
  if (url.protocol !== "mysql:") {
    throw new Error("DATABASE_URL must use the mysql:// protocol.");
  }
  pool = mysql.createPool({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    charset: "utf8mb4",
    timezone: "Z",
    dateStrings: true,
    decimalNumbers: true,
    waitForConnections: true,
    connectionLimit: Number(process.env.DATABASE_POOL_SIZE || 10),
    maxIdle: 4,
    idleTimeout: 60_000,
    enableKeepAlive: true,
  });
  return pool;
}

function normalizeInput(value: unknown) {
  if (value instanceof Date) return mysqlDate(value.toISOString());
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  ) {
    return mysqlDate(value);
  }
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  return value;
}

function mysqlDate(value: string) {
  return value.replace("T", " ").replace(/Z$/, "");
}

function normalizeOutput(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
  ) {
    return `${value.replace(" ", "T")}Z`;
  }
  return value;
}

function normalizeRow(row: RowDataPacket) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, normalizeOutput(value)]),
  );
}

function translateSql(source: string) {
  let sql = source.trim().replace(/"([A-Za-z0-9_]+)"/g, "`$1`");
  sql = sql.replace(
    /DELETE\s+FROM\s+rate_limit_buckets\s+WHERE\s+rowid\s+IN\s*\(\s*SELECT\s+rowid\s+FROM\s+rate_limit_buckets\s+WHERE\s+expires_at\s*<\s*\?\s+ORDER\s+BY\s+expires_at\s+LIMIT\s+100\s*\)/gi,
    "DELETE FROM rate_limit_buckets WHERE expires_at < ? ORDER BY expires_at LIMIT 100",
  );
  sql = sql
    .replace(/\bINSERT\s+OR\s+IGNORE\b/gi, "INSERT IGNORE")
    .replace(/\bchanges\(\)/gi, "ROW_COUNT()")
    .replace(/\bdate\(\s*'now'\s*\)/gi, "UTC_DATE()")
    .replace(
      /\bdatetime\(\s*'now'\s*,\s*'\+(\d+) seconds'\s*\)/gi,
      "DATE_ADD(UTC_TIMESTAMP(), INTERVAL $1 SECOND)",
    )
    .replace(/\bdatetime\(\s*([A-Za-z0-9_`.]+)\s*\)/gi, "$1")
    .replace(/\bMAX\s*\(/gi, "GREATEST(")
    .replace(/\bMIN\s*\(/gi, "LEAST(");

  sql = sql.replace(
    /ON\s+CONFLICT\s*\(\s*scope\s*,\s*key_digest\s*,\s*window_start\s*\)\s+DO\s+UPDATE\s+SET\s+count\s*=\s*count\s*\+\s*1\s*,\s*updated_at\s*=\s*CURRENT_TIMESTAMP\s+WHERE\s+rate_limit_buckets\.count\s*<\s*\?/gi,
    "ON DUPLICATE KEY UPDATE count = IF(count < ?, count + 1, count)",
  );

  sql = sql.replace(
    /ON\s+CONFLICT\s*\([^)]+\)\s+DO\s+UPDATE\s+SET\s+([\s\S]+)$/i,
    (_match, assignments: string) =>
      `ON DUPLICATE KEY UPDATE ${assignments.replace(
        /\bexcluded\.([A-Za-z0-9_]+)/gi,
        "VALUES(`$1`)",
      )}`,
  );

  return sql;
}

function translatedBindings(sql: string, values: unknown[]) {
  if (!/date\(\s*'now'\s*,\s*\?\s*\)/i.test(sql)) {
    return values.map(normalizeInput);
  }
  let converted = false;
  return values.map((value) => {
    if (!converted && typeof value === "string") {
      const match = /^-(\d+)\s+days?$/.exec(value.trim());
      if (match) {
        converted = true;
        return Number(match[1]);
      }
    }
    return normalizeInput(value);
  });
}

function translateDateModifier(sql: string) {
  return sql.replace(
    /date\(\s*'now'\s*,\s*\?\s*\)/gi,
    "DATE_SUB(UTC_DATE(), INTERVAL ? DAY)",
  );
}

async function executeStatement<T>(
  connection: PoolConnection,
  statement: MysqlPreparedStatement,
): Promise<D1ResultLike<T>> {
  const started = performance.now();
  const translated = translateDateModifier(translateSql(statement.sql));
  const bindings = translatedBindings(statement.sql, statement.values);
  let result: Awaited<ReturnType<PoolConnection["query"]>>[0];
  try {
    // MySQL 8.4 rejects mysql2's binary-protocol number type when a bound
    // parameter is used by LIMIT. The text protocol still escapes every
    // binding through mysql2 and accepts the same D1-style SQL consistently.
    [result] = await connection.query(translated, bindings as never[]);
  } catch (error) {
    const mysqlError = error as {
      code?: string;
      errno?: number;
      sqlState?: string;
      message?: string;
    };
    console.error("mysql_query_error", {
      code: mysqlError.code,
      errno: mysqlError.errno,
      sqlState: mysqlError.sqlState,
      operation: translated.split(/\s+/, 3).join(" ").slice(0, 80),
      message: mysqlError.message?.slice(0, 500),
    });
    throw error;
  }

  if (Array.isArray(result)) {
    return {
      success: true,
      results: (result as RowDataPacket[]).map(normalizeRow) as T[],
      meta: {
        changes: 0,
        last_row_id: 0,
        duration: performance.now() - started,
      },
    };
  }

  const header = result as ResultSetHeader;
  const changes = /ON\s+DUPLICATE\s+KEY\s+UPDATE/i.test(translated)
    ? header.affectedRows > 0
      ? 1
      : 0
    : header.affectedRows;
  return {
    success: true,
    results: [],
    meta: {
      changes,
      last_row_id: Number(header.insertId || 0),
      duration: performance.now() - started,
    },
  };
}

class MysqlPreparedStatement {
  readonly sql: string;
  readonly values: unknown[];

  constructor(sql: string, values: unknown[] = []) {
    this.sql = sql;
    this.values = values;
  }

  bind(...values: unknown[]) {
    return new MysqlPreparedStatement(this.sql, values);
  }

  async all<T = Record<string, unknown>>() {
    return withConnection((connection) => executeStatement<T>(connection, this));
  }

  async first<T = Record<string, unknown>>(column?: string) {
    const result = await this.all<T>();
    const first = result.results[0] ?? null;
    if (column && first && typeof first === "object") {
      return (first as Record<string, unknown>)[column] ?? null;
    }
    return first;
  }

  async run<T = Record<string, unknown>>() {
    return withConnection((connection) => executeStatement<T>(connection, this));
  }

  async raw<T = unknown[]>() {
    const result = await this.all<Record<string, unknown>>();
    return result.results.map((row) => Object.values(row)) as T[];
  }
}

async function withConnection<T>(
  callback: (connection: PoolConnection) => Promise<T>,
) {
  const connection = await databasePool().getConnection();
  try {
    await connection.query("SET time_zone = '+00:00'");
    return await callback(connection);
  } finally {
    connection.release();
  }
}

class MysqlD1Database {
  prepare(sql: string) {
    return new MysqlPreparedStatement(sql);
  }

  async batch<T = Record<string, unknown>>(
    statements: MysqlPreparedStatement[],
  ) {
    return withConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        const results: D1ResultLike<T>[] = [];
        for (const statement of statements) {
          results.push(await executeStatement<T>(connection, statement));
        }
        await connection.commit();
        return results;
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });
  }
}

let database: MysqlD1Database | undefined;

export function mysqlD1Database() {
  database ??= new MysqlD1Database();
  return database;
}

export async function closeMysqlPool() {
  if (!pool) return;
  const current = pool;
  pool = undefined;
  await current.end();
}

