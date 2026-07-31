import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mysqlCompatibilityLayer = await readFile(
  new URL("../db/mysql-d1.ts", import.meta.url),
  "utf8",
);

test("MySQL compatibility queries support bound LIMIT values on MySQL 8.4", () => {
  assert.match(
    mysqlCompatibilityLayer,
    /await connection\.query\(translated, bindings as never\[\]\)/,
  );
  assert.doesNotMatch(
    mysqlCompatibilityLayer,
    /await connection\.execute\(translated, bindings as never\[\]\)/,
  );
});

