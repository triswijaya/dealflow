import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { db } from "./client";

describe("database connectivity and migrations", () => {
  let migrationClient: ReturnType<typeof postgres>;

  beforeAll(async () => {
    const migrationUrl = process.env.DATABASE_MIGRATION_URL;
    if (!migrationUrl) {
      throw new Error("DATABASE_MIGRATION_URL must be set to run integration tests");
    }
    migrationClient = postgres(migrationUrl, { max: 1 });
    await migrate(drizzle(migrationClient), { migrationsFolder: "./drizzle" });
  });

  afterAll(async () => {
    await migrationClient.end();
  });

  it("applies migrations and creates the drizzle bookkeeping table", async () => {
    const rows = await db.execute(
      sql`select to_regclass('drizzle.__drizzle_migrations') as table_name`,
    );
    expect(rows[0]?.table_name).toBe("drizzle.__drizzle_migrations");
  });

  it("connects with the runtime client and can query", async () => {
    const rows = await db.execute(sql`select 1 as one`);
    expect(rows[0]?.one).toBe(1);
  });
});
