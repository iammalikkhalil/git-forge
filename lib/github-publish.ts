import "server-only";
import * as fs from "node:fs";
import * as git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import type { Octokit } from "@octokit/rest";
import {
  generateCommitCalendar,
  type CalendarInput,
} from "@/lib/commit-calendar";
import { MAX_LOCAL_COMMITS, withLocalProject } from "@/lib/local-project";
import {
  PublishError,
  readPublishReceipt,
  signPublishReceipt,
  type PublishReceipt,
} from "@/lib/publish-receipt";

type Client = Pick<Octokit, "users" | "repos" | "git">;
export type PublishStep =
  "checking" | "generating" | "creating" | "uploading" | "verifying";
export type PublishResult = {
  url: string;
  fullName: string;
  count: number;
  head: string;
};

function statusOf(error: unknown): unknown {
  if (typeof error !== "object" || !error) return undefined;
  if ("status" in error) return error.status;
  if (
    "data" in error &&
    typeof error.data === "object" &&
    error.data &&
    "statusCode" in error.data
  )
    return error.data.statusCode;
}

export function publishFailure(error: unknown): PublishError {
  if (error instanceof PublishError) return error;
  const status = statusOf(error);
  if (status === 401)
    return new PublishError(
      "SIGN_IN",
      "GitHub authorization expired. Sign in again, then retry this upload.",
      401,
    );
  if (status === 403 || status === 429)
    return new PublishError(
      "GITHUB_LIMIT",
      "GitHub limited or denied this request. Review permissions or wait before retrying the same upload.",
      503,
    );
  if (status === 422)
    return new PublishError(
      "REPOSITORY_REJECTED",
      "GitHub could not create this repository. Check the name and account restrictions.",
      409,
    );
  return new PublishError(
    "UPLOAD_FAILED",
    "Upload could not be confirmed. Retry the same upload; a repository may already have been created.",
    502,
  );
}

async function authenticatedUser(client: Client) {
  const user = await client.users.getAuthenticated();
  if (
    !(user.headers["x-oauth-scopes"] ?? "")
      .split(",")
      .map((scope) => scope.trim())
      .includes("repo")
  )
    throw new PublishError(
      "REAUTHORIZE",
      "Reconnect GitHub to allow private repository creation and upload.",
      403,
    );
  return user.data;
}

function validateTotal(input: CalendarInput) {
  const total = generateCommitCalendar(input).total;
  if (total < 1 || total > MAX_LOCAL_COMMITS)
    throw new PublishError(
      "COMMIT_LIMIT",
      `Choose a preview with 1–${MAX_LOCAL_COMMITS} total commits.`,
      422,
    );
  return total;
}

async function findRepository(client: Client, owner: string, repo: string) {
  try {
    return (await client.repos.get({ owner, repo })).data;
  } catch (error) {
    if (statusOf(error) === 404) return null;
    throw error;
  }
}

export async function preparePublish(
  client: Client,
  input: CalendarInput,
  secret: string,
) {
  const count = validateTotal(input);
  const user = await authenticatedUser(client);
  if (await findRepository(client, user.login, input.repositoryName))
    throw new PublishError(
      "NAME_TAKEN",
      "This repository already exists. Choose another name.",
    );
  return {
    receipt: signPublishReceipt(input, user, secret),
    fullName: `${user.login}/${input.repositoryName}`,
    count,
  };
}

function marker(receipt: PublishReceipt) {
  return `GitHubKit history exercise [operation:${receipt.operation}]`;
}

function checkOwnedRepository(
  repo: NonNullable<Awaited<ReturnType<typeof findRepository>>>,
  receipt: PublishReceipt,
) {
  if (
    repo.owner.id !== receipt.userId ||
    !repo.private ||
    // Existing receipts must still recover repositories created before rebranding.
    (repo.description !== marker(receipt) &&
      repo.description !==
        `GitAura history exercise [operation:${receipt.operation}]` &&
      repo.description !==
        `Git Forge history exercise [operation:${receipt.operation}]`) ||
    !repo.permissions?.admin ||
    repo.archived ||
    repo.disabled
  )
    throw new PublishError(
      "REPOSITORY_CHANGED",
      "This repository is not the private repository for this upload, or its permissions changed. No history was overwritten.",
    );
}

