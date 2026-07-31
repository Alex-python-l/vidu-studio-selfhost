import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { mysqlD1Database } from "./mysql-d1";

export function getDb() {
  return drizzle(mysqlD1Database() as unknown as D1Database, { schema });
}

export function getD1() {
  return mysqlD1Database() as unknown as D1Database;
}
