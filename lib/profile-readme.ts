import "server-only";
import type { Octokit } from "@octokit/rest";
import {
  MAX_README_BYTES,
  readmePublishSchema,
  type ProfileReadme,
} from "@/lib/profile-readme-schema";

type Client = Pick<Octokit, "users" | "repos">;
export class ReadmeError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
function statusOf(error: unknown) {
  return typeof error === "object" && error && "status" in error
    ? error.status
    : undefined;
}
export function readmeFailure(error: unknown): ReadmeError {
  if (error instanceof ReadmeError) return error;
  const status = statusOf(error);
  if (status === 401)
    return new ReadmeError(
      "SIGN_IN",
      "Your GitHub authorization expired. Sign in again.",
      401,
    );
  if (status === 403 || status === 429)
    return new ReadmeError(
      "ACCESS_DENIED",
      "GitHub limited or denied this request. Review repository permissions or retry later.",
      503,
    );
  if (status === 409 || status === 422)
    return new ReadmeError(
      "CONFLICT",
      "GitHub rejected this change. Reload the latest README and review your draft before publishing.",
    );
  if (status === 404)
    return new ReadmeError(
      "NOT_FOUND",
      "This repository or README revision is no longer available.",
      404,
    );
  return new ReadmeError(
    "GITHUB_ERROR",
    "Could not reach GitHub. Your draft is preserved; please retry.",
    502,
  );
}
async function profileUser(client: Client) {
  const result = await client.users.getAuthenticated();
  if (
    !(result.headers["x-oauth-scopes"] ?? "")
      .split(",")
      .map((scope) => scope.trim())
      .includes("repo")
  )
    throw new ReadmeError(
      "REAUTHORIZE",
      "Reconnect GitHub to import and publish your profile README.",
      403,
    );
  return result.data;
}
async function repository(client: Client, owner: string) {
  try {
    return (await client.repos.get({ owner, repo: owner })).data;
  } catch (error) {
    if (statusOf(error) === 404) return null;
    throw error;
  }
}
function fileContent(data: unknown): { sha: string; content: string } {
  if (
    !data ||
    typeof data !== "object" ||
    !("type" in data) ||
    data.type !== "file" ||
    !("encoding" in data) ||
    data.encoding !== "base64" ||
    !("content" in data) ||
    typeof data.content !== "string" ||
    !("sha" in data) ||
    typeof data.sha !== "string"
  )
    throw new ReadmeError(
      "UNSUPPORTED_README",
      "The root README must be a regular Markdown file smaller than 100 KB.",
      422,
    );
  const content = Buffer.from(data.content, "base64");
  if (content.length > MAX_README_BYTES)
    throw new ReadmeError(
      "TOO_LARGE",
      "This README exceeds the 100 KB editor limit.",
      422,
    );
  return { sha: data.sha, content: content.toString("utf8") };
}

export async function loadProfileReadme(
  client: Client,
): Promise<ProfileReadme> {
  const user = await profileUser(client);
  const repo = await repository(client, user.login);
  const snapshot: ProfileReadme = {
    owner: user.login,
    name: user.name ?? user.login,
    bio: user.bio ?? "",
    repositoryId: repo?.id ?? null,
    branch: repo?.default_branch ?? null,
    path: "README.md",
    sha: null,
    content: "",
    private: repo?.private ?? false,
    canWrite:
      !repo || (!!repo.permissions?.push && !repo.archived && !repo.disabled),
  };
  if (!repo) return snapshot;
  let entries;
  try {
    entries = (
      await client.repos.getContent({
        owner: user.login,
        repo: user.login,
        path: "",
        ref: repo.default_branch,
      })
    ).data;
  } catch (error) {
    if (statusOf(error) === 404 || statusOf(error) === 409) return snapshot;
    throw error;
  }
  if (!Array.isArray(entries))
    throw new ReadmeError(
      "UNSUPPORTED_README",
      "Could not read the repository root.",
      422,
    );
  const readme =
    entries.find((entry) => entry.name === "README.md") ??
    entries.find((entry) => /^readme\.md$/i.test(entry.name));
  if (!readme) return snapshot;
  if (readme.type !== "file")
    throw new ReadmeError(
      "UNSUPPORTED_README",
      "The root README must be a regular Markdown file.",
      422,
    );
  snapshot.path = readme.path;
  const data = (
    await client.repos.getContent({
      owner: user.login,
      repo: user.login,
      path: snapshot.path,
      ref: repo.default_branch,
    })
  ).data;
  return { ...snapshot, ...fileContent(data) };
}