/** Read-only recovery check; missing repositories are never recreated on reload. */
export async function inspectPublish(
  client: Client,
  signedReceipt: string,
  secret: string,
) {
  const receipt = readPublishReceipt(signedReceipt, secret);
  const user = await authenticatedUser(client);
  if (user.id !== receipt.userId || user.login !== receipt.owner)
    throw new PublishError(
      "WRONG_ACCOUNT",
      "Sign in with the GitHub account that started this upload.",
      403,
    );
  const repo = await findRepository(
    client,
    user.login,
    receipt.input.repositoryName,
  );
  if (!repo) return { state: "missing" as const };
  checkOwnedRepository(repo, receipt);
  return { state: "pending" as const };
}

export async function pushLocalHistory(
  dir: string,
  url: string,
  token: string,
  signal?: AbortSignal,
) {
  // Credentials exist only in this callback, never in .git/config or the URL.
  const result = await git.push({
    fs,
    http,
    dir,
    url,
    ref: "main",
    remoteRef: "main",
    force: false,
    onAuth: () => ({ username: token, password: "x-oauth-basic" }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(120_000)])
      : AbortSignal.timeout(120_000),
  });
  if (!result.ok || !result.refs["refs/heads/main"]?.ok)
    throw new PublishError(
      "PUSH_REJECTED",
      "GitHub rejected the Git push. Retry this upload after reviewing repository access.",
      502,
    );
}

export async function publishProject(
  client: Client,
  accessToken: string,
  signedReceipt: string,
  secret: string,
  progress: (step: PublishStep) => void = () => {},
  signal?: AbortSignal,
): Promise<PublishResult> {
  const receipt = readPublishReceipt(signedReceipt, secret);
  const count = validateTotal(receipt.input);
  progress("checking");
  const user = await authenticatedUser(client);
  if (user.id !== receipt.userId || user.login !== receipt.owner)
    throw new PublishError(
      "WRONG_ACCOUNT",
      "Sign in with the GitHub account that started this upload.",
      403,
    );
  const owner = user.login;
  const repo = receipt.input.repositoryName;
  const existing = await findRepository(client, owner, repo);
  if (existing) checkOwnedRepository(existing, receipt);
  progress("generating");
  return withLocalProject(
    receipt.input,
    async (project) => {
      if (!project.head || project.count !== count)
        throw new Error("Unexpected local history.");
      signal?.throwIfAborted();
      progress("creating");
      // Check again after generation, including on retries and concurrent requests.
      let remote = await findRepository(client, owner, repo);
      if (!remote) {
        try {
          remote = (
            await client.repos.createForAuthenticatedUser({
              name: repo,
              private: true,
              auto_init: false,
              description: marker(receipt),
            })
          ).data;
        } catch (error) {
          if (statusOf(error) !== 422) throw error;
          remote = await findRepository(client, owner, repo);
          if (!remote) throw error;
        }
        // Creation responses may omit permissions; read the repository before push.
        remote = await findRepository(client, owner, repo);
        if (!remote) throw new Error("Created repository is not yet visible.");
      }
      checkOwnedRepository(remote, receipt);
      const branches = (
        await client.repos.listBranches({ owner, repo, per_page: 100 })
      ).data;
      if (
        branches.length &&
        !(
          branches.length === 1 &&
          branches[0].name === "main" &&
          branches[0].commit.sha === project.head
        )
      )
        throw new PublishError(
          "REMOTE_CHANGED",
          "The repository contains a different history. No history was overwritten.",
        );
      if (!branches.length) {
        progress("uploading");
        await pushLocalHistory(
          project.dir,
          `https://github.com/${owner}/${repo}.git`,
          accessToken,
          signal,
        );
      }
      progress("verifying");
      const ref = await client.git.getRef({ owner, repo, ref: "heads/main" });
      if (ref.data.object.sha !== project.head)
        throw new PublishError(
          "VERIFICATION_FAILED",
          "The remote commit does not match this preview. Retry to check the upload.",
          502,
        );
      remote = (await client.repos.get({ owner, repo })).data;
      checkOwnedRepository(remote, receipt);
      if (remote.default_branch !== "main")
        await client.repos.update({ owner, repo, default_branch: "main" });
      return {
        url: `https://github.com/${owner}/${repo}`,
        fullName: `${owner}/${repo}`,
        count,
        head: project.head,
      };
    },
    signal,
  );
}
