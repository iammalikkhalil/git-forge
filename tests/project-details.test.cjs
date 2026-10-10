/* eslint-disable @typescript-eslint/no-require-imports -- Node's CommonJS test loader. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Load these isolated TypeScript modules without adding a test runtime dependency.
function load(relative, dependencies = {}) {
  const filename = path.join(__dirname, "..", relative);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
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
const repository = load("lib/repository-check.ts");
const calendarModule = load("lib/commit-calendar.ts", {
  "@/lib/project-schema": schema,
});
const { Temporal } = require("@js-temporal/polyfill");
const valid = {
  repositoryName: "my-project",
  authorName: "Test Author",
  authorEmail: "test@example.com",
  startDate: "2025-01-01",
  endDate: "2025-12-31",
  timeZone: "Asia/Karachi",
  annualCommits: 500,
  habits: { ...schema.habitDefaults },
};
function client(status, scopes = "read:user, repo, user:email") {
  return {
    users: {
      getAuthenticated: async () => ({
        data: { login: "test-owner" },
        headers: { "x-oauth-scopes": scopes },
      }),
    },
    repos: {
      get: async () => {
        if (status) throw { status };
        return {};
      },
    },
  };
}

test("validates and normalizes details; rejects unsafe names, emails and extra fields", () => {
  assert.equal(
    schema.projectSchema.parse({
      ...valid,
      repositoryName: " my-project ",
      authorEmail: " test@example.com ",
    }).authorEmail,
    valid.authorEmail,
  );
  for (const repositoryName of [
    "",
    "../repo",
    "..",
    "a b",
    "repo.git",
    "a".repeat(101),
  ])
    assert.equal(
      schema.projectSchema.safeParse({ ...valid, repositoryName }).success,
      false,
    );
  for (const authorName of [" ", "Bad\nAuthor", "Bad <Author>"])
    assert.equal(
      schema.projectSchema.safeParse({ ...valid, authorName }).success,
      false,
    );
  assert.equal(
    schema.projectSchema.safeParse({ ...valid, authorEmail: "invalid" })
      .success,
    false,
  );
  assert.equal(
    schema.projectSchema.safeParse({ ...valid, owner: "someone-else" }).success,
    false,
  );
});
test("activity defaults use Karachi today and clamp leap-year anniversaries", () => {
  const defaults = schema.activityDefaults(new Date("2024-02-28T20:00:00Z"));
  assert.equal(defaults.endDate, "2024-02-29");
  assert.equal(defaults.startDate, "2023-02-28");
  assert.deepEqual(defaults.habits, schema.habitDefaults);
});
test("rejects invalid activity settings and date ranges", () => {
  for (const change of [
    { startDate: "2025-02-30" },
    { startDate: "2026-01-01" },
    { endDate: "2999-12-31" },
    { annualCommits: -1 },
    { annualCommits: 1001 },
    { annualCommits: 1.5 },
    { annualCommits: "500" },
    { habits: { ...schema.habitDefaults, nightOwl: 11 } },
    { habits: { ...schema.habitDefaults, weekdayActivity: -1 } },
    { habits: { ...schema.habitDefaults, projectBreaks: 3.5 } },
  ])
    assert.equal(
      schema.projectSchema.safeParse({ ...valid, ...change }).success,
      false,
    );
  assert.equal(
    schema.projectSchema.safeParse({
      ...valid,
      startDate: "2025-01-01",
      endDate: "2025-01-01",
    }).success,
    true,
  );
});
test("annual targets accept both boundaries and habit scores are independent", () => {
  for (const annualCommits of [0, 1000]) {
    const result = schema.projectSchema.safeParse({
      ...valid,
      annualCommits,
      habits: Object.fromEntries(
        Object.keys(schema.habitDefaults).map((habit) => [habit, 10]),
      ),
    });
    assert.equal(result.success, true);
    assert.equal(result.data.annualCommits, annualCommits);
  }
});
test("existing repositories are unavailable; authenticated 404 is available", async () => {
  assert.deepEqual(await repository.checkRepositoryName(client(), "repo"), {
    owner: "test-owner",
    available: false,
  });
  assert.deepEqual(await repository.checkRepositoryName(client(404), "repo"), {
    owner: "test-owner",
    available: true,
  });
});
test("limited tokens cannot claim private names are available", async () => {
  await assert.rejects(
    repository.checkRepositoryName(client(404, "read:user"), "repo"),
    (error) => error.code === "REAUTHORIZE",
  );
});
test("GitHub authentication, rate limit and upstream failures are not availability", async () => {
  for (const status of [401, 403, 429, 500])
    await assert.rejects(
      repository.checkRepositoryName(client(status), "repo"),
      (error) => error.status === status,
    );
});
test("backend enforces origin, authentication, validation and duplicate checks", async () => {
  let token = null;
  let check = { owner: "test-owner", available: true };
  let called = 0;
  const { handleProjectRequest } = load("lib/project-request.ts", {
    "server-only": {},
    "@octokit/rest": { Octokit: class {} },
    "next-auth/jwt": { getToken: async () => token },
    "@/lib/project-schema": schema,
    "@/lib/repository-check": {
      ...repository,
      checkRepositoryName: async () => {
        called++;
        return check;
      },
    },
  });
  function request(body = valid, origin = "http://localhost:3000") {
    return {
      headers: new Headers({ origin }),
      nextUrl: { origin: "http://localhost:3000" },
      json: async () => body,
    };
  }
  assert.equal(
    (await handleProjectRequest(request(valid, "https://elsewhere.test")))
      .status,
    403,
  );
  assert.equal((await handleProjectRequest(request())).status, 401);
  token = { githubAccessToken: "private-token" };
  assert.equal(
    (await handleProjectRequest(request({ ...valid, authorEmail: "bad" })))
      .status,
    400,
  );
  assert.equal(called, 0);
  check = { owner: "test-owner", available: false };
  assert.equal((await handleProjectRequest(request())).status, 409);
  check = { owner: "test-owner", available: true };
  const response = await handleProjectRequest(request());
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.project.owner, "test-owner");
  assert.equal(result.project.authorEmail, valid.authorEmail);
  assert.equal(result.project.annualCommits, valid.annualCommits);
  assert.deepEqual(result.project.habits, valid.habits);
  assert(!JSON.stringify(result).includes("private-token"));
  assert.equal(
    (await handleProjectRequest(request({ repositoryName: "repo" }), true))
      .status,
    200,
  );
});

const calendarInput = {
  ...valid,
  seed: "repeatable-test",
  asOf: "2026-01-02T12:00:00Z",
};
test("calendar preserves exact scaled totals, chronology, date bounds and daily counts", () => {
  const result = calendarModule.generateCommitCalendar(calendarInput);
  assert.equal(result.total, Math.round((500 * 365) / 365.25));
  assert.equal(result.commits.length, result.total);
  assert.equal(result.days.length, 365);
  assert.equal(
    result.days.reduce((sum, day) => sum + day.count, 0),
    result.total,
  );
  const actual = new Map();
  result.commits.forEach((commit, index) => {
    if (index)
      assert(Date.parse(commit) >= Date.parse(result.commits[index - 1]));
    const date = Temporal.Instant.from(commit)
      .toZonedDateTimeISO(result.timeZone)
      .toPlainDate()
      .toString();
    assert(date >= valid.startDate && date <= valid.endDate);
    actual.set(date, (actual.get(date) ?? 0) + 1);
  });
  for (const day of result.days)
    assert.equal(day.count, actual.get(day.date) ?? 0);
  assert(result.activeDays < result.days.length);
  assert(new Set(result.days.map((day) => day.count)).size > 3);
});
test("same seed and snapshot repeat exactly; changing seed changes distribution only", () => {
  const first = calendarModule.generateCommitCalendar(calendarInput);
  assert.deepEqual(calendarModule.generateCommitCalendar(calendarInput), first);
  const second = calendarModule.generateCommitCalendar({
    ...calendarInput,
    seed: "different-test",
  });
  assert.equal(second.total, first.total);
  assert.notDeepEqual(second.commits, first.commits);
});
test("zero targets produce an empty calendar; impossible schedules fail clearly", () => {
  const result = calendarModule.generateCommitCalendar({
    ...calendarInput,
    annualCommits: 0,
    habits: { ...valid.habits, weekdayActivity: 0, weekendProjects: 0 },
  });
  assert.equal(result.total, 0);
  assert.equal(result.activeDays, 0);
  assert.deepEqual(result.commits, []);
  assert.throws(
    () =>
      calendarModule.generateCommitCalendar({
        ...calendarInput,
        startDate: "2025-01-06",
        endDate: "2025-01-06",
        annualCommits: 1000,
        habits: { ...valid.habits, weekdayActivity: 0, weekendProjects: 10 },
      }),
    /No eligible dates/,
  );
});
test("zero weekday/weekend preference excludes those dates", () => {
  for (const weekendOnly of [true, false]) {
    const result = calendarModule.generateCommitCalendar({
      ...calendarInput,
      habits: {
        ...valid.habits,
        weekdayActivity: weekendOnly ? 0 : 10,
        weekendProjects: weekendOnly ? 10 : 0,
      },
    });
    for (const day of result.days.filter((day) => day.count)) {
      const weekend = Temporal.PlainDate.from(day.date).dayOfWeek >= 6;
      assert.equal(weekend, weekendOnly);
    }
  }
});
test("DST and extreme offsets retain local dates and never schedule after snapshot", () => {
  for (const timeZone of [
    "America/New_York",
    "Europe/Berlin",
    "Pacific/Kiritimati",
    "Pacific/Honolulu",
  ]) {
    const input = {
      ...calendarInput,
      timeZone,
      startDate: "2025-03-08",
      endDate: "2025-03-10",
      asOf: "2025-03-10T04:01:00Z",
      annualCommits: 1000,
    };
    const result = calendarModule.generateCommitCalendar(input);
    for (const commit of result.commits) {
      const date = Temporal.Instant.from(commit)
        .toZonedDateTimeISO(timeZone)
        .toPlainDate()
        .toString();
      assert(date >= input.startDate && date <= input.endDate);
      assert(Date.parse(commit) <= Date.parse(input.asOf));
    }
  }
});
test("daily capacity holds after timezone resolution across seeds and overnight habits", () => {
  for (const timeZone of [
    "Asia/Karachi",
    "America/New_York",
    "Pacific/Kiritimati",
  ]) {
    for (let seed = 0; seed < 8; seed++) {
      const input = {
        ...calendarInput,
        timeZone,
        seed: `daily-cap-${seed}`,
        annualCommits: 1000,
        habits: {
          ...valid.habits,
          weekdayActivity: 0,
          weekendProjects: 10,
          nightOwl: 10,
          milestoneBursts: 10,
          projectBreaks: 10,
        },
      };
      const result = calendarModule.generateCommitCalendar(input);
      const actual = new Map();
      for (const instant of result.commits) {
        const date = Temporal.Instant.from(instant)
          .toZonedDateTimeISO(timeZone)
          .toPlainDate();
        assert(date.dayOfWeek >= 6);
        const key = date.toString();
        actual.set(key, (actual.get(key) ?? 0) + 1);
      }
      assert.equal(result.commits.length, result.total);
      assert.equal(
        result.days.reduce((sum, day) => sum + day.count, 0),
        result.total,
      );
      assert([...actual.values()].every((count) => count <= 10));
      assert(result.days.every((day) => day.count <= 10));
    }
  }
});

test("insufficient eligible daily capacity reports the requested total and capacity", () => {
  assert.throws(
    () =>
      calendarModule.generateCommitCalendar({
        ...calendarInput,
        startDate: "2025-01-06",
        endDate: "2025-01-15",
        annualCommits: 1000,
        habits: { ...valid.habits, weekdayActivity: 0, weekendProjects: 10 },
      }),
    /needs 27 commits.*only 20.*maximum of 10/,
  );
});

test("generation endpoint enforces origin, authentication and validates before generation", async () => {
  let token = null;
  const { POST } = load("app/api/generate-commits/route.ts", {
    "next-auth/jwt": { getToken: async () => token },
    "@/lib/commit-calendar": calendarModule,
  });
  const request = (body = calendarInput, origin = "http://localhost:3000") => ({
    headers: new Headers({ origin }),
    nextUrl: { origin: "http://localhost:3000" },
    json: async () => body,
  });
  assert.equal(
    (await POST(request(calendarInput, "https://other.test"))).status,
    403,
  );
  assert.equal((await POST(request())).status, 401);
  token = { name: "Authenticated test" };
  assert.equal(
    (await POST(request({ ...calendarInput, timeZone: "Invalid/Zone" })))
      .status,
    400,
  );
  assert.equal(
    (await POST(request({ ...calendarInput, seed: "" }))).status,
    400,
  );
  assert.equal(
    (await POST(request({ ...calendarInput, startDate: "2000-01-01" }))).status,
    400,
  );
  const response = await POST(request());
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.calendar.commits.length, data.calendar.total);
  const limited = await POST(
    request({
      ...calendarInput,
      startDate: "2025-01-06",
      endDate: "2025-01-15",
      annualCommits: 1000,
      habits: { ...valid.habits, weekdayActivity: 0, weekendProjects: 10 },
    }),
  );
  assert.equal(limited.status, 422);
  assert.match((await limited.json()).message, /maximum of 10/);
});
