/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Node test loader. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const git = require("isomorphic-git");
const http = require("node:http");
const { tmpdir } = require("node:os");
const { spawn, execFileSync } = require("node:child_process");

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
const schema = load("lib/project-schema.ts");
const calendar = load("lib/commit-calendar.ts", {
  "@/lib/project-schema": schema,
});
const local = load("lib/local-project.ts", {
  "@/lib/commit-calendar": calendar,
});
const receipts = load("lib/publish-receipt.ts", {
  "@/lib/commit-calendar": calendar,
});
const input = {
  repositoryName: "history-exercise",
  authorName: "Test Author",
  authorEmail: "test@example.com",
  startDate: "2025-01-01",
  endDate: "2025-12-31",
  annualCommits: 3,
  habits: { ...schema.habitDefaults },
  timeZone: "Asia/Karachi",
  seed: "publish-test",
  asOf: "2026-01-01T12:00:00.000Z",
};
const secret = "test-signing-secret";
const accessToken = "test-oauth-token";
const user = { id: 42, login: "test-owner" };
const failure = (status) =>
  Object.assign(new Error("sensitive upstream error"), { status });

function fixture(pushOverride) {
  const state = {
    user: { ...user },
    scopes: "read:user, repo",
    repo: null,
    head: null,
    pushes: 0,
    creates: 0,
    failPush: false,
    mismatch: false,
    race: false,
  };
  const client = {
    users: {
      getAuthenticated: async () => ({
        data: state.user,
        headers: { "x-oauth-scopes": state.scopes },
      }),
    },
    repos: {
      get: async () => {
        if (!state.repo) throw failure(404);
        return { data: state.repo };
      },
      createForAuthenticatedUser: async (options) => {
        state.creates++;
        assert.equal(options.private, true);
        assert.equal(options.auto_init, false);
        state.repo = {
          id: 123,
          owner: { ...user },
          private: true,
          description: options.description,
          permissions: { admin: true },
          default_branch: "main",
          archived: false,
          disabled: false,
        };
        if (state.race) throw failure(422);
        return { data: { ...state.repo, permissions: undefined } };
      },
      listBranches: async () => ({
        data: state.head ? [{ name: "main", commit: { sha: state.head } }] : [],
      }),
      update: async (options) => {
        state.repo.default_branch = options.default_branch;
        return { data: state.repo };
      },
    },
    git: {
      getRef: async () => ({
        data: { object: { sha: state.mismatch ? "different" : state.head } },
      }),
    },
  };
  const service = load("lib/github-publish.ts", {
    "@/lib/commit-calendar": calendar,
    "@/lib/local-project": local,
    "@/lib/publish-receipt": receipts,
    "isomorphic-git": {
      push: async (options) => {
        state.pushes++;
        assert.equal(options.force, false);
        assert.equal(
          options.url,
          "https://github.com/test-owner/history-exercise.git",
        );
        assert.deepEqual(options.onAuth(), {
          username: accessToken,
          password: "x-oauth-basic",
        });
        if (state.failPush) throw failure(503);
        if (pushOverride) await pushOverride(options);
        state.head = await git.resolveRef({
          fs,
          dir: options.dir,
          ref: "HEAD",
        });
        const config = await fs.promises.readFile(
          path.join(options.dir, ".git", "config"),
          "utf8",
        );
        assert.equal(config.includes(accessToken), false);
        return { ok: true, refs: { "refs/heads/main": { ok: true } } };
      },
    },
  });
  return { client, service, state };
}

test("signed receipts bind original input and reject tampering, wrong secrets and expiry", () => {
  const receipt = receipts.signPublishReceipt(input, user, secret);
  assert.deepEqual(receipts.readPublishReceipt(receipt, secret).input, input);
  assert.throws(
    () => receipts.readPublishReceipt(`${receipt}x`, secret),
    /invalid/,
  );
  assert.throws(() => receipts.readPublishReceipt(receipt, "other"), /invalid/);
  const [payload, sig] = receipt.split(".");
  const data = JSON.parse(Buffer.from(payload, "base64url"));
  data.input.authorEmail = "changed@example.com";
  assert.throws(
    () =>
      receipts.readPublishReceipt(
        `${Buffer.from(JSON.stringify(data)).toString("base64url")}.${sig}`,
        secret,
      ),
    /invalid/,
  );
  const now = Date.now;
  try {
    Date.now = () => now() + 25 * 60 * 60 * 1000;
    assert.throws(
      () => receipts.readPublishReceipt(receipt, secret),
      /expired/,
    );
  } finally {
    Date.now = now;
  }
});

