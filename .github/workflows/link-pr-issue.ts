import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type FetchFunction = typeof fetch;

type LinkResult =
  | { issueNumber: number; status: "updated" }
  | {
    reason: "branch" | "closed-issue" | "closed-pr" | "existing-reference" | "missing-issue" | "pull-request";
    status: "skipped";
  };

type LinkOptions = {
  fetch?: FetchFunction;
  pullNumber: number;
  repository: string;
  token: string;
};

type PullRequest = {
  body: string;
  headRef: string;
  state: "closed" | "open";
};

type Issue = {
  isPullRequest: boolean;
  state: "closed" | "open";
};

const API_VERSION = "2022-11-28";
const MAX_ERROR_BODY_LENGTH = 500;

/**
 * Read the leading issue number from a branch named `<issue>-<description>`.
 *
 * @param branchName Pull request head branch name.
 * @returns The positive issue number, or null when the name does not match.
 */
export function issueNumberFromBranch(branchName: string): number | null {
  const match = /^([1-9]\d*)-/.exec(branchName);
  if (!match) return null;

  const issueNumber = Number(match[1]);
  return Number.isSafeInteger(issueNumber) ? issueNumber : null;
}

/**
 * Remove Markdown regions where GitHub does not interpret closing keywords.
 *
 * @param body Pull request Markdown body.
 * @returns Body text outside code fences, inline code, and HTML comments.
 */
