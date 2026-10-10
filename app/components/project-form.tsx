"use client";

import { useEffect, useRef, useState } from "react";
import {
  activityDefaults,
  habitDefaults,
  habitLabels,
  projectSchema,
  repositoryNameSchema,
  type ProjectDetails,
} from "@/lib/project-schema";
import { AuthButton } from "@/app/components/auth-button";
import { CommitCalendarPreview } from "@/app/components/commit-calendar-preview";
import type { CommitCalendar } from "@/lib/commit-calendar";
import { GitHubPublish } from "@/app/components/github-publish";

type FieldErrors = Partial<Record<keyof ProjectDetails, string[]>>;
type Availability = {
  name: string;
  status: "checking" | "available" | "taken" | "error";
  message: string;
  reconnect?: boolean;
};
const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";

export function ProjectForm({
  name,
  email,
  defaults,
  timeZones,
}: {
  name: string;
  email: string;
  defaults: ReturnType<typeof activityDefaults>;
  timeZones: string[];
}) {
  const [values, setValues] = useState<ProjectDetails>({
    repositoryName: "githubkit-history",
    authorName: name,
    authorEmail: email,
    ...defaults,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [calendar, setCalendar] = useState<CommitCalendar | null>(null);
  const [seed, setSeed] = useState("git-forge");
  const referenceTime = useRef<string | null>(null);
  const [maxDate, setMaxDate] = useState(defaults.endDate);
  const [notice, setNotice] = useState("");
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [retry, setRetry] = useState(0);
  const [reconnect, setReconnect] = useState(false);
  const repositoryName = values.repositoryName.trim();
  const nameResult = repositoryNameSchema.safeParse(repositoryName);
  const currentAvailability =
    availability?.name === repositoryName ? availability : null;

  useEffect(() => {
    const timer = setTimeout(() => {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setSeed(crypto.randomUUID());
      setValues((current) => ({
        ...current,
        ...activityDefaults(new Date(), zone),
      }));
      setMaxDate(activityDefaults(new Date(), zone).endDate);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!repositoryNameSchema.safeParse(repositoryName).success) return;
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(async () => {
      setAvailability({
        name: repositoryName,
        status: "checking",
        message: "Checking GitHub…",
      });
      try {
        const response = await fetch("/api/projects/check-name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repositoryName }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!active) return;
        if (!response.ok) {
          setAvailability({
            name: repositoryName,
            status: "error",
            message: data.message ?? "Unable to check GitHub. Please retry.",
            reconnect: data.code === "REAUTHORIZE" || data.code === "SIGN_IN",
          });
        } else {
          setAvailability({
            name: repositoryName,
            status: data.available ? "available" : "taken",
            message: data.available
              ? `${data.owner}/${repositoryName} is available.`
              : "This name is already taken in your account. Try another.",
          });
        }
      } catch {
        if (active)
          setAvailability({
            name: repositoryName,
            status: "error",
            message: "Could not reach GitHub. Check your connection and retry.",
          });
      }
    }, 500);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [repositoryName, retry]);

  function update<K extends keyof ProjectDetails>(
    field: K,
    value: ProjectDetails[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setCalendar(null);
    setPending(true);
    setNotice("");
    setReconnect(false);
    if (field === "timeZone" && typeof value === "string")
      setMaxDate(activityDefaults(new Date(), value).endDate);
    if (
      field === "repositoryName" &&
      typeof value === "string" &&
      value.trim() !== repositoryName
    )
      setAvailability(null);
  }

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(async () => {
      setCalendar(null);
      setNotice("");
      setReconnect(false);
      const parsed = projectSchema.safeParse(values);
      if (!parsed.success) {
        setErrors(parsed.error.flatten().fieldErrors);
        setPending(false);
        return;
      }
      if (!seed.trim()) {
        setNotice("Enter a random seed in Advanced settings.");
        setPending(false);
        return;
      }
      setErrors({});
      setPending(true);
      referenceTime.current ??= new Date().toISOString();
      try {
        const response = await fetch("/api/generate-commits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...parsed.data,
            seed,
            asOf: referenceTime.current,
          }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!active) return;
        if (!response.ok) {
          setNotice(data.message ?? "Unable to generate the calendar.");
          setErrors(data.errors ?? {});
          setReconnect(data.code === "SIGN_IN");
        } else setCalendar(data.calendar);
      } catch {
        if (active)
          setNotice(
            "Could not update the preview. Check your connection or edit a setting to retry.",
          );
      } finally {
        if (active) setPending(false);
      }
    }, 500);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [values, seed]);

  function fieldError(field: keyof ProjectDetails) {
    return (
      <p id={`${field}-error`} className="mt-1 text-sm text-red-700">
        {errors[field]?.[0]}
      </p>
    );
  }

  return (
    <section className="mt-8 border-t border-zinc-200 pt-8">
      <h2 className="text-xl font-semibold">Configure your project</h2>
      <p className="mt-2 mb-6 text-sm text-zinc-600">
        Start with the defaults below, then adjust your repository and activity
        preferences.
      </p>
      <form noValidate onSubmit={(event) => event.preventDefault()}>
        <fieldset className="space-y-6">
          <legend className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Repository & author
          </legend>
          {(
            [
              ["repositoryName", "Repository name", "text"],
              ["authorName", "Author name", "text"],
              ["authorEmail", "Author email", "email"],
            ] as const
          ).map(([field, label, type]) => (
            <div key={field}>
              <label htmlFor={field} className="mb-2 block text-sm font-medium">
                {label}
              </label>
              <input
                id={field}
                name={field}
                type={type}
                required
                value={values[field]}
                autoComplete={
                  field === "authorName"
                    ? "name"
                    : field === "authorEmail"
                      ? "email"
                      : "off"
                }
                maxLength={field === "authorEmail" ? 254 : 100}
                aria-invalid={
                  Boolean(errors[field]?.length) ||
                  (field === "repositoryName" &&
                    (!nameResult.success ||
                      currentAvailability?.status === "taken"))
                }
                aria-describedby={`${field}-help ${field}-error${field === "repositoryName" ? " repository-status" : ""}`}
                onChange={(event) => update(field, event.target.value)}
                className={inputClass}
              />
              <p id={`${field}-help`} className="mt-2 text-xs text-zinc-500">
                {field === "repositoryName"
                  ? "Letters, numbers, periods, underscores, and hyphens. Availability is checked automatically."
                  : field === "authorEmail"
                    ? "Use an email connected to your GitHub account, including your GitHub noreply address."
                    : "The name shown as the commit author."}
              </p>
              {fieldError(field)}
              {field === "repositoryName" && (
                <div
                  id="repository-status"
                  role="status"
                  aria-live="polite"
                  className={`mt-2 text-sm ${currentAvailability?.status === "available" ? "text-emerald-700" : currentAvailability?.status === "taken" || currentAvailability?.status === "error" || !nameResult.success ? "text-red-700" : "text-zinc-500"}`}
                >
                  {!nameResult.success
                    ? nameResult.error.issues[0].message
                    : (currentAvailability?.message ??
                      "Checking availability…")}
                  {currentAvailability?.status === "error" &&
                    !currentAvailability.reconnect && (
                      <button
                        type="button"
                        className="ml-2 underline underline-offset-2"
                        onClick={() => {
                          setAvailability(null);
                          setRetry((value) => value + 1);
                        }}
                      >
                        Retry
                      </button>
                    )}
                </div>
              )}
            </div>
          ))}
          <div className="border-t border-zinc-200 pt-6">
            <h3 className="font-semibold">Commit activity</h3>
            <p className="mt-1 mb-5 text-xs text-zinc-500">
              Dates use {values.timeZone} time. The selected range includes both
              dates.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["startDate", "Start date"],
                  ["endDate", "End date"],
                ] as const
              ).map(([field, label]) => (
                <div key={field}>
                  <label
                    htmlFor={field}
                    className="mb-2 block text-sm font-medium"
                  >
                    {label}
                  </label>
                  <input
                    id={field}
                    type="date"
                    required
                    value={values[field]}
                    max={
                      field === "startDate"
                        ? values.endDate || maxDate
                        : maxDate
                    }
                    min={field === "endDate" ? values.startDate : undefined}
                    onChange={(event) => update(field, event.target.value)}
                    aria-invalid={Boolean(errors[field]?.length)}
                    aria-describedby={`${field}-error`}
                    className={inputClass}
                  />
                  {fieldError(field)}
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50/40 p-5">
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="annualCommits" className="text-sm font-medium">
                  Commit intensity
                </label>
                <output
                  htmlFor="annualCommits"
                  className="text-right text-2xl font-semibold tabular-nums text-emerald-900"
                >
                  {values.annualCommits}
                  <span className="ml-1 text-xs font-normal text-zinc-600">
                    / year
                  </span>
                </output>
              </div>
              <input
                id="annualCommits"
                type="range"
                min={0}
                max={1000}
                step={1}
                value={values.annualCommits}
                onChange={(event) =>
                  update("annualCommits", Number(event.target.value))
                }
                aria-valuetext={`${values.annualCommits} commits per year`}
                aria-describedby="annualCommits-help annualCommits-error"
                className="commit-intensity-slider mt-5 w-full"
              />
              <div className="mt-2 flex justify-between text-xs tabular-nums text-zinc-500">
                <span>0</span>
                <span>250</span>
                <span>500</span>
                <span>750</span>
                <span>1,000</span>
              </div>
              <p id="annualCommits-help" className="mt-4 text-xs text-zinc-600">
                Annual commit target. Darker green means more activity. A value
                of 0 means no generated commits.
              </p>
              {fieldError("annualCommits")}
            </div>
            <details
              open={advancedOpen}
              onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
              className="mt-5 rounded-xl border border-zinc-200 p-4"
            >
              <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4">
                Advanced settings{" "}
                <span className="ml-1 font-normal text-zinc-500">
                  · commit habits
                </span>
              </summary>
              <p className="mt-3 text-xs text-zinc-500">
                Defaults are ready to use. These scores describe independent
                habits: 0 means never, 5 sometimes, and 10 almost always.
                Multiple habits can score highly.
              </p>
              <div className="mt-5">
                <label
                  htmlFor="timeZone"
                  className="mb-2 block text-sm font-medium"
                >
                  Timezone
                </label>
                <select
                  id="timeZone"
                  value={values.timeZone}
                  onChange={(event) => update("timeZone", event.target.value)}
                  className={inputClass}
                  aria-describedby="timeZone-error"
                >
                  {[...new Set([values.timeZone, "UTC", ...timeZones])].map(
                    (zone) => (
                      <option key={zone} value={zone}>
                        {zone.replaceAll("_", " ")}
                      </option>
                    ),
                  )}
                </select>
                {fieldError("timeZone")}
                <label
                  htmlFor="calendar-seed"
                  className="mt-4 mb-2 block text-sm font-medium"
                >
                  Random seed
                </label>
                <input
                  id="calendar-seed"
                  value={seed}
                  maxLength={100}
                  onChange={(event) => {
                    setSeed(event.target.value);
                    setCalendar(null);
                    setPending(true);
                  }}
                  className={inputClass}
                  aria-describedby="seed-help"
                />
                <p id="seed-help" className="mt-2 text-xs text-zinc-500">
                  Use the same seed and settings to repeat a preview. Change the
                  seed to automatically try a different schedule.
                </p>
              </div>
              <div className="mt-5 space-y-5">
                {(Object.keys(habitLabels) as (keyof typeof habitLabels)[]).map(
                  (habit) => (
                    <div key={habit}>
                      <div className="mb-2 flex justify-between gap-3 text-sm">
                        <label htmlFor={`habit-${habit}`}>
                          {habitLabels[habit]}
                        </label>
                        <output
                          htmlFor={`habit-${habit}`}
                          className="font-medium tabular-nums"
                        >
                          {values.habits[habit]}
                          <span className="text-zinc-400"> / 10</span>
                        </output>
                      </div>
                      <input
                        id={`habit-${habit}`}
                        type="range"
                        min={0}
                        max={10}
                        step={1}
                        value={values.habits[habit]}
                        aria-valuetext={`${values.habits[habit]} out of 10`}
                        onChange={(event) =>
                          update("habits", {
                            ...values.habits,
                            [habit]: Number(event.target.value),
                          })
                        }
                        className="w-full accent-emerald-700"
                      />
                    </div>
                  ),
                )}
                {fieldError("habits")}
              </div>
              <button
                type="button"
                onClick={() => {
                  update("habits", { ...habitDefaults });
                }}
                className="mt-5 text-sm font-medium underline underline-offset-4"
              >
                Reset advanced defaults
              </button>
            </details>
          </div>
          <p className="text-center text-xs text-zinc-500">
            The calendar updates automatically. Create your project on GitHub
            when you are happy with the preview.
          </p>
        </fieldset>
      </form>
      {notice && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {notice}
        </p>
      )}
      {(reconnect || currentAvailability?.reconnect) && (
        <div className="mt-4 rounded-lg bg-zinc-50 p-4">
          <p className="mb-3 text-sm">
            Reconnect GitHub to review repository access. Reconnecting leaves
            this page, so copy any changes you want to keep.
          </p>
          <AuthButton />
        </div>
      )}
      {pending && (
        <p role="status" className="mt-6 text-sm text-zinc-500">
          Updating calendar preview…
        </p>
      )}
      {calendar && (
        <CommitCalendarPreview
          calendar={calendar}
          onRegenerate={() => {
            setSeed(crypto.randomUUID());
            setCalendar(null);
            setPending(true);
          }}
        />
      )}
      <GitHubPublish
        input={
          calendar
            ? { ...values, seed: calendar.seed, asOf: calendar.asOf }
            : null
        }
        total={calendar?.total ?? 0}
      />
    </section>
  );
}