export async function listProfileProjects(client: Client, page: number) {
  const user = await profileUser(client);
  const result = await client.repos.listForAuthenticatedUser({
    visibility: "public",
    affiliation: "owner",
    sort: "updated",
    per_page: 30,
    page,
  });
  return {
    projects: result.data
      .filter((repo) => !repo.private && repo.owner.id === user.id)
      .map((repo) => ({
        name: repo.name,
        description: repo.description ?? "",
        url: `https://github.com/${user.login}/${repo.name}`,
      })),
    hasMore: result.data.length === 30,
  };
}

export async function listReadmeHistory(client: Client, page: number) {
  const profile = await loadProfileReadme(client);
  if (!profile.repositoryId || !profile.sha)
    return { revisions: [], hasMore: false };
  const result = await client.repos.listCommits({
    owner: profile.owner,
    repo: profile.owner,
    path: profile.path,
    sha: profile.branch!,
    per_page: 20,
    page,
  });
  return {
    revisions: result.data.map((entry) => ({
      sha: entry.sha,
      message: entry.commit.message.split("\n")[0],
      date: entry.commit.author?.date ?? null,
    })),
    hasMore: result.data.length === 20,
  };
}

export async function loadReadmeRevision(client: Client, sha: string) {
  const profile = await loadProfileReadme(client);
  if (!profile.repositoryId)
    throw new ReadmeError(
      "NOT_FOUND",
      "The profile repository no longer exists.",
      404,
    );
  const data = (
    await client.repos.getContent({
      owner: profile.owner,
      repo: profile.owner,
      path: profile.path,
      ref: sha,
    })
  ).data;
  return { content: fileContent(data).content };
}

export async function publishProfileReadme(client: Client, body: unknown) {
  const parsed = readmePublishSchema.safeParse(body);
  if (!parsed.success)
    throw new ReadmeError(
      "INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Check your README.",
      400,
    );
  const { content, expected, createPublic } = parsed.data;
  let current = await loadProfileReadme(client);
  if (current.private)
    throw new ReadmeError(
      "PRIVATE_REPOSITORY",
      "Your profile repository is private. Make it public in GitHub settings before publishing a profile README.",
    );
  if (!current.canWrite)
    throw new ReadmeError(
      "READ_ONLY",
      "You cannot write to this profile repository. Check its permissions and archive status.",
      403,
    );
  if (
    current.repositoryId !== expected.repositoryId ||
    current.branch !== expected.branch ||
    current.path !== expected.path
  )
    throw new ReadmeError(
      "CONFLICT",
      "The repository or default branch changed. Reload the latest README before publishing.",
    );
  if (current.sha && current.content === content)
    return { profile: current, unchanged: true };
  if (current.sha !== expected.sha)
    throw new ReadmeError(
      "CONFLICT",
      "The README changed on GitHub. Reload it and review your draft before publishing.",
    );
  if (!current.repositoryId) {
    if (!createPublic)
      throw new ReadmeError(
        "PUBLIC_CONFIRMATION",
        "Confirm creation of your public profile repository.",
        400,
      );
    await client.repos.createForAuthenticatedUser({
      name: current.owner,
      private: false,
      auto_init: false,
      description: "My GitHub profile README",
    });
    current = await loadProfileReadme(client);
    if (
      !current.repositoryId ||
      current.private ||
      current.sha ||
      !current.canWrite
    )
      throw new ReadmeError(
        "CONFLICT",
        "Repository state changed during creation. Reload and review before publishing.",
      );
  }
  await client.repos.createOrUpdateFileContents({
    owner: current.owner,
    repo: current.owner,
    path: current.path,
    branch: current.branch!,
    message: "Update profile README with GitHubKit",
    content: Buffer.from(content).toString("base64"),
    ...(current.sha ? { sha: current.sha } : {}),
  });
  const profile = await loadProfileReadme(client);
  if (profile.content !== content || profile.private)
    throw new ReadmeError(
      "VERIFY_FAILED",
      "The latest README differs from your draft. Reload GitHub before trying again.",
    );
  return { profile, unchanged: false };
}
