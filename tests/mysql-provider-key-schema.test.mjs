import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [initialSchema, forwardMigration, runtimeCheck] = await Promise.all([
  readFile(new URL("../deploy/mysql/init/001-schema.sql", import.meta.url), "utf8"),
  readFile(
    new URL(
      "../deploy/mysql/migrations/001-provider-key-id-length.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(new URL("../db/runtime-schema.ts", import.meta.url), "utf8"),
]);

test("managed provider key IDs fit new and existing MySQL deployments", () => {
  assert.match(
    initialSchema,
    /CREATE TABLE IF NOT EXISTS provider_key_secrets[\s\S]*key_id VARCHAR\(64\) PRIMARY KEY/,
  );
  assert.match(
    forwardMigration,
    /ALTER TABLE provider_key_secrets\s+MODIFY COLUMN key_id VARCHAR\(64\) NOT NULL/,
  );
  assert.match(runtimeCheck, /CHARACTER_MAXIMUM_LENGTH AS maximum_length/);
  assert.match(runtimeCheck, /maximum_length \?\? 0\) < 40/);
});
