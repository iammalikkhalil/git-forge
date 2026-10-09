import type { Octokit } from "@octokit/rest";

export class RepositoryCheckError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function checkRepositoryName(
  client: Pick<Octokit, "users" | "repos">,
  name: string,
) {
  const user = await client.users.getAuthenticated();
  const scopes = (user.headers["x-oauth-scopes"] ?? "")
    .split(",")
    .map((scope) => scope.trim());
  // A 404 is only meaningful if this token can also see private repositories.
  if (!scopes.includes("repo")) {
    throw new RepositoryCheckError(
      403,
      "REAUTHORIZE",
      "Reconnect GitHub to check both public and private repository names.",
    );
  }
  const owner = user.data.login;
  try {
    await client.repos.get({ owner, repo: name });
    return { owner, available: false };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 404
    ) {
      return { owner, available: true };
    }
    throw error;
  }
}
