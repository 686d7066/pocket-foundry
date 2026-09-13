import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  appendClosingReference,
  hasClosingReference,
  issueNumberFromBranch,
  linkPullRequestIssue
} from "../.github/workflows/link-pr-issue.ts";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
    status
  });
}

describe("issueNumberFromBranch", () => {
  it("reads a positive issue number prefix", () => {
    expect(issueNumberFromBranch("37-recover-search-loading-state")).toBe(37);
  });

  it.each(["feature/search", "0-invalid", "-1-invalid", "037-leading-zero", "37_no-hyphen"])(
    "rejects a branch without the required prefix: %s",
    (branchName) => {
      expect(issueNumberFromBranch(branchName)).toBeNull();
    }
  );
});

describe("hasClosingReference", () => {
  it.each([
    "Closes #37",
    "fixes 686d7066/pocket-foundry#37",
    "RESOLVED: https://github.com/686d7066/pocket-foundry/issues/37"
  ])("recognizes an effective same-repository closing reference: %s", (body) => {
    expect(hasClosingReference(body, "686d7066/pocket-foundry", 37)).toBe(true);
  });

  it.each([
    "Related to #37",
    "Closes #370",
    "Closes another/repository#37",
    "```markdown\nCloses #37\n```",
    "<!-- Closes #37 -->",
    "Use `Closes #37` when ready"
  ])("does not mistake a non-closing mention for a closing reference: %s", (body) => {
    expect(hasClosingReference(body, "686d7066/pocket-foundry", 37)).toBe(false);
  });
});

describe("appendClosingReference", () => {
  it("preserves the existing body and appends one separated line", () => {
    expect(appendClosingReference("Existing body", 37)).toBe("Existing body\n\nCloses #37");
  });

  it("does not add leading whitespace to an empty body", () => {
    expect(appendClosingReference("", 37)).toBe("Closes #37");
  });
});

describe("linkPullRequestIssue", () => {
  it("reads live pull request and issue data before updating the body", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ body: "Existing body", head: { ref: "37-fix-search" }, state: "open" }))
      .mockResolvedValueOnce(jsonResponse({ state: "open" }))
      .mockResolvedValueOnce(jsonResponse({ body: "Edited body", head: { ref: "37-fix-search" }, state: "open" }))
      .mockResolvedValueOnce(jsonResponse({ body: "Edited body\n\nCloses #37" }));

    await expect(linkPullRequestIssue({
      fetch: request,
      pullNumber: 45,
      repository: "686d7066/pocket-foundry",
      token: "test-token"
    })).resolves.toEqual({ issueNumber: 37, status: "updated" });

    expect(request).toHaveBeenCalledTimes(4);
    expect(request.mock.calls[0][0]).toBe("https://api.github.com/repos/686d7066/pocket-foundry/pulls/45");
    expect(request.mock.calls[3][1]).toMatchObject({
      body: JSON.stringify({ body: "Edited body\n\nCloses #37" }),
      headers: expect.objectContaining({ "Content-Type": "application/json" }),
      method: "PATCH"
    });
  });

  it("does not overwrite a closing reference added during issue validation", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ body: "Existing body", head: { ref: "37-fix-search" }, state: "open" }))
      .mockResolvedValueOnce(jsonResponse({ state: "open" }))
      .mockResolvedValueOnce(jsonResponse({ body: "Existing body\n\nCloses #37", head: { ref: "37-fix-search" }, state: "open" }));

    await expect(linkPullRequestIssue({
      fetch: request,
      pullNumber: 45,
      repository: "686d7066/pocket-foundry",
      token: "test-token"
    })).resolves.toEqual({ reason: "existing-reference", status: "skipped" });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("is idempotent when the live body already closes the issue", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ body: "Closes #37", head: { ref: "37-fix-search" }, state: "open" }));

    await expect(linkPullRequestIssue({
      fetch: request,
      pullNumber: 45,
      repository: "686d7066/pocket-foundry",
      token: "test-token"
    })).resolves.toEqual({ reason: "existing-reference", status: "skipped" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ body: null, head: { ref: "feature/search" }, state: "open" }, { reason: "branch", status: "skipped" }],
    [{ body: null, head: { ref: "37-fix-search" }, state: "closed" }, { reason: "closed-pr", status: "skipped" }]
  ])("skips pull requests that cannot be linked", async (pull, expected) => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(pull));

    await expect(linkPullRequestIssue({
      fetch: request,
      pullNumber: 45,
      repository: "686d7066/pocket-foundry",
      token: "test-token"
    })).resolves.toEqual(expected);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    [jsonResponse({ message: "Not Found" }, 404), "missing-issue"],
    [jsonResponse({ pull_request: {}, state: "open" }), "pull-request"],
    [jsonResponse({ state: "closed" }), "closed-issue"]
  ])("does not update when the branch prefix is not an open issue", async (issueResponse, reason) => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ body: null, head: { ref: "37-fix-search" }, state: "open" }))
      .mockResolvedValueOnce(issueResponse);

    await expect(linkPullRequestIssue({
      fetch: request,
      pullNumber: 45,
      repository: "686d7066/pocket-foundry",
      token: "test-token"
    })).resolves.toEqual({ reason, status: "skipped" });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("reports bounded GitHub API errors", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("x".repeat(700), { status: 500 }));

    await expect(linkPullRequestIssue({
      fetch: request,
      pullNumber: 45,
      repository: "686d7066/pocket-foundry",
      token: "test-token"
    })).rejects.toThrow(`GitHub API GET /repos/686d7066/pocket-foundry/pulls/45 failed with 500: ${"x".repeat(500)}`);
  });
});

describe("link-pr-issue workflow", () => {
  it("runs trusted TypeScript with the minimum required permissions", () => {
    const workflow = readFileSync(resolve(".github/workflows/link-pr-issue.yml"), "utf8");

    expect(workflow).toContain("pull_request_target:");
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("issues: read");
    expect(workflow).toContain("pull-requests: write");
    expect(workflow).toContain("node --experimental-strip-types .github/workflows/link-pr-issue.ts");
    expect(workflow).not.toContain("github.event.pull_request.head");
  });
});
