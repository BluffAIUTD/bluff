import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../../tests/testdb";
import { withTx, one, many } from "./index";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb("bluff_db_test"); });
afterAll(async () => { await t.drop(); });

describe("db helpers", () => {
  it("one/many query", async () => {
    expect(await one<{ n: number }>(t.pool, "select 1 as n")).toEqual({ n: 1 });
    expect(await one(t.pool, "select 1 where false")).toBeNull();
    expect((await many(t.pool, "select generate_series(1,3) n")).length).toBe(3);
  });
  it("withTx commits and rolls back", async () => {
    await withTx(async (c) => { await c.query("insert into users (name) values ('commit')"); }, t.pool);
    await expect(withTx(async (c) => { await c.query("insert into users (name) values ('rollback')"); throw new Error("boom"); }, t.pool)).rejects.toThrow("boom");
    const names = (await many<{ name: string }>(t.pool, "select name from users")).map((r) => r.name);
    expect(names).toContain("commit");
    expect(names).not.toContain("rollback");
  });
});
