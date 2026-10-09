import * as fs from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import * as git from "isomorphic-git";
import { create } from "tar";
import { Temporal } from "@js-temporal/polyfill";
import {
  calendarSchema,
  generateCommitCalendar,
  type CalendarInput,
} from "@/lib/commit-calendar";

export const MAX_LOCAL_COMMITS = 1000;

export class ProjectLimitError extends Error {}

/** The callback owns access to the workspace only until it resolves. */
export async function withLocalProject<T>(
  input: CalendarInput,
  consume: (project: {
    dir: string;
    count: number;
    head: string | null;
    generationMs: number;
  }) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const parsed = calendarSchema.parse(input);
  const calendar = generateCommitCalendar(parsed);
  if (calendar.total > MAX_LOCAL_COMMITS)
    throw new ProjectLimitError(
      `Use a date range and volume producing at most ${MAX_LOCAL_COMMITS} commits for this step.`,
    );
  const workspace = await mkdtemp(join(tmpdir(), "git-forge-"));
  const started = performance.now();
  try {
    const dir = join(workspace, parsed.repositoryName);
    await fs.promises.mkdir(dir);
    await git.init({ fs, dir, defaultBranch: "main" });
    let head: string | null = null;
    const expected: {
      oid: string;
      timestamp: number;
      timezoneOffset: number;
    }[] = [];
    const header = `# ${parsed.repositoryName}\n\nGenerated commit-history exercise.\n`;
    await writeFile(join(dir, "README.md"), header);
    for (const [index, date] of calendar.commits.entries()) {
      signal?.throwIfAborted();
      const instant = Temporal.Instant.from(date);
      const identity = {
        name: parsed.authorName,
        email: parsed.authorEmail,
        timestamp: Math.floor(instant.epochMilliseconds / 1000),
        timezoneOffset:
          -instant.toZonedDateTimeISO(parsed.timeZone).offsetNanoseconds /
          60_000_000_000,
      };
      // Constant-size content keeps storage linear, while every tree changes.
      await writeFile(
        join(dir, "README.md"),
        `${header}\nProgress entry: ${index + 1}\nScheduled at: ${date}\n`,
      );
      await git.add({ fs, dir, filepath: "README.md" });
      head = await git.commit({
        fs,
        dir,
        message: `Update README progress (${index + 1})`,
        author: identity,
        committer: identity,
      });
      expected.push({
        oid: head,
        timestamp: identity.timestamp,
        timezoneOffset: identity.timezoneOffset,
      });
    }
    // Read the actual reachable chain, including parents, rather than trusting writes.
    let current = head;
    let previousTree: string | null = null;
    for (let index = expected.length - 1; index >= 0; index--) {
      signal?.throwIfAborted();
      const entry = expected[index];
      if (current !== entry.oid)
        throw new Error("Commit chain verification failed.");
      const { commit } = await git.readCommit({ fs, dir, oid: current });
      for (const person of [commit.author, commit.committer]) {
        if (
          person.name !== parsed.authorName ||
          person.email !== parsed.authorEmail ||
          person.timestamp !== entry.timestamp ||
          person.timezoneOffset !== entry.timezoneOffset
        )
          throw new Error("Commit metadata verification failed.");
      }
      if (previousTree === commit.tree)
        throw new Error("README change verification failed.");
      previousTree = commit.tree;
      const parent = index > 0 ? expected[index - 1].oid : null;
      if (
        commit.parent.length !== (parent ? 1 : 0) ||
        (parent && commit.parent[0] !== parent)
      )
        throw new Error("Commit parent verification failed.");
      current = parent;
    }
    return await consume({
      dir,
      count: expected.length,
      head,
      generationMs: Math.round(performance.now() - started),
    });
  } finally {
    // Only the unique directory created above is removed; never user-supplied paths.
    await rm(workspace, { recursive: true, force: true });
  }
}

export async function createProjectArchive(
  input: CalendarInput,
  signal?: AbortSignal,
) {
  return withLocalProject(
    input,
    async (project) => {
      const archivePath = join(project.dir, "..", "project.tar.gz");
      await create(
        { gzip: true, file: archivePath, cwd: join(project.dir, "..") },
        [basename(project.dir)],
      );
      return {
        ...project,
        dir: undefined,
        archive: await readFile(archivePath),
      };
    },
    signal,
  );
}
