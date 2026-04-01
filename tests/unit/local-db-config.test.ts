import { describe, expect, it } from "vitest";
import { localDbConfig } from "../../src/db.js";

describe("db.ts localDbConfig", () => {
  it("exposes couch provider and database names", () => {
    expect(localDbConfig.provider).toBe("couchdb");
    expect(localDbConfig.databases.trades).toBe("trades");
    expect(localDbConfig.url).toContain("5984");
  });
});
