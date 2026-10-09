/* eslint-disable @typescript-eslint/no-require-imports -- Node test loader. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const git = require("isomorphic-git");
const tar = require("tar");
const { tmpdir } = require("node:os");
const { execFileSync } = require("node:child_process");

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
      Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
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
const input = {
  repositoryName: "history-exercise",
  authorName: "Test Author",
  authorEmail: "test@example.com",
  startDate: "2025-01-01",
  endDate: "2025-12-31",
  annualCommits: 500,
  habits: { ...schema.habitDefaults },
  timeZone: "America/New_York",
  seed: "local-500",
  asOf: "2026-01-01T12:00:00.000Z",
};

test("500 real commits match preview, are valid to native Git, and clean up", async (t) => {
  let directory;
  const expected = calendar.generateCommitCalendar(input);
  assert.equal(expected.total, 500);
  await local.withLocalProject(input, async (project) => {
    directory = project.dir;
    const history = await git.log({ fs, dir: project.dir });
    assert.equal(history.length, 500);
    const times = [...expected.commits].reverse();
    for (const [index, { commit }] of history.entries()) {
      assert.equal(commit.author.name, input.authorName);
      assert.equal(commit.author.email, input.authorEmail);
      assert.equal(
        commit.author.timestamp,
        Math.floor(Date.parse(times[index]) / 1000),
      );
      assert.deepEqual(commit.committer, commit.author);
    }
    // Native Git is only used as an independent test oracle, never by the app.
    execFileSync("git", ["-C", project.dir, "fsck", "--full"], {
      stdio: "pipe",
    });
    assert.equal(
      execFileSync("git", ["-C", project.dir, "rev-list", "--count", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      "500",
    );
    assert.equal(
      execFileSync("git", ["-C", project.dir, "status", "--porcelain"], {
        encoding: "utf8",
      }).trim(),
      "",
    );
    const bytes = async (dir) => {
      let size = 0;
      for (const item of await fs.promises.readdir(dir, {
        withFileTypes: true,
      })) {
        const target = path.join(dir, item.name);
        size += item.isDirectory()
          ? await bytes(target)
          : (await fs.promises.stat(target)).size;
      }
      return size;
    };
    t.diagnostic(
      JSON.stringify({
        commits: project.count,
        generationMs: project.generationMs,
        diskBytes: await bytes(project.dir),
        rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      }),
    );
  });
  assert.equal(fs.existsSync(directory), false);
});

test("archive preserves .git and README and can reproduce identical history", async () => {
  const small = { ...input, annualCommits: 3 };
  const first = await local.createProjectArchive(small);
  const second = await local.createProjectArchive(small);
  assert.equal(first.head, second.head);
  const workspace = await fs.promises.mkdtemp(
    path.join(tmpdir(), "git-forge-test-"),
  );
  try {
    const archive = path.join(workspace, "project.tar.gz");
    await fs.promises.writeFile(archive, first.archive);
    await tar.extract({ file: archive, cwd: workspace });
    const dir = path.join(workspace, input.repositoryName);
    assert.equal((await git.log({ fs, dir })).length, 3);
    assert.match(
      await fs.promises.readFile(path.join(dir, "README.md"), "utf8"),
      /Progress entry: 3/,
    );
    assert.deepEqual(await fs.promises.readdir(dir), [".git", "README.md"]);
  } finally {
    await fs.promises.rm(workspace, { recursive: true, force: true });
  }
});

test("zero commits, limits, cancellation, and failing consumers are handled", async () => {
  let directory;
  await local.withLocalProject(
    { ...input, annualCommits: 0 },
    async (project) => {
      directory = project.dir;
      assert.equal(project.count, 0);
      assert.equal(project.head, null);
      assert.equal(await git.currentBranch({ fs, dir: project.dir }), "main");
    },
  );
  assert.equal(fs.existsSync(directory), false);
  await assert.rejects(
    local.withLocalProject({ ...input, annualCommits: 1 }, async (project) => {
      directory = project.dir;
      throw new Error("consumer failed");
    }),
    /consumer failed/,
  );
  assert.equal(fs.existsSync(directory), false);
  await assert.rejects(
    local.withLocalProject(
      { ...input, startDate: "2020-01-01" },
      async () => {},
    ),
    local.ProjectLimitError,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    local.withLocalProject(
      input,
      async () => assert.fail("should not run"),
      controller.signal,
    ),
    /abort/i,
  );
});

test("download endpoint guards origin, session, validation and returns private archive", async () => {
  let signedIn = true;
  let calls = 0;
  const route = load("app/api/projects/generate/route.ts", {
    "next-auth/jwt": {
      getToken: async () => (signedIn ? { sub: "user" } : null),
    },
    "@/lib/commit-calendar": calendar,
    "@/lib/local-project": {
      ProjectLimitError: local.ProjectLimitError,
      createProjectArchive: async (body) => {
        calls++;
        if (body.annualCommits === 999)
          throw new local.ProjectLimitError("Too many commits.");
        return {
          archive: Buffer.from("archive"),
          count: 500,
          generationMs: 100,
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
  assert.equal(
    (await route.POST(request(input, "https://other.example"))).status,
    403,
  );
  signedIn = false;
  assert.equal((await route.POST(request(input))).status, 401);
  signedIn = true;
  assert.equal(
    (await route.POST(request({ ...input, repositoryName: "../escape" })))
      .status,
    400,
  );
  assert.equal(calls, 0);
  assert.equal(
    (await route.POST(request({ ...input, annualCommits: 999 }))).status,
    422,
  );
  const response = await route.POST(request(input));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("X-Commit-Count"), "500");
  assert.match(
    response.headers.get("Content-Disposition"),
    /history-exercise\.tar\.gz/,
  );
  assert.equal(await response.text(), "archive");
});
