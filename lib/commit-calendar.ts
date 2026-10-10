import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { projectSchema } from "@/lib/project-schema";

export const MAX_COMMITS_PER_DAY = 10;
export class CalendarCapacityError extends Error {}

export const calendarSchema = projectSchema.safeExtend({
  seed: z.string().trim().min(1).max(100),
  asOf: z.iso
    .datetime()
    .refine(
      (value) => Date.parse(value) <= Date.now() + 1000,
      "Generation time cannot be in the future.",
    ),
});

export type CalendarInput = z.infer<typeof calendarSchema>;
export type CommitCalendar = {
  seed: string;
  asOf: string;
  timeZone: string;
  total: number;
  activeDays: number;
  days: { date: string; count: number }[];
  commits: string[];
};

// A small seeded PRNG: no clock or global randomness in scheduling.
function randomSource(seed: string) {
  let state = 2166136261;
  for (const character of seed)
    state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateCommitCalendar(input: CalendarInput): CommitCalendar {
  const { startDate, endDate, annualCommits, habits, timeZone, seed, asOf } =
    calendarSchema.parse(input);
  const random = randomSource(seed);
  const start = Temporal.PlainDate.from(startDate);
  const length = start.until(Temporal.PlainDate.from(endDate)).days + 1;
  const total = Math.round((annualCommits * length) / 365.25);
  const cutoff = Temporal.Instant.from(asOf);
  const today = cutoff.toZonedDateTimeISO(timeZone).toPlainDate();
  const entries: {
    date: Temporal.PlainDate;
    weight: number;
    eligible: number;
    count: number;
  }[] = [];
  let breakDays = 0;
  let busyDays = 0;
  let momentum = 0.7;

  for (let index = 0; index < length; index++) {
    const date = start.add({ days: index });
    const preference =
      (date.dayOfWeek >= 6 ? habits.weekendProjects : habits.weekdayActivity) /
      10;
    const midnight = date.toZonedDateTime(timeZone);
    const validDay =
      midnight.toPlainDate().equals(date) &&
      Temporal.PlainDate.compare(date, today) <= 0 &&
      Temporal.Instant.compare(midnight.toInstant(), cutoff) < 0;
    const eligible = validDay ? preference : 0;
    momentum = momentum * 0.8 + random() * 0.4;
    if (!breakDays && random() < habits.projectBreaks * 0.0018)
      breakDays = 2 + Math.floor(random() * (3 + habits.projectBreaks));
    if (!busyDays && random() < habits.milestoneBursts * 0.0025)
      busyDays = 3 + Math.floor(random() * 8);
    let weight = eligible * (0.25 + momentum) * (0.5 + random());
    if (random() > 0.2 + preference * 0.8 || breakDays > 0) weight = 0;
    if (busyDays > 0) weight *= 1 + habits.milestoneBursts / 3;
    entries.push({ date, weight, eligible, count: 0 });
    breakDays = Math.max(0, breakDays - 1);
    busyDays = Math.max(0, busyDays - 1);
  }

  if (total > 0 && !entries.some((day) => day.weight > 0)) {
    // Short ranges may randomly land entirely in a break; retain one eligible day.
    const candidate = entries.find((day) => day.eligible > 0);
    if (!candidate)
      throw new Error(
        "No eligible dates. Adjust the date range or weekday/weekend habit scores.",
      );
    candidate.weight = candidate.eligible;
  }
  const capacity =
    entries.filter((day) => day.eligible > 0).length * MAX_COMMITS_PER_DAY;
  if (total > capacity)
    throw new CalendarCapacityError(
      `This schedule needs ${total} commits, but the eligible dates can hold only ${capacity} at a maximum of ${MAX_COMMITS_PER_DAY} per day. Extend the date range or adjust your activity habits.`,
    );
  for (let commit = 0; commit < total; commit++) {
    let available = entries.filter(
      (day) => day.weight > 0 && day.count < MAX_COMMITS_PER_DAY,
    );
    if (!available.length) {
      // Preserve preferred active days first, then use quiet eligible days.
      available = entries.filter(
        (day) => day.eligible > 0 && day.count < MAX_COMMITS_PER_DAY,
      );
      for (const day of available) day.weight = day.eligible;
    }
    const weightSum = available.reduce((sum, day) => sum + day.weight, 0);
    let target = random() * weightSum;
    const chosen =
      available.find((day) => {
        target -= day.weight;
        return target < 0;
      }) ?? available[available.length - 1];
    chosen.count++;
  }

  const commits: string[] = [];
  for (let dayIndex = 0; dayIndex < entries.length; dayIndex++) {
    const entry = entries[dayIndex];
    if (!entry.count) continue;
    const sessions =
      entry.count > 3 && random() < habits.smallFrequentCommits / 10 ? 2 : 1;
    const windows = Array.from({ length: sessions }, () => {
      const hour =
        random() < habits.nightOwl / 12
          ? random() < 0.5
            ? random() * 3
            : 22 + random()
          : random() < habits.eveningActivity / 10
            ? 18 + random() * 4
            : 9 + random() * 7;
      return { start: hour * 3600, duration: 1800 + random() * 9000 };
    });
    for (let commit = 0; commit < entry.count; commit++) {
      const window = windows[Math.floor(random() * windows.length)];
      const taskEnd = random() < habits.taskBasedCommits / 10;
      const position = taskEnd ? 0.7 + random() * 0.3 : random();
      // Keep each session on its allocated local date; early-morning sessions
      // still model night-owl activity without overflowing the next day's cap.
      const duration = Math.min(window.duration, 86399 - window.start);
      const seconds = Math.floor(window.start + duration * position);
      const commitDate = entry.date;
      const time = Temporal.PlainTime.from({
        hour: Math.floor(seconds / 3600),
        minute: Math.floor(seconds / 60) % 60,
        second: seconds % 60,
      });
      let instant = commitDate
        .toZonedDateTime({ timeZone, plainTime: time })
        .toInstant();
      if (
        Temporal.Instant.compare(instant, cutoff) > 0 ||
        !instant.toZonedDateTimeISO(timeZone).toPlainDate().equals(commitDate)
      ) {
        // Redistribute today's session within elapsed local-day time, never the future.
        const midnight = commitDate.toZonedDateTime(timeZone).toInstant();
        const nextMidnight = commitDate
          .add({ days: 1 })
          .toZonedDateTime(timeZone)
          .toInstant();
        const end =
          Temporal.Instant.compare(cutoff, nextMidnight) < 0
            ? cutoff
            : nextMidnight;
        const elapsed = Number(
          end.epochMilliseconds - midnight.epochMilliseconds,
        );
        instant = midnight.add({
          milliseconds: Math.floor(random() * elapsed),
        });
      }
      commits.push(instant.toString());
    }
  }
  commits.sort((left, right) => Date.parse(left) - Date.parse(right));
  // Group actual timezone-resolved timestamps (including DST transitions).
  const counts = new Map<string, number>();
  for (const commit of commits) {
    const date = Temporal.Instant.from(commit)
      .toZonedDateTimeISO(timeZone)
      .toPlainDate()
      .toString();
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  const days = entries.map(({ date }) => ({
    date: date.toString(),
    count: counts.get(date.toString()) ?? 0,
  }));
  if (
    days.some((day) => day.count > MAX_COMMITS_PER_DAY) ||
    days.reduce((sum, day) => sum + day.count, 0) !== total
  )
    throw new Error("Generated calendar failed daily capacity verification.");
  return {
    seed,
    asOf,
    timeZone,
    total,
    activeDays: days.filter((day) => day.count > 0).length,
    days,
    commits,
  };
}
