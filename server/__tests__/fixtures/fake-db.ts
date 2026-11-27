import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// A recording stand-in for the Drizzle client. It runs no SQL: every awaited
// query chain is handed to the test's handler, which answers with rows (or
// throws to play a database failure). Conditions are rendered with the real
// Postgres dialect so a test can assert the exact WHERE text and parameters.

const dialect = new PgDialect();

export interface FakeQuery {
  op: "select" | "insert" | "update" | "delete";
  table: string;
  values?: unknown;
  set?: Record<string, unknown>;
  where?: { sql: string; params: unknown[] };
  returning: boolean;
}

export type FakeHandler = (query: FakeQuery) => unknown[] | Promise<unknown[]>;

export function renderSql(fragment: SQL): { sql: string; params: unknown[] } {
  const { sql, params } = dialect.sqlToQuery(fragment);
  return { sql, params };
}

export function createFakeDb(handler: FakeHandler) {
  const queries: FakeQuery[] = [];

  function chain(query: FakeQuery) {
    let result: Promise<unknown[]> | null = null;
    const run = () => {
      if (!result) {
        queries.push(query);
        result = (async () => handler(query))();
      }
      return result;
    };
    const builder = {
      from(table: Table) {
        query.table = getTableName(table);
        return builder;
      },
      values(values: unknown) {
        query.values = values;
        return builder;
      },
      set(set: Record<string, unknown>) {
        query.set = set;
        return builder;
      },
      where(condition: SQL) {
        query.where = renderSql(condition);
        return builder;
      },
      onConflictDoUpdate: () => builder,
      orderBy: () => builder,
      groupBy: () => builder,
      returning() {
        query.returning = true;
        return builder;
      },
      then<A, B>(
        onFulfilled?: (rows: unknown[]) => A | PromiseLike<A>,
        onRejected?: (reason: unknown) => B | PromiseLike<B>,
      ) {
        return run().then(onFulfilled, onRejected);
      },
      catch<B>(onRejected: (reason: unknown) => B | PromiseLike<B>) {
        return run().catch(onRejected);
      },
    };
    return builder;
  }

  const db = {
    select: (_fields?: unknown) =>
      chain({ op: "select", table: "", returning: false }),
    insert: (table: Table) =>
      chain({ op: "insert", table: getTableName(table), returning: false }),
    update: (table: Table) =>
      chain({ op: "update", table: getTableName(table), returning: false }),
    delete: (table: Table) =>
      chain({ op: "delete", table: getTableName(table), returning: false }),
  };

  return {
    db,
    queries,
    reset: () => {
      queries.length = 0;
    },
    find: (op: FakeQuery["op"], table: string) =>
      queries.filter((query) => query.op === op && query.table === table),
  };
}
