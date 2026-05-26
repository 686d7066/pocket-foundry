import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

type CommentAuthorAssociation =
  | "COLLABORATOR"
  | "CONTRIBUTOR"
  | "FIRST_TIMER"
  | "FIRST_TIME_CONTRIBUTOR"
  | "MANNEQUIN"
  | "MEMBER"
  | "NONE"
  | "OWNER";

type GhReviewComment = {
  author: { login: string } | null;
  authorAssociation: CommentAuthorAssociation;
  body: string;
  createdAt: string;
  url: string;
};

type GhReviewThread = {
  comments: { nodes: GhReviewComment[] };
  id: string;
  isOutdated: boolean;
  isResolved: boolean;
  line: number | null;
  path: string;
  startLine: number | null;
};

type GhPageInfo = {
  endCursor: string | null;
  hasNextPage: boolean;
};

type GhThreadsConnection = {
  nodes: GhReviewThread[];
  pageInfo: GhPageInfo;
};

type GhGraphQlResponse = {
  data?: {
    repository?: {
      pullRequest?: {
        reviewThreads: GhThreadsConnection;
      } | null;
    } | null;
  };
};

type PrView = {
  baseRefName: string;
  number: number;
  title: string;
  url: string;
};

/**
 * Associations treated as repo contributors for dismissal heuristics.
 */
const CONTRIBUTOR_ASSOCIATIONS = new Set<CommentAuthorAssociation>([
  "COLLABORATOR",
  "CONTRIBUTOR",
  "MEMBER",
  "OWNER"
]);

/**
 * Phrases that indicate the thread can be ignored when said by a contributor.
 */
const DISMISSAL_PATTERNS = [
  /\bnot needed\b/i,
  /\bno need(?:ed)?\b/i,
  /\bunnecessary\b/i,
  /\bnot required\b/i,
  /\bignore (?:this|it)\b/i,
  /\bfalse positive\b/i,
  /\binvalid (?:issue|comment|concern)\b/i,
  /\b(?:this|that) is wrong\b/i,
  /\bincorrect\b/i,
  /\bnot applicable\b/i,
  /\balready handled\b/i,
  /\balready fixed\b/i
];

const GRAPHQL_QUERY = `
query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $after) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          startLine
          comments(first: 100) {
            nodes {
              body
              createdAt
              url
              authorAssociation
              author {
                login
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}
`;

/**
 * Fallback executable paths for GitHub CLI on Windows.
 */
const GH_WINDOWS_CANDIDATES = [
  "C:\\Program Files\\GitHub CLI\\gh.exe",
  "C:\\Program Files (x86)\\GitHub CLI\\gh.exe",
  `${process.env.LOCALAPPDATA ?? ""}\\Programs\\GitHub CLI\\gh.exe`,
  `${process.env.USERPROFILE ?? ""}\\AppData\\Local\\Microsoft\\WindowsApps\\gh.exe`
];

/**
 * Run a command and return stdout.
 *
 * @param command Executable name.
 * @param args Command arguments.
 * @returns Command stdout.
 */
function run(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: "utf8" });
}

/**
 * Resolve a GitHub CLI executable path.
 *
 * Resolution order:
 * 1. `GH_PATH` environment variable
 * 2. `gh` from PATH
 * 3. Common Windows install locations
 *
 * @returns Executable path or command.
 */
