import { describe, expect, it } from "vitest";

import { compareSemVer } from "../.github/workflows/check-module-version.ts";

describe("compareSemVer", () => {
  it("compares core versions numerically", () => {
    expect(compareSemVer("0.7.1", "0.7.0")).toBeGreaterThan(0);
  });

  it("treats release versions as higher than prerelease versions", () => {
    expect(compareSemVer("1.0.0", "1.0.0-rc.1")).toBeGreaterThan(0);
  });

  it("orders prerelease numeric identifiers numerically", () => {
    expect(compareSemVer("1.0.0-rc.10", "1.0.0-rc.2")).toBeGreaterThan(0);
  });

  it("orders numeric prerelease identifiers before text identifiers", () => {
    expect(compareSemVer("1.0.0-rc.1", "1.0.0-rc.alpha")).toBeLessThan(0);
  });

  it("ignores build metadata", () => {
    expect(compareSemVer("1.2.3+build.2", "1.2.3+build.1")).toBe(0);
  });
});