test("prepare rejects existing names, missing scope and zero volume without writes", async () => {
  const { client, service, state } = fixture();
  state.scopes = "read:user";
  await assert.rejects(
    service.preparePublish(client, input, secret),
    (e) => e.code === "REAUTHORIZE",
  );
  state.scopes = "repo";
  state.repo = {};
  await assert.rejects(
    service.preparePublish(client, input, secret),
    (e) => e.code === "NAME_TAKEN",
  );
  state.repo = null;
  await assert.rejects(
    service.preparePublish(client, { ...input, annualCommits: 0 }, secret),
    (e) => e.code === "COMMIT_LIMIT",
  );
  const prepared = await service.preparePublish(client, input, secret);
  assert.equal(prepared.count, 3);
  assert.equal(state.creates, 0);
  assert.equal(JSON.stringify(prepared).includes(accessToken), false);
});

test("reload status clears missing repositories without writes and distinguishes GitHub errors", async () => {
  const { client, service, state } = fixture();
  const { receipt } = await service.preparePublish(client, input, secret);
  assert.deepEqual(await service.inspectPublish(client, receipt, secret), {
    state: "missing",
  });
  assert.equal(state.creates, 0);
  assert.equal(state.pushes, 0);
  await service.publishProject(client, accessToken, receipt, secret);
  assert.deepEqual(await service.inspectPublish(client, receipt, secret), {
    state: "pending",
  });
  const creates = state.creates;
  const pushes = state.pushes;
  state.repo = null; // The user deletes the repository directly on GitHub.
  assert.deepEqual(await service.inspectPublish(client, receipt, secret), {
    state: "missing",
  });
  assert.equal(state.creates, creates);
  assert.equal(state.pushes, pushes);
  const originalGet = client.repos.get;
  for (const status of [401, 403, 429, 500]) {
    client.repos.get = async () => {
      throw failure(status);
    };
    await assert.rejects(service.inspectPublish(client, receipt, secret));
  }
  client.repos.get = originalGet;
  state.user = { id: 99, login: "other" };
  await assert.rejects(
    service.inspectPublish(client, receipt, secret),
    (e) => e.code === "WRONG_ACCOUNT",
  );
});

test("private upload verifies SHA, resumes after failed push and replays without creating or pushing again", async () => {
  const { client, service, state } = fixture();
  const { receipt } = await service.preparePublish(client, input, secret);
  state.failPush = true;
  await assert.rejects(
    service.publishProject(client, accessToken, receipt, secret),
  );
  assert.equal(state.creates, 1);
  assert.equal(state.repo.private, true);
  state.failPush = false;
  const steps = [];
  const result = await service.publishProject(
    client,
    accessToken,
    receipt,
    secret,
    (step) => steps.push(step),
  );
  assert.equal(result.count, 3);
  assert.equal(result.head, state.head);
  assert.deepEqual(steps, [
    "checking",
    "generating",
    "creating",
    "uploading",
    "verifying",
  ]);
  const replay = await service.publishProject(
    client,
    accessToken,
    receipt,
    secret,
  );
  assert.deepEqual(replay, result);
  assert.equal(state.creates, 1);
  assert.equal(state.pushes, 2);
});

