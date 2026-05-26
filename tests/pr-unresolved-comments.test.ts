import { describe, expect, it } from "vitest";

import { shouldIncludeThread } from "../scripts/pr-unresolved-comments.ts";

function thread(overrides: Partial<Parameters<typeof shouldIncludeThread>[0]> = {}): Parameters<typeof shouldIncludeThread>[0] {
  return {
    comments: {
      nodes: [
        {
          author: { login: "reviewer" },
          authorAssociation: "NONE",
          body: "Please rename this variable.",
          createdAt: "2026-05-26T00:00:00Z",
          url: "https://example.invalid/comment/1"
        }
      ]
    },
    id: "thread-1",
    isOutdated: false,
    isResolved: false,
    line: 42,
    path: "src/example.ts",
    startLine: null,
    ...overrides
  };
}

describe("shouldIncludeThread", () => {
  it("includes unresolved and active threads", () => {
    expect(shouldIncludeThread(thread())).toBe(true);
  });

  it("excludes resolved threads", () => {
    expect(shouldIncludeThread(thread({ isResolved: true }))).toBe(false);
  });

  it("excludes outdated threads", () => {
    expect(shouldIncludeThread(thread({ isOutdated: true }))).toBe(false);
  });

  it("excludes threads dismissed by contributor comments", () => {
    expect(
      shouldIncludeThread(
        thread({
          comments: {
            nodes: [
              {
                author: { login: "maintainer" },
                authorAssociation: "MEMBER",
                body: "This is not needed anymore.",
                createdAt: "2026-05-26T00:00:00Z",
                url: "https://example.invalid/comment/2"
              }
            ]
          }
        })
      )
    ).toBe(false);
  });

  it("does not treat external reviewer phrases as contributor dismissals", () => {
    expect(
      shouldIncludeThread(
        thread({
          comments: {
            nodes: [
              {
                author: { login: "external-reviewer" },
                authorAssociation: "NONE",
                body: "This is not needed.",
                createdAt: "2026-05-26T00:00:00Z",
                url: "https://example.invalid/comment/3"
              }
            ]
          }
        })
      )
    ).toBe(true);
  });
});
