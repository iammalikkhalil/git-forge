import { z } from "zod";

export const habitDefaults = {
  weekdayActivity: 8,
  weekendProjects: 4,
  eveningActivity: 7,
  nightOwl: 3,
  taskBasedCommits: 8,
  smallFrequentCommits: 4,
  milestoneBursts: 6,
  projectBreaks: 5,
};

export const habitLabels: Record<keyof typeof habitDefaults, string> = {
  weekdayActivity: "Weekday activity",
  weekendProjects: "Weekend side projects",
  eveningActivity: "Evening sessions",
  nightOwl: "After-midnight sessions",
  taskBasedCommits: "Committing after finishing a task",
  smallFrequentCommits: "Small, frequent commits",
  milestoneBursts: "Busier periods near milestones",
  projectBreaks: "Breaks between projects",
};

const habitScore = z.number().int().min(0).max(10);
const habitsSchema = z
  .object({
    weekdayActivity: habitScore,
    weekendProjects: habitScore,
    eveningActivity: habitScore,
    nightOwl: habitScore,
    taskBasedCommits: habitScore,
    smallFrequentCommits: habitScore,
    milestoneBursts: habitScore,
    projectBreaks: habitScore,
  })
  .strict();

export function todayDate(now = new Date(), timeZone = "Asia/Karachi") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function activityDefaults(now = new Date(), timeZone = "Asia/Karachi") {
  const endDate = todayDate(now, timeZone);
  const [year, month, day] = endDate.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  return {
    startDate: `${year - 1}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`,
    endDate,
    timeZone,
    annualCommits: 500,
    habits: { ...habitDefaults },
  };
}

export const repositoryNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a repository name.")
  .max(100, "Use 100 characters or fewer.")
  .regex(
    /^[A-Za-z0-9._-]+$/,
    "Use only letters, numbers, periods, underscores, and hyphens.",
  )
  .refine(
    (name) => !/^\.+$/.test(name) && !name.toLowerCase().endsWith(".git"),
    "Choose a name other than dots or a name ending in .git.",
  );

export const projectSchema = z
  .object({
    repositoryName: repositoryNameSchema,
    authorName: z
      .string()
      .trim()
      .min(1, "Enter an author name.")
      .max(100, "Use 100 characters or fewer.")
      .regex(
        /^[^<>\r\n\x00-\x1f]+$/,
        "Author name cannot contain control characters or angle brackets.",
      ),
    authorEmail: z
      .string()
      .trim()
      .max(254, "Email is too long.")
      .pipe(z.email("Enter a valid email address.")),
    startDate: z.iso.date("Choose a valid start date."),
    endDate: z.iso.date("Choose a valid end date."),
    timeZone: z
      .string()
      .max(100)
      .refine((zone) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: zone });
          return true;
        } catch {
          return false;
        }
      }, "Choose a valid timezone."),
    annualCommits: z
      .number()
      .int("Choose a whole number of commits.")
      .min(0, "Choose 0–1,000 commits per year.")
      .max(1000, "Choose 0–1,000 commits per year."),
    habits: habitsSchema,
  })
  .strict()
  .superRefine((values, context) => {
    if (values.startDate > values.endDate)
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "End date must be on or after the start date.",
      });
    let today: string;
    try {
      today = todayDate(new Date(), values.timeZone);
    } catch {
      return;
    }
    if (values.endDate > today)
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "End date cannot be in the future.",
      });
    const days =
      (Date.parse(values.endDate) - Date.parse(values.startDate)) / 86400000 +
      1;
    if (days > 3660)
      context.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "Choose a range of 10 years or less.",
      });
    if (
      values.annualCommits > 0 &&
      values.habits.weekdayActivity === 0 &&
      values.habits.weekendProjects === 0
    )
      context.addIssue({
        code: "custom",
        path: ["habits"],
        message: "Enable weekday or weekend activity to schedule commits.",
      });
  });

export type ProjectDetails = z.infer<typeof projectSchema>;