function resolveGhExecutable(): string {
  const configured = process.env.GH_PATH?.trim();
  if (configured) return configured;

  try {
    run("gh", ["--version"]);
    return "gh";
  } catch {
    // Continue to Windows fallback candidates.
  }

  if (process.platform === "win32") {
    for (const candidate of GH_WINDOWS_CANDIDATES) {
      if (candidate.length > 0 && existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return "gh";
}

/**
 * Run GitHub CLI with fallback executable resolution.
 *
 * @param args GitHub CLI arguments.
 * @returns Command stdout.
 */
function runGh(args: string[]): string {
  const ghExecutable = resolveGhExecutable();
  return run(ghExecutable, args);
}

/**
 * Parse JSON with context-rich error text.
 *
 * @param payload Raw JSON string.
 * @param sourceName Source label for errors.
 * @returns Parsed object.
 */
function parseJson<T>(payload: string, sourceName: string): T {
  try {
    return JSON.parse(payload) as T;
  } catch (error) {
    throw new Error(`Could not parse JSON from ${sourceName}: ${String(error)}`);
  }
}

/**
 * Split owner and repository name from "owner/name".
 *
 * @param nameWithOwner GitHub `nameWithOwner` value.
 * @returns Owner and repository name.
 */
function parseOwnerAndRepo(nameWithOwner: string): { owner: string; repo: string } {
  const parts = nameWithOwner.trim().split("/");
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) {
    throw new Error(`Unexpected repository identifier: "${nameWithOwner}"`);
  }

  return { owner: parts[0], repo: parts[1] };
}

/**
 * Check whether a contributor comment dismisses a review thread.
 *
 * @param comment Review thread comment.
 * @returns True when the comment text indicates "wrong/not needed".
 */
function isContributorDismissalComment(comment: GhReviewComment): boolean {
  if (!CONTRIBUTOR_ASSOCIATIONS.has(comment.authorAssociation)) return false;
  const trimmedBody = comment.body.trim();
  if (trimmedBody.length === 0) return false;

  return DISMISSAL_PATTERNS.some((pattern) => pattern.test(trimmedBody));
}

/**
 * Determine whether a review thread should be included in the unresolved report.
 *
 * @param thread Pull request review thread.
 * @returns True when unresolved and not contributor-dismissed.
 */
export function shouldIncludeThread(thread: GhReviewThread): boolean {
  if (thread.isResolved) return false;
  if (thread.isOutdated) return false;

  const comments = thread.comments.nodes;
  if (comments.length === 0) return false;

  return !comments.some((comment) => isContributorDismissalComment(comment));
}

/**
 * Build a one-line excerpt from a thread's leading comment body.
 *
 * @param body Comment body.
 * @returns Condensed single-line excerpt.
 */
function excerpt(body: string): string {
  const condensed = body.replace(/\s+/g, " ").trim();
  if (condensed.length <= 120) return condensed;
  return `${condensed.slice(0, 117)}...`;
}

/**
 * Read the pull request attached to the current branch.
 *
 * @returns PR metadata for the checked-out branch.
 */
function getCurrentBranchPr(): PrView {
  const payload = runGh(["pr", "view", "--json", "number,title,url,baseRefName"]);
  return parseJson<PrView>(payload, "gh pr view");
}

/**
 * Read repository owner/name via GitHub CLI.
 *
 * @returns Parsed owner and repo names.
 */
function getRepositoryIdentity(): { owner: string; repo: string } {
  const payload = runGh(["repo", "view", "--json", "nameWithOwner"]);
  const parsed = parseJson<{ nameWithOwner?: unknown }>(payload, "gh repo view");

  if (typeof parsed.nameWithOwner !== "string") {
    throw new Error("GitHub CLI did not return nameWithOwner.");
  }

  return parseOwnerAndRepo(parsed.nameWithOwner);
}

/**
 * Retrieve all review threads for a pull request.
 *
 * @param owner Repository owner.
 * @param repo Repository name.
 * @param number Pull request number.
 * @returns All review threads (paginated).
 */
function getAllReviewThreads(owner: string, repo: string, number: number): GhReviewThread[] {
  const threads: GhReviewThread[] = [];
  let after: string | null = null;

  while (true) {
    const args = [
      "api",
      "graphql",
      "-f",
      `query=${GRAPHQL_QUERY}`,
      "-f",
      `owner=${owner}`,
      "-f",
      `name=${repo}`,
      "-F",
      `number=${number}`
    ];

    if (after) {
      args.push("-f", `after=${after}`);
    }

    const payload = runGh(args);
    const parsed = parseJson<GhGraphQlResponse>(payload, "gh api graphql");
    const connection = parsed.data?.repository?.pullRequest?.reviewThreads;

    if (!connection) {
      throw new Error(`Could not read review threads for PR #${number}.`);
    }

    threads.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage) break;
    after = connection.pageInfo.endCursor;
    if (!after) break;
  }

  return threads;
}

/**
 * Render unresolved comments grouped by file path.
 *
 * @param pr Pull request metadata.
 * @param threads Review threads to report.
 */
function printThreadReport(pr: PrView, threads: GhReviewThread[]): void {
  console.log(`PR #${pr.number}: ${pr.title}`);
  console.log(pr.url);
  console.log(`Base branch: ${pr.baseRefName}`);
  console.log("");

  if (threads.length === 0) {
    console.log("No unresolved review threads matched the active filter.");
    return;
  }

  const byPath = new Map<string, GhReviewThread[]>();
  for (const thread of threads) {
    const existing = byPath.get(thread.path);
    if (existing) {
      existing.push(thread);
    } else {
      byPath.set(thread.path, [thread]);
    }
  }

  const orderedPaths = Array.from(byPath.keys()).sort((left, right) => left.localeCompare(right));
  let threadCount = 0;

  for (const path of orderedPaths) {
    console.log(`File: ${path}`);
    const pathThreads = byPath.get(path) ?? [];
    pathThreads.sort((left, right) => (left.line ?? left.startLine ?? 0) - (right.line ?? right.startLine ?? 0));

    for (const thread of pathThreads) {
      threadCount += 1;
      const comments = thread.comments.nodes;
      const leadComment = comments[0];
      const latestComment = comments[comments.length - 1];
      const line = thread.line ?? thread.startLine;
      const lineLabel = line ? `L${line}` : "L?";
      const latestAuthor = latestComment.author?.login ?? "unknown";

      console.log(`  ${threadCount}. ${lineLabel} (${comments.length} comment${comments.length === 1 ? "" : "s"})`);
      console.log(`     URL: ${leadComment.url}`);
      console.log(`     Latest: @${latestAuthor} on ${latestComment.createdAt}`);
      console.log(`     Note: ${excerpt(leadComment.body)}`);
    }

    console.log("");
  }

  console.log(`Total unresolved threads: ${threadCount}`);
}

/**
 * Main script entrypoint.
 */
function main(): void {
  try {
    const pr = getCurrentBranchPr();
    const { owner, repo } = getRepositoryIdentity();
    const allThreads = getAllReviewThreads(owner, repo, pr.number);
    const included = allThreads.filter((thread) => shouldIncludeThread(thread));

    printThreadReport(pr, included);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Could not collect pull request comments.");
    console.error("Ensure GitHub CLI is installed and authenticated (`gh auth status`).");
    console.error(detail);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  main();
}