test("wrong account, unrelated repository, public repository and changed history never push", async () => {
  const { client, service, state } = fixture();
  const { receipt } = await service.preparePublish(client, input, secret);
  state.user = { id: 99, login: "other" };
  await assert.rejects(
    service.publishProject(client, accessToken, receipt, secret),
    (e) => e.code === "WRONG_ACCOUNT",
  );
  state.user = user;
  state.repo = {
    owner: user,
    private: true,
    description: "unrelated",
    permissions: { admin: true },
  };
  await assert.rejects(
    service.publishProject(client, accessToken, receipt, secret),
    (e) => e.code === "REPOSITORY_CHANGED",
  );
  state.repo.description = `Git Forge history exercise [operation:${receipts.readPublishReceipt(receipt, secret).operation}]`;
  state.repo.private = false;
  await assert.rejects(
    service.publishProject(client, accessToken, receipt, secret),
    (e) => e.code === "REPOSITORY_CHANGED",
  );
  state.repo.private = true;
  state.head = "unrelated-sha";
  await assert.rejects(
    service.publishProject(client, accessToken, receipt, secret),
    (e) => e.code === "REMOTE_CHANGED",
  );
  assert.equal(state.pushes, 0);
  assert.equal(state.creates, 0);
});

test("concurrent create race recovers safely and verification failures stay retryable", async () => {
  const { client, service, state } = fixture();
  const { receipt } = await service.preparePublish(client, input, secret);
  state.race = true;
  state.mismatch = true;
  await assert.rejects(
    service.publishProject(client, accessToken, receipt, secret),
    (e) => e.code === "VERIFICATION_FAILED",
  );
  state.mismatch = false;
  assert.equal(
    (await service.publishProject(client, accessToken, receipt, secret)).head,
    state.head,
  );
  assert.equal(state.creates, 1);
  assert.equal(state.pushes, 1);
  for (const status of [401, 403, 429, 500]) {
    const error = service.publishFailure(failure(status));
    assert.equal(error.message.includes("sensitive"), false);
    assert.equal(
      error.code,
      status === 401
        ? "SIGN_IN"
        : status === 500
          ? "UPLOAD_FAILED"
          : "GITHUB_LIMIT",
    );
  }
});

