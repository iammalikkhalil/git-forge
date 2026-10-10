/* eslint-disable @typescript-eslint/no-require-imports -- Node test loader. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function load(relative, dependencies = {}) {
  const source = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, "..", relative), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", source)(
    (name) =>
      name === "server-only"
        ? {}
        : Object.hasOwn(dependencies, name)
          ? dependencies[name]
          : require(name),
    mod,
    mod.exports,
  );
  return mod.exports;
}
const schema = load("lib/github-profile-schema.ts");
const service = load("lib/github-profile.ts", {
  "@/lib/github-profile-schema": schema,
});
const upstream = (status) =>
  Object.assign(new Error("private-error-token"), { status });
function fixture() {
  const state = {
    user: {
      id: 7,
      login: "example",
      avatar_url: "https://avatars.githubusercontent.com/u/7",
      name: "Example",
      bio: "Developer",
      blog: "https://example.com",
      location: "",
      company: "",
      hireable: false,
      email: "private@example.com",
      private_repos: 20,
    },
    scopes: "user, repo",
    socials: ["https://x.com/example"],
    calls: [],
    failSocialRead: false,
    failUpdate: false,
    failAdd: false,
    failDelete: false,
    failVerify: false,
    updated: false,
    lateSocialChange: false,
    socialReads: 0,
  };
  const client = {
    users: {
      getAuthenticated: async () => {
        if (state.failVerify && state.updated) throw upstream(500);
        return {
          data: { ...state.user },
          headers: { "x-oauth-scopes": state.scopes },
        };
      },
      listSocialAccountsForAuthenticatedUser: async () => {
        if (state.failSocialRead) throw upstream(403);
        state.socialReads++;
        if (state.lateSocialChange && state.updated && state.socialReads === 3)
          state.socials = ["https://linkedin.com/in/elsewhere"];
        return {
          data: state.socials.map((url) => ({ url, provider: "social" })),
        };
      },
      updateAuthenticated: async (patch) => {
        state.calls.push(["update", patch]);
        if (state.failUpdate) throw upstream(401);
        Object.assign(state.user, patch);
        state.updated = true;
        return { data: state.user };
      },
      deleteSocialAccountForAuthenticatedUser: async ({ account_urls }) => {
        state.calls.push(["delete", account_urls]);
        if (state.failDelete) throw upstream(429);
        state.socials = state.socials.filter(
          (url) => !account_urls.includes(url),
        );
        state.updated = true;
        return { status: 204 };
      },
      addSocialAccountForAuthenticatedUser: async ({ account_urls }) => {
        state.calls.push(["add", account_urls]);
        if (state.failAdd) throw upstream(422);
        state.socials.push(...account_urls);
        state.updated = true;
        return { data: state.socials.map((url) => ({ url })) };
      },
    },
  };
  return { client, state };
}
async function body(client, patch) {
  const profile = await service.loadGitHubProfile(client);
  return {
    expected: { id: profile.id, values: profile.values },
    desired: { ...profile.values, ...patch },
  };
}

test("profile fetch whitelists editable information and exposes read-only permission state", async () => {
  const { client, state } = fixture();
  const result = await service.loadGitHubProfile(client);
  assert.equal(result.id, 7);
  assert.equal(result.canEdit, true);
  assert.equal(result.values.socials.length, 1);
  assert.equal(JSON.stringify(result).includes("private@example.com"), false);
  assert.equal(JSON.stringify(result).includes("private_repos"), false);
  state.scopes = "read:user, user:email, repo";
  assert.equal((await service.loadGitHubProfile(client)).canEdit, false);
  state.failSocialRead = true;
  await assert.rejects(service.loadGitHubProfile(client));
});

test("only edited fields are patched; unrelated external changes are preserved", async () => {
  const { client, state } = fixture();
  const request = await body(client, {
    name: "New name",
    website: "https://new.example.com",
  });
  state.user.location = "Changed elsewhere";
  const result = await service.saveGitHubProfile(client, request);
  assert.deepEqual(state.calls, [
    ["update", { name: "New name", blog: "https://new.example.com" }],
  ]);
  assert.equal(result.profile.values.location, "Changed elsewhere");
  assert.equal(result.status, "complete");
  assert.deepEqual(result.savedFields, ["name", "website"]);
});

test("conflicting edited fields and wrong accounts are rejected before any writes", async () => {
  const { client, state } = fixture();
  const request = await body(client, { bio: "Local change" });
  state.user.bio = "External change";
  await assert.rejects(
    service.saveGitHubProfile(client, request),
    (e) => e.code === "CONFLICT",
  );
  state.user.id = 8;
  await assert.rejects(
    service.saveGitHubProfile(client, request),
    (e) => e.code === "WRONG_ACCOUNT",
  );
  assert.deepEqual(state.calls, []);
});

test("missing write scope requires reconnect and forged/invalid input never writes", async () => {
  const { client, state } = fixture();
  const request = await body(client, { name: "New" });
  state.scopes = "repo, read:user";
  await assert.rejects(
    service.saveGitHubProfile(client, request),
    (e) => e.code === "REAUTHORIZE",
  );
  state.scopes = "repo, user";
  for (const invalid of [
    { ...request, owner: "forged" },
    {
      ...request,
      desired: { ...request.desired, email: "leaked@example.com" },
    },
    {
      ...request,
      desired: { ...request.desired, website: "javascript:alert(1)" },
    },
    { ...request, desired: { ...request.desired, bio: "x".repeat(161) } },
    {
      ...request,
      desired: {
        ...request.desired,
        socials: Array(5).fill("https://x.com/example"),
      },
    },
  ])
    await assert.rejects(
      service.saveGitHubProfile(client, invalid),
      (e) => e.code === "INVALID_INPUT",
    );
  assert.deepEqual(state.calls, []);
});

test("intentional clearing works and successful replay does not update again", async () => {
  const { client, state } = fixture();
  const request = await body(client, { bio: "", website: "", socials: [] });
  const result = await service.saveGitHubProfile(client, request);
  assert.equal(result.status, "complete");
  assert.equal(state.user.bio, "");
  assert.equal(state.user.blog, "");
  assert.deepEqual(state.socials, []);
  const count = state.calls.length;
  assert.equal(
    (await service.saveGitHubProfile(client, request)).status,
    "complete",
  );
  assert.equal(state.calls.length, count);
});

test("social replacement removes first and verifies the final set", async () => {
  const { client, state } = fixture();
  const request = await body(client, {
    socials: ["https://www.linkedin.com/in/example"],
  });
  const result = await service.saveGitHubProfile(client, request);
  assert.deepEqual(
    state.calls.map(([method]) => method),
    ["delete", "add"],
  );
  assert.equal(result.status, "complete");
  assert.deepEqual(result.removedLinks, ["https://x.com/example"]);
  assert.deepEqual(result.addedLinks, request.desired.socials);
});

test("partial save reports verified profile changes and removed links, preserving retryable pending changes", async () => {
  const { client, state } = fixture();
  const request = await body(client, {
    bio: "New bio",
    socials: ["https://linkedin.com/in/example"],
  });
  state.failAdd = true;
  const result = await service.saveGitHubProfile(client, request);
  assert.equal(result.status, "partial");
  assert.deepEqual(result.savedFields, ["bio"]);
  assert.deepEqual(result.pendingFields, ["socials"]);
  assert.deepEqual(result.removedLinks, ["https://x.com/example"]);
  assert.deepEqual(result.profile.values.socials, []);
  state.failAdd = false;
  const retry = await service.saveGitHubProfile(client, {
    expected: { id: result.profile.id, values: result.profile.values },
    desired: request.desired,
  });
  assert.equal(retry.status, "complete");
  assert.equal(state.calls.filter(([method]) => method === "update").length, 1);
});

test("failed basic update stops social writes; failed delete stops additions", async () => {
  const first = fixture();
  const request = await body(first.client, { bio: "New", socials: [] });
  first.state.failUpdate = true;
  const failed = await service.saveGitHubProfile(first.client, request);
  assert.equal(failed.code, "SIGN_IN");
  assert.deepEqual(failed.savedFields, []);
  assert.deepEqual(
    first.state.calls.map(([method]) => method),
    ["update"],
  );
  const second = fixture();
  const social = await body(second.client, {
    socials: ["https://linkedin.com/in/example"],
  });
  second.state.failDelete = true;
  const result = await service.saveGitHubProfile(second.client, social);
  assert.equal(result.status, "partial");
  assert.deepEqual(
    second.state.calls.map(([method]) => method),
    ["delete"],
  );
});

test("verification failure does not claim success or report unconfirmed saved fields", async () => {
  const { client, state } = fixture();
  const request = await body(client, { name: "Updated" });
  state.failVerify = true;
  const result = await service.saveGitHubProfile(client, request);
  assert.equal(state.user.name, "Updated");
  assert.equal(result.status, "unverified");
  assert.equal(result.profile, null);
  assert.deepEqual(result.savedFields, []);
  assert.deepEqual(result.pendingFields, ["name"]);
});

test("late social conflict reports already-saved basic fields without replacing external links", async () => {
  const { client, state } = fixture();
  const request = await body(client, { bio: "New", socials: [] });
  state.lateSocialChange = true;
  const result = await service.saveGitHubProfile(client, request);
  assert.equal(result.code, "CONFLICT");
  assert.deepEqual(result.savedFields, ["bio"]);
  assert.deepEqual(
    state.calls.map(([method]) => method),
    ["update"],
  );
  assert.deepEqual(state.socials, ["https://linkedin.com/in/elsewhere"]);
});

test("completeness ignores optional personal fields and bio suggestions only use entered details", () => {
  const empty = {
    name: "",
    bio: "",
    website: "",
    location: "",
    company: "",
    hireable: false,
    socials: [],
  };
  assert.equal(schema.profileCompleteness(empty).score, 0);
  const filled = {
    ...empty,
    name: "Example",
    bio: "Developer",
    socials: ["https://x.com/example"],
  };
  assert.equal(schema.profileCompleteness(filled).score, 100);
  assert.equal(
    schema.profileCompleteness({
      ...filled,
      location: "Anywhere",
      company: "Optional",
      hireable: true,
    }).score,
    100,
  );
  assert.equal(
    schema.profileCompleteness({ ...empty, website: "javascript:bad" }).score,
    0,
  );
  assert.ok(
    schema
      .suggestBios("Developer", "React", "open source")
      .every(
        (bio) =>
          bio.includes("Developer") &&
          bio.includes("React") &&
          bio.includes("open source"),
      ),
  );
  assert.deepEqual(
    schema.changedProfileFields(filled, {
      ...filled,
      socials: ["https://x.com/example/"],
    }),
    [],
  );
});

test("API enforces sessions, same-origin writes and sanitized uncached responses", async () => {
  let token = { githubAccessToken: "secret-token" };
  let saved = 0;
  const route = load("app/api/github-profile/route.ts", {
    "@octokit/rest": { Octokit: class {} },
    "next-auth/jwt": { getToken: async () => token },
    "@/lib/github-profile": {
      ...service,
      loadGitHubProfile: async () => ({ id: 7 }),
      saveGitHubProfile: async () => {
        saved++;
        return { status: "complete" };
      },
    },
  });
  const request = (origin = "http://localhost:3000") => ({
    nextUrl: { origin: "http://localhost:3000" },
    headers: new Headers({ origin }),
    json: async () => ({}),
  });
  assert.equal(
    (await route.POST(request("https://other.example"))).status,
    403,
  );
  token = null;
  assert.equal((await route.GET(request())).status, 401);
  token = {};
  assert.equal((await route.POST(request())).status, 401);
  token = { githubAccessToken: "secret-token" };
  const response = await route.GET(request());
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal((await response.text()).includes("secret-token"), false);
  assert.equal(
    (
      await route.POST({
        ...request(),
        json: async () => {
          throw new Error();
        },
      })
    ).status,
    400,
  );
  assert.equal(saved, 0);
  assert.equal((await route.POST(request())).status, 200);
  assert.equal(saved, 1);
});
