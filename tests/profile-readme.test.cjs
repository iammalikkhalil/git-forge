/* eslint-disable @typescript-eslint/no-require-imports -- Node test loader. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { createHash } = require("node:crypto");

function load(relative, dependencies = {}) {
  const source = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, "..", relative), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
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
const schema = load("lib/profile-readme-schema.ts");
const service = load("lib/profile-readme.ts", {
  "@/lib/profile-readme-schema": schema,
});
const hash = (value) => createHash("sha1").update(value).digest("hex");
const upstream = (status) =>
  Object.assign(new Error("private upstream details"), { status });
function fixture() {
  const state = {
    exists: true,
    id: 100,
    branch: "main",
    private: false,
    canWrite: true,
    archived: false,
    content:
      "# Existing custom README\n\n<table><tr><td>Keep me</td></tr></table>\n",
    path: "README.md",
    writes: [],
    creates: [],
    scopes: "repo, read:user",
    failGet: null,
    race: false,
  };
  const client = {
    users: {
      getAuthenticated: async () => ({
        data: { id: 7, login: "example", name: "Example", bio: "Developer" },
        headers: { "x-oauth-scopes": state.scopes },
      }),
    },
    repos: {
      get: async ({ owner, repo }) => {
        assert.equal(owner, "example");
        assert.equal(repo, "example");
        if (state.failGet) throw upstream(state.failGet);
        if (!state.exists) throw upstream(404);
        return {
          data: {
            id: state.id,
            default_branch: state.branch,
            private: state.private,
            permissions: { push: state.canWrite },
            archived: state.archived,
          },
        };
      },
      getContent: async ({ owner, repo, path: file, ref }) => {
        assert.equal(owner, "example");
        assert.equal(repo, "example");
        if (!state.exists) throw upstream(404);
        if (file === "")
          return {
            data:
              state.content === null
                ? []
                : [{ name: state.path, path: state.path, type: "file" }],
          };
        if (state.content === null) throw upstream(404);
        const content =
          ref === "a".repeat(40) ? "# Older README\n" : state.content;
        return {
          data: {
            type: "file",
            sha: hash(content),
            content: Buffer.from(content).toString("base64"),
            encoding: "base64",
          },
        };
      },
      createForAuthenticatedUser: async (options) => {
        state.creates.push(options);
        assert.equal(options.name, "example");
        assert.equal(options.private, false);
        assert.equal(options.auto_init, false);
        if (state.exists) throw upstream(422);
        state.exists = true;
        state.content = null;
        state.id++;
        return { data: { id: state.id } };
      },
      createOrUpdateFileContents: async (options) => {
        if (state.race) throw upstream(409);
        assert.equal(options.owner, "example");
        assert.equal(options.repo, "example");
        assert.equal(options.path, state.path);
        assert.equal(options.branch, state.branch);
        assert.equal(
          options.sha ?? null,
          state.content === null ? null : hash(state.content),
        );
        state.writes.push(options);
        state.content = Buffer.from(options.content, "base64").toString("utf8");
        return {
          data: {
            content: { sha: hash(state.content) },
            commit: { sha: hash("commit") },
          },
        };
      },
      listCommits: async (options) => {
        assert.equal(options.path, state.path);
        assert.equal(options.sha, state.branch);
        return {
          data: [
            {
              sha: "a".repeat(40),
              commit: {
                message: "Previous version\nDetails",
                author: { date: "2025-01-01T00:00:00Z" },
              },
            },
          ],
        };
      },
      listForAuthenticatedUser: async (options) => {
        assert.equal(options.visibility, "public");
        assert.equal(options.affiliation, "owner");
        return {
          data: [
            {
              name: "public-project",
              description: "A real project",
              private: false,
              owner: { id: 7 },
            },
            { name: "secret", private: true, owner: { id: 7 } },
            { name: "other", private: false, owner: { id: 8 } },
          ],
        };
      },
    },
  };
  return { client, state };
}
function payload(profile, content = "# Updated README\n") {
  return {
    content,
    createPublic: false,
    expected: {
      repositoryId: profile.repositoryId,
      branch: profile.branch,
      path: profile.path,
      sha: profile.sha,
    },
  };
}

test("import preserves existing Markdown and case-sensitive root filename", async () => {
  const { client, state } = fixture();
  state.path = "readme.md";
  const result = await service.loadProfileReadme(client);
  assert.equal(result.content, state.content);
  assert.equal(result.path, "readme.md");
  assert.equal(result.sha, hash(state.content));
  assert.equal(result.repositoryId, 100);
  assert.equal(state.writes.length, 0);
  assert.equal(state.creates.length, 0);
});

test("missing repo/README and private or read-only state import without writes", async () => {
  const { client, state } = fixture();
  state.exists = false;
  assert.equal((await service.loadProfileReadme(client)).repositoryId, null);
  state.exists = true;
  state.content = null;
  assert.equal((await service.loadProfileReadme(client)).sha, null);
  state.private = true;
  state.archived = true;
  const result = await service.loadProfileReadme(client);
  assert.equal(result.private, true);
  assert.equal(result.canWrite, false);
  assert.equal(state.writes.length, 0);
});

test("permission and upstream failures never claim a missing profile repository", async () => {
  const { client, state } = fixture();
  state.scopes = "read:user";
  await assert.rejects(
    service.loadProfileReadme(client),
    (e) => e.code === "REAUTHORIZE",
  );
  state.scopes = "repo";
  for (const status of [401, 403, 429, 500]) {
    state.failGet = status;
    await assert.rejects(service.loadProfileReadme(client));
    assert.equal(
      service
        .readmeFailure(upstream(status))
        .message.includes("private upstream"),
      false,
    );
  }
});

test("updates only the current README with SHA protection and idempotent retry", async () => {
  const { client, state } = fixture();
  const profile = await service.loadProfileReadme(client);
  const body = payload(profile, "# Unicode 👋\n\nExact content preserved.\n");
  const result = await service.publishProfileReadme(client, body);
  assert.equal(result.profile.content, body.content);
  assert.equal(state.writes.length, 1);
  assert.equal(state.creates.length, 0);
  assert.equal(
    (await service.publishProfileReadme(client, body)).unchanged,
    true,
  );
  assert.equal(state.writes.length, 1);
});

test("external edits, repository recreation, default branch changes and write races cannot overwrite", async () => {
  for (const change of ["content", "id", "branch", "race"]) {
    const { client, state } = fixture();
    const body = payload(await service.loadProfileReadme(client));
    if (change === "content") state.content = "Changed elsewhere";
    if (change === "id") state.id++;
    if (change === "branch") state.branch = "other";
    if (change === "race") state.race = true;
    await assert.rejects(service.publishProfileReadme(client, body));
    assert.equal(state.writes.length, 0);
  }
});

test("public repository creation requires explicit consent; private and read-only repos never change", async () => {
  const { client, state } = fixture();
  state.exists = false;
  const body = payload(await service.loadProfileReadme(client));
  await assert.rejects(
    service.publishProfileReadme(client, body),
    (e) => e.code === "PUBLIC_CONFIRMATION",
  );
  assert.equal(state.creates.length, 0);
  await service.publishProfileReadme(client, { ...body, createPublic: true });
  assert.equal(state.creates.length, 1);
  assert.equal(state.writes.length, 1);
  for (const restriction of ["private", "canWrite", "archived"]) {
    const next = fixture();
    if (restriction === "canWrite") next.state.canWrite = false;
    else next.state[restriction] = true;
    const snapshot = await service.loadProfileReadme(next.client);
    await assert.rejects(
      service.publishProfileReadme(next.client, payload(snapshot)),
    );
    assert.equal(next.state.writes.length, 0);
    assert.equal(next.state.creates.length, 0);
  }
});

test("history restore loads the old content into a new current-SHA commit", async () => {
  const { client, state } = fixture();
  const profile = await service.loadProfileReadme(client);
  const history = await service.listReadmeHistory(client, 1);
  assert.equal(history.revisions[0].message, "Previous version");
  const old = await service.loadReadmeRevision(
    client,
    history.revisions[0].sha,
  );
  assert.equal(old.content, "# Older README\n");
  assert.equal(state.writes.length, 0);
  await service.publishProfileReadme(client, payload(profile, old.content));
  assert.equal(state.writes[0].sha, profile.sha);
  assert.equal(state.content, old.content);
});

test("projects contain only the authenticated user's public repositories", async () => {
  const { client } = fixture();
  const result = await service.listProfileProjects(client, 1);
  assert.deepEqual(
    result.projects.map((project) => project.name),
    ["public-project"],
  );
});

test("templates escape Markdown, validate links and permit incomplete draft recovery", () => {
  const form = {
    template: "professional",
    name: "<script>alert(1)</script>",
    headline: "Developer",
    bio: "**not injected**",
    skills: "TypeScript, React",
    projects: [],
    links: [{ label: "Portfolio", url: "https://example.com/a(b)" }],
    sections: ["links", "introduction", "skills"],
  };
  const content = schema.buildProfileReadme(form);
  assert.match(content, /^## Connect/);
  assert.equal(content.includes("<script>"), false);
  assert.match(content, /a%28b%29/);
  assert.equal(
    schema.readmeFormSchema.safeParse({
      ...form,
      links: [{ label: "Bad", url: "javascript:alert(1)" }],
    }).success,
    false,
  );
  assert.equal(
    schema.readmeDraftFormSchema.safeParse({
      ...form,
      links: [{ label: "", url: "https:" }],
      contactEmail: "still-typing@",
    }).success,
    true,
  );
  assert.equal(
    schema.readmeFormSchema.safeParse({
      ...form,
      sections: ["skills", "skills"],
    }).success,
    false,
  );
  assert.equal(
    schema.readmeContentSchema.safeParse("😃".repeat(30000)).success,
    false,
  );
  const snapshot = {
    repositoryId: 1,
    branch: "main",
    path: "README.md",
    sha: "a".repeat(40),
  };
  assert.equal(
    schema.readmePublishSchema.safeParse({
      content: "",
      expected: snapshot,
      createPublic: false,
    }).success,
    false,
  );
  assert.equal(
    schema.readmePublishSchema.safeParse({
      content: "ok",
      expected: snapshot,
      createPublic: false,
      owner: "forged",
    }).success,
    false,
  );
});

test("preview renders GFM and safe HTML while removing scripts and unsafe URLs", () => {
  const { ReadmePreview } = load("app/components/readme-preview.tsx");
  const { renderToStaticMarkup } = require("react-dom/server");
  const React = require("react");
  const html = renderToStaticMarkup(
    React.createElement(ReadmePreview, {
      owner: "example",
      branch: "main",
      content:
        '# Hello\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n<img src="./image.png" onerror="alert(1)"><script>alert(2)</script><iframe src="https://evil.example"></iframe>\n\n[bad](javascript:alert(3))\n\n[good](https://example.com)\n\n[relative](./docs/guide.md)',
    }),
  );
  assert.match(html, /<table>/);
  assert.match(
    html,
    /raw.githubusercontent.com\/example\/example\/main\/image.png/,
  );
  assert.match(
    html,
    /github.com\/example\/example\/blob\/main\/docs\/guide.md/,
  );
  assert.equal(
    /<script|<iframe|onerror|javascript:|alert\(2\)/i.test(html),
    false,
  );
  assert.match(html, /rel="noopener noreferrer"/);
});

test("API guards sessions, origins, invalid requests and keeps responses uncached", async () => {
  let token = { githubAccessToken: "secret-token" };
  const route = load("app/api/profile-readme/route.ts", {
    "@octokit/rest": { Octokit: class {} },
    "next-auth/jwt": { getToken: async () => token },
    "@/lib/profile-readme": {
      ...service,
      loadProfileReadme: async () => ({ owner: "example" }),
      publishProfileReadme: async (_client, body) => {
        if (!schema.readmePublishSchema.safeParse(body).success)
          throw new service.ReadmeError(
            "INVALID_INPUT",
            "Invalid README.",
            400,
          );
        return { profile: { owner: "example" } };
      },
    },
  });
  const request = (
    query = "",
    body = {},
    origin = "http://localhost:3000",
  ) => ({
    nextUrl: new URL(`http://localhost:3000/api/profile-readme${query}`),
    headers: new Headers({ origin }),
    json: async () => body,
  });
  assert.equal(
    (await route.POST(request("", {}, "https://other.example"))).status,
    403,
  );
  token = null;
  assert.equal((await route.GET(request())).status, 401);
  token = { githubAccessToken: "secret-token" };
  assert.equal((await route.POST(request())).status, 400);
  assert.equal(
    (await route.GET(request("?resource=revision&sha=bad"))).status,
    400,
  );
  assert.equal(
    (await route.GET(request("?resource=history&page=0"))).status,
    400,
  );
  assert.equal((await route.GET(request("?resource=other"))).status, 400);
  const result = await route.GET(request());
  assert.equal(result.headers.get("Cache-Control"), "no-store");
  assert.equal((await result.text()).includes("secret-token"), false);
});