test("real Git smart-HTTP push authenticates and preserves generated history", async (t) => {
  const workspace = await fs.promises.mkdtemp(
    path.join(tmpdir(), "git-forge-http-test-"),
  );
  const bare = path.join(workspace, "remote.git");
  execFileSync("git", ["init", "--bare", "--initial-branch=main", bare], {
    stdio: "pipe",
  });
  execFileSync("git", ["-C", bare, "config", "http.receivepack", "true"]);
  const execPath = execFileSync("git", ["--exec-path"], {
    encoding: "utf8",
  }).trim();
  const backend = path.join(
    execPath,
    process.platform === "win32" ? "git-http-backend.exe" : "git-http-backend",
  );
  let authenticated = 0;
  const server = http.createServer(async (request, response) => {
    const expected = `Basic ${Buffer.from(`${accessToken}:x-oauth-basic`).toString("base64")}`;
    if (request.headers.authorization !== expected) {
      response.writeHead(401, { "WWW-Authenticate": "Basic realm=Git" });
      response.end();
      return;
    }
    authenticated++;
    const buffers = [];
    for await (const chunk of request) buffers.push(chunk);
    const body = Buffer.concat(buffers);
    const url = new URL(request.url, "http://localhost");
    const child = spawn(backend, [], {
      env: {
        ...process.env,
        GIT_PROJECT_ROOT: workspace,
        GIT_HTTP_EXPORT_ALL: "1",
        PATH_INFO: url.pathname,
        QUERY_STRING: url.search.slice(1),
        REQUEST_METHOD: request.method,
        CONTENT_TYPE: request.headers["content-type"] ?? "",
        CONTENT_LENGTH: String(body.length),
        REMOTE_USER: "test-user",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const output = [];
    child.stdout.on("data", (chunk) => output.push(chunk));
    child.stderr.resume();
    child.on("error", () => {
      response.writeHead(500);
      response.end();
    });
    child.on("close", () => {
      const raw = Buffer.concat(output);
      const split = raw.indexOf("\r\n\r\n");
      if (split < 0) {
        response.writeHead(500);
        response.end();
        return;
      }
      const headers = {};
      let status = 200;
      for (const line of raw.subarray(0, split).toString().split("\r\n")) {
        const colon = line.indexOf(":");
        if (colon < 0) continue;
        const name = line.slice(0, colon).toLowerCase();
        const value = line.slice(colon + 1).trim();
        if (name === "status") status = Number(value.split(" ")[0]);
        else headers[name] = value;
      }
      response.writeHead(status, headers);
      response.end(raw.subarray(split + 4));
    });
    child.stdin.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/remote.git`;
  try {
    const { client, service } = fixture(async (options) => {
      const result = await git.push({ ...options, url });
      assert.equal(result.ok, true);
      assert.equal(result.refs["refs/heads/main"].ok, true);
    });
    const { receipt } = await service.preparePublish(client, input, secret);
    const result = await service.publishProject(
      client,
      accessToken,
      receipt,
      secret,
    );
    assert.equal(
      execFileSync("git", ["-C", bare, "rev-parse", "main"], {
        encoding: "utf8",
      }).trim(),
      result.head,
    );
    assert.equal(
      execFileSync("git", ["-C", bare, "rev-list", "--count", "main"], {
        encoding: "utf8",
      }).trim(),
      "3",
    );
    execFileSync("git", ["-C", bare, "fsck", "--full"], { stdio: "pipe" });
    assert.ok(authenticated >= 2);
    t.diagnostic(
      "Actual isomorphic-git smart-HTTP push and native Git fsck passed.",
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.promises.rm(workspace, { recursive: true, force: true });
  }
});

test("publish route authenticates, validates and streams progress and sanitized outcomes", async () => {
  let token = { githubAccessToken: accessToken };
  let fail = false;
  let calls = 0;
  const previousSecret = process.env.NEXTAUTH_SECRET;
  process.env.NEXTAUTH_SECRET = secret;
  const route = load("app/api/projects/publish/route.ts", {
    "@octokit/rest": { Octokit: class {} },
    "next-auth/jwt": { getToken: async () => token },
    "@/lib/commit-calendar": calendar,
    "@/lib/github-publish": {
      inspectPublish: async () => ({ state: "missing" }),
      preparePublish: async () => ({
        receipt: "signed",
        count: 3,
        fullName: "test-owner/history-exercise",
      }),
      publishFailure: (error) =>
        error instanceof receipts.PublishError
          ? error
          : new receipts.PublishError(
              "UPLOAD_FAILED",
              "Safe upload error",
              502,
            ),
      publishProject: async (_client, auth, _receipt, _secret, progress) => {
        calls++;
        assert.equal(auth, accessToken);
        progress("checking");
        progress("uploading");
        if (fail) throw new Error(accessToken);
        return {
          url: "https://github.com/test-owner/history-exercise",
          count: 3,
          head: "head",
        };
      },
    },
  });
  function request(body, origin = "http://localhost:3000") {
    return {
      nextUrl: { origin: "http://localhost:3000" },
      headers: new Headers({ origin }),
      json: async () => body,
      signal: new AbortController().signal,
    };
  }
  try {
    const body = { action: "prepare", input };
    assert.equal(
      (await route.POST(request(body, "https://other.example"))).status,
      403,
    );
    token = null;
    assert.equal((await route.POST(request(body))).status, 401);
    token = {};
    assert.equal((await route.POST(request(body))).status, 401);
    token = { githubAccessToken: accessToken };
    assert.equal(
      (await route.POST(request({ ...body, owner: "forged" }))).status,
      400,
    );
    const prepared = await route.POST(request(body));
    assert.equal(prepared.status, 200);
    assert.equal((await prepared.json()).receipt, "signed");
    assert.equal(calls, 0);
    const checked = await route.POST(
      request({ action: "status", receipt: "signed" }),
    );
    assert.deepEqual(await checked.json(), { state: "missing" });
    assert.equal(calls, 0);
    const response = await route.POST(
      request({ action: "publish", receipt: "signed" }),
    );
    assert.equal(
      response.headers.get("Cache-Control"),
      "no-store, no-transform",
    );
    const events = (await response.text()).trim().split("\n").map(JSON.parse);
    assert.deepEqual(
      events.map((event) => event.type),
      ["progress", "progress", "success"],
    );
    fail = true;
    const failed = await route.POST(
      request({ action: "publish", receipt: "signed" }),
    );
    const text = await failed.text();
    assert.equal(text.includes(accessToken), false);
    assert.match(text, /Safe upload error/);
  } finally {
    if (previousSecret === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = previousSecret;
  }
});
