import { describe, expect, it } from "vitest";

import {
  isPackageVersionIncreased,
  readPackageVersionFromText
} from "../.github/workflows/check-repo-version.ts";

describe("readPackageVersionFromText", () => {
  it("reads the package version", () => {
    expect(readPackageVersionFromText('{ "version": "14.10.0" }')).toBe("14.10.0");
  });

  it("rejects a missing package version", () => {
    expect(() => readPackageVersionFromText("{}")).toThrow("package.json is missing a valid version string.");
  });
});

describe("isPackageVersionIncreased", () => {
  it("accepts an increased package version", () => {
    expect(isPackageVersionIncreased("14.10.1", "14.10.0")).toBe(true);
  });

  it("rejects an unchanged package version", () => {
    expect(isPackageVersionIncreased("14.10.0", "14.10.0")).toBe(false);
  });
});
