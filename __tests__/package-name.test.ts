import { describe, expect, it } from "vitest";
import pkg from "../package.json";

describe("package.json", () => {
  it("package name must be robinhood-for-agents (not scoped)", () => {
    expect(pkg.name).toBe("robinhood-for-agents");
  });

  it("import resolves to local source, not a stale npm copy", () => {
    const resolved = import.meta.resolve("robinhood-for-agents");
    expect(resolved).not.toContain("node_modules");
  });
});