function proseOnly(body: string): string {
  const withoutComments = body.replace(/<!--[\s\S]*?-->/g, "");
  const lines = withoutComments.split(/(?<=\n)/);
  const prose: string[] = [];
  let fence: { character: "`" | "~"; length: number } | null = null;

  for (const line of lines) {
    const marker = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line);
    if (marker) {
      const character = marker[1][0];
      if (character !== "`" && character !== "~") continue;

      if (!fence) {
        fence = { character, length: marker[1].length };
        continue;
      }

      if (character === fence.character && marker[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }

    if (!fence) prose.push(line.replace(/`+[^`\r\n]*`+/g, ""));
  }

  return prose.join("");
}

/**
 * Determine whether a body already closes the issue in the base repository.
 *
 * @param body Pull request Markdown body.
 * @param repository Base repository in `owner/name` form.
 * @param issueNumber Issue number parsed from the branch.
 * @returns True when a supported closing keyword targets this issue.
 */
export function hasClosingReference(body: string, repository: string, issueNumber: number): boolean {
  const escapedRepository = repository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const keyword = "(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)";
  const localReference = `(?<![A-Za-z0-9_.\\/-])#${issueNumber}(?!\\d)`;
  const qualifiedReference = `${escapedRepository}#${issueNumber}(?!\\d)`;
  const urlReference = `https:\\/\\/github\\.com\\/${escapedRepository}\\/issues\\/${issueNumber}(?!\\d)`;
  const pattern = new RegExp(`\\b${keyword}[ \\t]*:?[ \\t]+(?:${qualifiedReference}|${urlReference}|${localReference})`, "i");

  return pattern.test(proseOnly(body));
}

/**
 * Add the standard closing reference while preserving the existing body.
 *
 * @param body Existing pull request body.
 * @param issueNumber Issue to close when the pull request is merged.
 * @returns Updated pull request body.
 */
export function appendClosingReference(body: string, issueNumber: number): string {
  return body.length === 0 ? `Closes #${issueNumber}` : `${body}\n\nCloses #${issueNumber}`;
}

/**
 * Read an unsuccessful GitHub API response without allowing an unbounded error.
 *
 * @param response GitHub API response.
 * @param method HTTP method.
 * @param resource API resource description.
 * @returns Error containing the response status and bounded response text.
 */
async function apiError(response: Response, method: string, resource: string): Promise<Error> {
  const responseText = (await response.text()).slice(0, MAX_ERROR_BODY_LENGTH);
  const suffix = responseText.length > 0 ? `: ${responseText}` : "";
  return new Error(`GitHub API ${method} ${resource} failed with ${response.status}${suffix}`);
}

/**
 * Request a GitHub API resource and parse its JSON response.
 *
 * @param request Fetch implementation.
 * @param url Absolute API URL.
 * @param token Workflow token.
 * @param method HTTP method.
 * @param resource API resource description for errors.
 * @param body Optional JSON request body.
 * @returns Parsed response data.
 */
async function requestJson(
  request: FetchFunction,
  url: string,
  token: string,
  method: "GET" | "PATCH",
  resource: string,
  body?: object
): Promise<unknown> {
  const response = await request(url, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  if (!response.ok) throw await apiError(response, method, resource);
  return response.status === 204 ? null : response.json();
}

/**
 * Narrow live pull request API data to the fields used by the workflow.
 *
 * @param value Unknown API response.
 * @returns Validated pull request data.
 */
function parsePullRequest(value: unknown): PullRequest {
  if (typeof value !== "object" || value === null) {
    throw new Error("GitHub API returned invalid pull request data.");
  }

  const candidate = value as Record<string, unknown>;
  const head = candidate.head;
  const body = candidate.body;
  if (
    (candidate.state !== "open" && candidate.state !== "closed")
    || (body !== null && typeof body !== "string")
    || typeof head !== "object"
    || head === null
    || typeof (head as Record<string, unknown>).ref !== "string"
  ) {
    throw new Error("GitHub API returned invalid pull request data.");
  }

  return {
    body: body ?? "",
    headRef: (head as Record<string, unknown>).ref as string,
    state: candidate.state
  };
}

/**
 * Narrow issue API data to the fields used by the workflow.
 *
 * @param value Unknown API response.
 * @returns Validated issue data.
 */
function parseIssue(value: unknown): Issue {
  if (typeof value !== "object" || value === null) {
    throw new Error("GitHub API returned invalid issue data.");
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.state !== "open" && candidate.state !== "closed") {
    throw new Error("GitHub API returned invalid issue data.");
  }

  return { isPullRequest: "pull_request" in candidate, state: candidate.state };
}

/**
 * Add an issue-closing reference inferred from a pull request branch name.
 *
 * @param options Repository, pull request, token, and optional request boundary.
 * @returns Whether the pull request was updated or why it was skipped.
 */
export async function linkPullRequestIssue(options: LinkOptions): Promise<LinkResult> {
  if (!/^[^/\s]+\/[^/\s]+$/.test(options.repository)) {
    throw new Error("GITHUB_REPOSITORY must use owner/name format.");
  }
  if (!Number.isSafeInteger(options.pullNumber) || options.pullNumber <= 0) {
    throw new Error("Pull request number must be a positive integer.");
  }
  if (options.token.length === 0) throw new Error("GITHUB_TOKEN is required.");

  const request = options.fetch ?? fetch;
  const repositoryPath = options.repository.split("/").map(encodeURIComponent).join("/");
  const pullResource = `/repos/${options.repository}/pulls/${options.pullNumber}`;
  const pullUrl = `https://api.github.com/repos/${repositoryPath}/pulls/${options.pullNumber}`;
  const pull = parsePullRequest(await requestJson(request, pullUrl, options.token, "GET", pullResource));

  if (pull.state === "closed") return { reason: "closed-pr", status: "skipped" };

  const issueNumber = issueNumberFromBranch(pull.headRef);
  if (issueNumber === null) return { reason: "branch", status: "skipped" };
  if (hasClosingReference(pull.body, options.repository, issueNumber)) {
    return { reason: "existing-reference", status: "skipped" };
  }

  const issueResource = `/repos/${options.repository}/issues/${issueNumber}`;
  const issueUrl = `https://api.github.com/repos/${repositoryPath}/issues/${issueNumber}`;
  const issueResponse = await request(issueUrl, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${options.token}`,
      "X-GitHub-Api-Version": API_VERSION
    }
  });

  if (issueResponse.status === 404) return { reason: "missing-issue", status: "skipped" };
  if (!issueResponse.ok) throw await apiError(issueResponse, "GET", issueResource);

  const issue = parseIssue(await issueResponse.json());
  if (issue.isPullRequest) return { reason: "pull-request", status: "skipped" };
  if (issue.state === "closed") return { reason: "closed-issue", status: "skipped" };

  const refreshedPull = parsePullRequest(
    await requestJson(request, pullUrl, options.token, "GET", pullResource)
  );
  if (refreshedPull.state === "closed") return { reason: "closed-pr", status: "skipped" };
  if (issueNumberFromBranch(refreshedPull.headRef) !== issueNumber) {
    return { reason: "branch", status: "skipped" };
  }
  if (hasClosingReference(refreshedPull.body, options.repository, issueNumber)) {
    return { reason: "existing-reference", status: "skipped" };
  }

  await requestJson(request, pullUrl, options.token, "PATCH", pullResource, {
    body: appendClosingReference(refreshedPull.body, issueNumber)
  });
  return { issueNumber, status: "updated" };
}

/**
 * Read the pull request number from the GitHub Actions event payload.
 *
 * @param eventPath Path provided by GitHub Actions.
 * @returns Validated pull request number.
 */
export function readPullNumber(eventPath: string): number {
  const event = JSON.parse(readFileSync(eventPath, "utf8")) as unknown;
  if (typeof event !== "object" || event === null) {
    throw new Error("GitHub event payload is invalid.");
  }

  const pullNumber = (event as Record<string, unknown>).number;
  if (!Number.isSafeInteger(pullNumber) || (pullNumber as number) <= 0) {
    throw new Error("GitHub event payload is missing a valid pull request number.");
  }

  return pullNumber as number;
}

/** Execute the workflow using GitHub Actions environment variables. */
async function main(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH ?? "";
  const repository = process.env.GITHUB_REPOSITORY ?? "";
  const token = process.env.GITHUB_TOKEN ?? "";
  if (eventPath.length === 0) throw new Error("GITHUB_EVENT_PATH is required.");

  const result = await linkPullRequestIssue({
    pullNumber: readPullNumber(eventPath),
    repository,
    token
  });

  if (result.status === "updated") {
    console.log(`Added closing reference for issue #${result.issueNumber}.`);
  } else {
    console.log(`Skipped pull request: ${result.reason}.`);
  }
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(resolve(entryPoint)).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Issue-link workflow failed.");
    process.exitCode = 1;
  });
}
