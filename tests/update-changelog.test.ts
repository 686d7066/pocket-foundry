import { describe, expect, it } from "vitest";

import {
  insertVersionEntry,
  parseChangelogItems
} from "../.github/workflows/update-changelog.ts";

describe("parseChangelogItems", () => {
  it("uses bullet lines from the pull request body", () => {
    expect(parseChangelogItems("Improve mobile combat\n\n- Add combat turn controls\n- Respect hidden combatants")).toEqual([
      "- Add combat turn controls",
      "- Respect hidden combatants"
    ]);
  });

  it("falls back to the subject when no bullets exist", () => {
    expect(parseChangelogItems("Improve mobile combat (#12)")).toEqual(["- Improve mobile combat"]);
  });
});

describe("insertVersionEntry", () => {
  it("appends a version section after the changelog introduction", () => {
    const result = insertVersionEntry(
      "# Changelog\n\nAll notable changes to this project will be documented in this file.\n",
      "14.10.0",
      "2026-05-29",
      ["- Upgrade TypeScript to 6"]
    );

    expect(result.changed).toBe(true);
    expect(result.content).toContain(
      "All notable changes to this project will be documented in this file.\n\n## [14.10.0] - 2026-05-29"
    );
    expect(result.content).toContain("## [14.10.0] - 2026-05-29\n\n- Upgrade TypeScript to 6");
  });

  it("does not duplicate an existing version section", () => {
    const changelog = "# Changelog\n\n## [14.10.0] - 2026-05-29\n";
    const result = insertVersionEntry(changelog, "14.10.0", "2026-05-29", ["- Upgrade TypeScript to 6"]);

    expect(result.changed).toBe(false);
    expect(result.content).toBe(changelog);
  });
});
