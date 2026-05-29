import { describe, expect, it } from "vitest";

import {
  hasChangelogVersion,
  insertVersionEntry,
  normalizeCommitTitles
} from "../scripts/update-changelog.ts";

describe("hasChangelogVersion", () => {
  it("matches an existing version heading", () => {
    expect(hasChangelogVersion("# Changelog\n\n## [14.8.1] - branch\n", "14.8.1")).toBe(true);
  });

  it("does not match plain body text", () => {
    expect(hasChangelogVersion("# Changelog\n\n- Updated 14.8.1\n", "14.8.1")).toBe(false);
  });
});

describe("insertVersionEntry", () => {
  it("inserts a version section with the branch name as title", () => {
    const result = insertVersionEntry(
      "# Changelog\n\nAll notable changes to this project will be documented in this file.\n",
      "14.8.1",
      "11-upgrade-to-typescript-6x",
      ["Upgrade TypeScript to 6", "Update package lock"]
    );

    expect(result).toContain("## [14.8.1] - 11-upgrade-to-typescript-6x\n\n- Upgrade TypeScript to 6\n- Update package lock");
  });

  it("inserts newer version sections above older version sections", () => {
    const result = insertVersionEntry(
      "# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n## [14.7.0] - Initial Version\n\n- Older change\n",
      "14.8.1",
      "11-upgrade-to-typescript-6x",
      ["Newer change"]
    );

    expect(result).toContain("## [14.8.1] - 11-upgrade-to-typescript-6x\n\n- Newer change\n\n## [14.7.0]");
  });

  it("throws when the version already exists", () => {
    expect(() => insertVersionEntry("# Changelog\n\n## [14.8.1] - branch\n", "14.8.1", "branch", ["Change"])).toThrow(
      "CHANGELOG.md already contains an entry for version 14.8.1."
    );
  });
});

describe("normalizeCommitTitles", () => {
  it("removes commit titles shorter than 10 characters", () => {
    expect(normalizeCommitTitles(["Updated tsconfig", ".", "abcd12345", "Upgrade TypeScript"])).toEqual([
      "Updated tsconfig",
      "Upgrade TypeScript"
    ]);
  });
});
