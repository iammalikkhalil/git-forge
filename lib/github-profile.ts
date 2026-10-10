import "server-only";
import type { Octokit } from "@octokit/rest";
import {
  profileSaveSchema,
  changedProfileFields,
  sameProfileField,
  socialKey,
  type GitHubProfile,
  type ProfileField,
} from "@/lib/github-profile-schema";

type Client = Pick<Octokit, "users">;
export class ProfileError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
export function profileFailure(error: unknown): ProfileError {
  if (error instanceof ProfileError) return error;
  const status =
    typeof error === "object" && error && "status" in error
      ? error.status
      : undefined;
  if (status === 401)
    return new ProfileError(
      "SIGN_IN",
      "Your GitHub authorization expired. Sign in again; your draft is kept.",
      401,
    );
  if (status === 403 || status === 429)
    return new ProfileError(
      "ACCESS_DENIED",
      "GitHub limited or denied this request. Review permissions or retry later.",
      503,
    );
  if (status === 422)
    return new ProfileError(
      "INVALID_PROFILE",
      "GitHub rejected one or more values. Check field lengths and supported social-account URLs.",
      422,
    );
  return new ProfileError(
    "GITHUB_ERROR",
    "Could not confirm GitHub's latest state. Reload before retrying; your draft is kept.",
    502,
  );
}
async function socialAccounts(client: Client) {
  const result = await client.users.listSocialAccountsForAuthenticatedUser({
    per_page: 100,
  });
  return result.data.map((account) => account.url);
}
export async function loadGitHubProfile(
  client: Client,
): Promise<GitHubProfile> {
  // A failed social-account read must not be presented as an empty profile.
  const user = await client.users.getAuthenticated();
  const socials = await socialAccounts(client);
  return {
    id: user.data.id,
    username: user.data.login,
    avatar: user.data.avatar_url,
    canEdit: (user.headers["x-oauth-scopes"] ?? "")
      .split(",")
      .map((scope) => scope.trim())
      .includes("user"),
    values: {
      name: user.data.name ?? "",
      bio: user.data.bio ?? "",
      website: user.data.blog ?? "",
      location: user.data.location ?? "",
      company: user.data.company ?? "",
      hireable: user.data.hireable ?? false,
      socials,
    },
  };
}

export async function saveGitHubProfile(client: Client, body: unknown) {
  const parsed = profileSaveSchema.safeParse(body);
  if (!parsed.success)
    throw new ProfileError(
      "INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Check your profile.",
      400,
    );
  const { expected, desired } = parsed.data;
  const current = await loadGitHubProfile(client);
  if (expected.id !== current.id)
    throw new ProfileError(
      "WRONG_ACCOUNT",
      "This draft belongs to another GitHub account. Reload your current profile.",
      403,
    );
  if (!current.canEdit)
    throw new ProfileError(
      "REAUTHORIZE",
      "Reconnect GitHub to allow profile updates.",
      403,
    );
  const changed = changedProfileFields(expected.values, desired);
  const conflicts = changed.filter(
    (field) =>
      !sameProfileField(field, current.values, expected.values) &&
      !sameProfileField(field, current.values, desired),
  );
  if (conflicts.length)
    throw new ProfileError(
      "CONFLICT",
      "An edited field changed on GitHub. Reload latest (keep draft), then review again.",
    );
  let failure: ProfileError | null = null;
  const patch: Parameters<Client["users"]["updateAuthenticated"]>[0] = {};
  for (const field of changed) {
    if (field === "socials" || sameProfileField(field, current.values, desired))
      continue;
    if (field === "website") patch.blog = desired.website;
    else if (field === "hireable") patch.hireable = desired.hireable;
    else patch[field] = desired[field];
  }
  try {
    if (Object.keys(patch).length)
      await client.users.updateAuthenticated(patch);
    if (
      changed.includes("socials") &&
      !sameProfileField("socials", current.values, desired)
    ) {
      // Recheck immediately before social mutations; unrelated profile fields are never replaced.
      const latest = await socialAccounts(client);
      if (
        !sameProfileField(
          "socials",
          { ...current.values, socials: latest },
          current.values,
        ) &&
        !sameProfileField(
          "socials",
          { ...current.values, socials: latest },
          desired,
        )
      )
        throw new ProfileError(
          "CONFLICT",
          "Social accounts changed during saving. Reload and review the remaining changes.",
        );
      const remove = latest.filter(
        (url) =>
          !desired.socials.some((item) => socialKey(item) === socialKey(url)),
      );
      const add = desired.socials.filter(
        (url) => !latest.some((item) => socialKey(item) === socialKey(url)),
      );
      // Remove first so replacing links never temporarily exceeds GitHub's four-link limit.
      if (remove.length)
        await client.users.deleteSocialAccountForAuthenticatedUser({
          account_urls: remove,
        });
      if (add.length)
        await client.users.addSocialAccountForAuthenticatedUser({
          account_urls: add,
        });
    }
  } catch (error) {
    failure = profileFailure(error);
  }
  let profile: GitHubProfile;
  try {
    profile = await loadGitHubProfile(client);
  } catch (error) {
    const verification = profileFailure(error);
    return {
      status: "unverified" as const,
      profile: null,
      savedFields: [] as ProfileField[],
      pendingFields: changed,
      addedLinks: [] as string[],
      removedLinks: [] as string[],
      code: verification.code,
      message:
        "Some changes may have been saved, but verification failed. Reload latest before retrying.",
    };
  }
  const savedFields = changed.filter((field) =>
    sameProfileField(field, profile.values, desired),
  );
  const pendingFields = changed.filter(
    (field) => !sameProfileField(field, profile.values, desired),
  );
  const addedLinks = desired.socials.filter(
    (url) =>
      !expected.values.socials.some(
        (item) => socialKey(item) === socialKey(url),
      ) &&
      profile.values.socials.some((item) => socialKey(item) === socialKey(url)),
  );
  const removedLinks = expected.values.socials.filter(
    (url) =>
      !desired.socials.some((item) => socialKey(item) === socialKey(url)) &&
      !profile.values.socials.some(
        (item) => socialKey(item) === socialKey(url),
      ),
  );
  return {
    status: pendingFields.length ? ("partial" as const) : ("complete" as const),
    profile,
    savedFields,
    pendingFields,
    addedLinks,
    removedLinks,
    code: pendingFields.length ? (failure?.code ?? "VERIFY_FAILED") : undefined,
    message: pendingFields.length
      ? (failure?.message ??
        "Some values differ from your draft. Review the remaining changes.")
      : "Your GitHub profile is saved and verified.",
  };
}
