"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";
import {
  activityDefaults,
  habitDefaults,
  habitLabels,
  projectSchema,
  repositoryNameSchema,
  type ProjectDetails,
} from "@/lib/project-schema";
import type { CommitCalendar } from "@/lib/commit-calendar";
import { ActivityCalendar } from "./activity-calendar";
import { ActivityPublish } from "./activity-publish";
import "./workspace-controls.css";
import "./readme.css";
import "./activity.css";

type Availability = {
  name: string;
  status: "checking" | "available" | "taken" | "error";
  message: string;
  reconnect?: boolean;
};
type Errors = Partial<Record<keyof ProjectDetails, string[]>>;

export function ActivityEditor({
  name,
  email,
  timeZones,
}: {
  name: string;
  email: string;
  timeZones: string[];
}) {
  const [values, setValues] = useState<ProjectDetails>(() => ({
    repositoryName: "githubkit-history",
    authorName: name,
    authorEmail: email,
    ...activityDefaults(),
  }));
  const [account, setAccount] = useState<{
    username: string;
    avatarUrl: string;
  } | null>(null);
  const [accountError, setAccountError] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [seed, setSeed] = useState("");
  const [calendar, setCalendar] = useState<CommitCalendar | null>(null);
  const [pending, setPending] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reconnect, setReconnect] = useState(false);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [retry, setRetry] = useState(0);
  const [previewRetry, setPreviewRetry] = useState(0);
  const referenceTime = useRef<string | null>(null);
  const repo = values.repositoryName.trim();
  const repoValid = repositoryNameSchema.safeParse(repo);
  const current = availability?.name === repo ? availability : null;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setValues((value) => ({
        ...value,
        ...activityDefaults(new Date(), zone),
      }));
      setSeed(crypto.randomUUID());
      setInitialized(true);
      void fetch("/api/github-profile", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok)
            throw new Error(
              data.message ??
                "Could not load your GitHub account. Refresh to retry.",
            );
          if (!controller.signal.aborted)
            setAccount({
              username: data.profile.username,
              avatarUrl: data.profile.avatar,
            });
        })
        .catch((error) => {
          if (!controller.signal.aborted) setAccountError(error.message);
        });
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!initialized || !repositoryNameSchema.safeParse(repo).success) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setAvailability({
        name: repo,
        status: "checking",
        message: "Checking GitHub…",
      });
      try {
        const response = await fetch("/api/projects/check-name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repositoryName: repo }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (controller.signal.aborted) return;
        setAvailability({
          name: repo,
          status: response.ok
            ? data.available
              ? "available"
              : "taken"
            : "error",
          message: response.ok
            ? data.available
              ? "Name available"
              : "This name already exists. Choose another."
            : (data.message ?? "Could not check availability."),
          reconnect: data.code === "SIGN_IN" || data.code === "REAUTHORIZE",
        });
      } catch {
        if (!controller.signal.aborted)
          setAvailability({
            name: repo,
            status: "error",
            message: "Could not reach GitHub. Retry the name check.",
          });
      }
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [repo, retry, initialized]);

  useEffect(() => {
    if (!initialized) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
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
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setNotice(data.message ?? "Could not generate the preview.");
          setErrors(data.errors ?? {});
          setReconnect(data.code === "SIGN_IN");
        } else setCalendar(data.calendar);
      } catch {
        if (!controller.signal.aborted)
          setNotice(
            "Could not update the preview. Check your connection and retry.",
          );
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [values, seed, initialized, previewRetry]);

  function invalidate() {
    setPending(true);
    setNotice("");
    setReconnect(false);
    setErrors({});
  }
  function update<K extends keyof ProjectDetails>(
    field: K,
    value: ProjectDetails[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    invalidate();
    if (field === "repositoryName") setAvailability(null);
  }
  function error(field: keyof ProjectDetails) {
    return errors[field]?.length ? (
      <p id={`activity-${field}-error`} className="ws-error" role="alert">
        {errors[field]?.[0]}
      </p>
    ) : null;
  }
  const latest =
    !pending &&
    !notice &&
    projectSchema.safeParse(values).success &&
    !!seed.trim();
  const input =
    latest && calendar
      ? { ...values, seed: calendar.seed, asOf: calendar.asOf }
      : null;
  const maxDate = activityDefaults(new Date(), values.timeZone).endDate;
  const reconnectButton = (
    <button
      type="button"
      className="ws-button"
      onClick={() =>
        void signIn("github", { callbackUrl: "/workspace/activity" })
      }
    >
      Reconnect GitHub
    </button>
  );

  return (
    <section className="activity-workspace" aria-labelledby="activity-title">
      <div className="workspace-section-heading">
        <h1 id="activity-title">Generate Activity</h1>
        <p>
          Build a custom commit schedule, then create a private GitHub
          repository.
        </p>
      </div>
      <div className="activity-info">
        <span aria-hidden="true">ⓘ</span>
        <p>
          This creates synthetic commit history. GitHub decides whether commits
          count as contributions.
        </p>
      </div>
      <section
        className="workspace-panel activity-settings"
        aria-labelledby="activity-settings-title"
      >
        <h2 id="activity-settings-title">Activity settings</h2>
        <fieldset disabled={busy}>
          <legend className="ws-sr-only">Schedule settings</legend>
          <div className="activity-two-columns">
            {(
              [
                ["startDate", "Start date"],
                ["endDate", "End date"],
              ] as const
            ).map(([field, label]) => (
              <label
                key={field}
                className="ws-field"
                htmlFor={`activity-${field}`}
              >
                {label}
                <input
                  id={`activity-${field}`}
                  type="date"
                  className="ws-input"
                  value={values[field]}
                  max={
                    field === "startDate" ? values.endDate || maxDate : maxDate
                  }
                  min={field === "endDate" ? values.startDate : undefined}
                  onChange={(event) => update(field, event.target.value)}
                  aria-invalid={!!errors[field]}
                  aria-describedby={
                    errors[field] ? `activity-${field}-error` : undefined
                  }
                />
                {error(field)}
              </label>
            ))}
          </div>
          <label
            className="activity-intensity-label"
            htmlFor="activity-intensity-number"
          >
            Commits per year
          </label>
          <div className="activity-intensity">
            <input
              id="activity-intensity-number"
              type="number"
              min={0}
              max={1000}
              step={1}
              className="ws-input"
              value={
                Number.isNaN(values.annualCommits) ? "" : values.annualCommits
              }
              onChange={(event) =>
                update("annualCommits", event.target.valueAsNumber)
              }
              aria-describedby="activity-intensity-help"
            />
            <div>
              <input
                type="range"
                min={0}
                max={1000}
                step={1}
                value={
                  Number.isNaN(values.annualCommits) ? 0 : values.annualCommits
                }
                aria-label="Commits per year"
                aria-valuetext={`${values.annualCommits} commits per year`}
                onChange={(event) =>
                  update("annualCommits", Number(event.target.value))
                }
                style={
                  {
                    "--activity-progress": `${Math.max(0, Math.min(100, values.annualCommits / 10 || 0))}%`,
                  } as React.CSSProperties
                }
              />
              <div className="activity-slider-labels">
                <span>0</span>
                <span>1,000</span>
              </div>
              <p id="activity-intensity-help">
                The total adjusts to your selected date range.
              </p>
            </div>
          </div>
          {error("annualCommits")}
          <details
            className="activity-advanced"
            open={advanced}
            onToggle={(event) => setAdvanced(event.currentTarget.open)}
          >
            <summary>
              <span className="activity-chevron" aria-hidden="true">
                ›
              </span>
              <span>
                Advanced settings
                <small>
                  Activity habits, author details, timezone, and seed
                </small>
              </span>
            </summary>
            <div className="activity-advanced-content">
              <h3>Author details</h3>
              <div className="activity-two-columns">
                {(
                  [
                    ["authorName", "Author name"],
                    ["authorEmail", "Author email"],
                  ] as const
                ).map(([field, label]) => (
                  <label className="ws-field" key={field}>
                    {label}
                    <input
                      className="ws-input"
                      type={field === "authorEmail" ? "email" : "text"}
                      value={values[field]}
                      maxLength={field === "authorEmail" ? 254 : 100}
                      onChange={(event) => update(field, event.target.value)}
                      aria-invalid={!!errors[field]}
                      aria-describedby={
                        errors[field] ? `activity-${field}-error` : undefined
                      }
                    />
                    {error(field)}
                  </label>
                ))}
              </div>
              <p className="activity-muted">
                Use an email connected to your GitHub account, including your
                GitHub noreply address.
              </p>
              <label className="ws-field">
                Timezone
                <select
                  className="ws-input"
                  value={values.timeZone}
                  onChange={(event) => update("timeZone", event.target.value)}
                >
                  {[...new Set([values.timeZone, "UTC", ...timeZones])].map(
                    (zone) => (
                      <option key={zone} value={zone}>
                        {zone.replaceAll("_", " ")}
                      </option>
                    ),
                  )}
                </select>
                {error("timeZone")}
              </label>
              <h3>Activity habits</h3>
              <p className="activity-muted">
                Independent scores: 0 means never, 5 sometimes, and 10 almost
                always.
              </p>
              <div className="activity-habits">
                {(Object.keys(habitLabels) as (keyof typeof habitLabels)[]).map(
                  (habit) => (
                    <label key={habit}>
                      <span>
                        {habitLabels[habit]}
                        <output>
                          {values.habits[habit]} <span>/ 10</span>
                        </output>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        value={values.habits[habit]}
                        aria-valuetext={`${values.habits[habit]} out of 10`}
                        onChange={(event) =>
                          update("habits", {
                            ...values.habits,
                            [habit]: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  ),
                )}
              </div>
              {error("habits")}
              <label className="ws-field">
                Random seed
                <input
                  className="ws-input"
                  maxLength={100}
                  value={seed}
                  onChange={(event) => {
                    setSeed(event.target.value);
                    invalidate();
                  }}
                />
                <span className="activity-muted">
                  The same seed, settings, and generation reference time
                  reproduce the same schedule.
                </span>
              </label>
              <button
                type="button"
                className="ws-button ws-button-small"
                onClick={() => update("habits", { ...habitDefaults })}
              >
                Reset activity habits
              </button>
            </div>
          </details>
        </fieldset>
        {!advanced &&
          (errors.authorName ||
            errors.authorEmail ||
            errors.habits ||
            (!seed.trim() && initialized)) && (
            <button
              className="ws-text-button"
              type="button"
              onClick={() => setAdvanced(true)}
            >
              Review errors in Advanced settings
            </button>
          )}
      </section>
      <section
        className="workspace-panel activity-preview"
        aria-labelledby="activity-preview-title"
        aria-busy={pending}
      >
        <div className="activity-card-heading">
          <div>
            <h2 id="activity-preview-title">Your activity preview</h2>
            <p>
              A simulated schedule. No repository has been created by this
              preview.
            </p>
          </div>
          <button
            type="button"
            className="ws-button"
            disabled={busy || pending}
            onClick={() => {
              setSeed(crypto.randomUUID());
              invalidate();
            }}
          >
            <span aria-hidden="true">↻</span> Regenerate
          </button>
        </div>
        {pending && (
          <p role="status" className="activity-preview-status">
            Updating calendar preview…
          </p>
        )}
        {notice && (
          <div className="ws-error" role="alert">
            <p>{notice}</p>
            <button
              type="button"
              className="ws-button ws-button-small"
              disabled={busy}
              onClick={() => {
                invalidate();
                setPreviewRetry((value) => value + 1);
              }}
            >
              Retry preview
            </button>
          </div>
        )}
        <div className={pending || !latest ? "activity-preview-stale" : ""}>
          {calendar ? (
            <>
              <ActivityCalendar
                key={`${calendar.seed}-${calendar.asOf}`}
                calendar={calendar}
              />
              <div className="activity-stats">
                <div>
                  <strong>{calendar.total.toLocaleString()}</strong>
                  <span>Total commits</span>
                </div>
                <div>
                  <strong>{calendar.activeDays.toLocaleString()}</strong>
                  <span>Active days</span>
                </div>
                <div>
                  <strong className="activity-date-stat">
                    {formatDate(calendar.days[0].date)} –{" "}
                    {formatDate(calendar.days[calendar.days.length - 1].date)}
                  </strong>
                  <span>Date range</span>
                </div>
              </div>
              <p className="activity-muted">
                Times use {calendar.timeZone}. Change this in Advanced settings.
              </p>
            </>
          ) : (
            <div className="activity-calendar-empty">
              {pending
                ? "Preparing your activity calendar…"
                : "Complete the settings above to generate your preview."}
            </div>
          )}
        </div>
        {reconnect && reconnectButton}
      </section>
      <section
        className="workspace-panel activity-repository"
        aria-labelledby="activity-repository-title"
      >
        <h2 id="activity-repository-title">Create your repository</h2>
        <p className="activity-muted">
          Your generated commits will be published to a new private repository.
        </p>
        <fieldset disabled={busy}>
          <legend className="ws-sr-only">Repository destination</legend>
          <div className="activity-repo-row">
            <span>GitHub account</span>
            <div className="activity-account">
              {account?.avatarUrl && (
                <Image src={account.avatarUrl} alt="" width={32} height={32} />
              )}
              <span>
                {account
                  ? `@${account.username}`
                  : accountError || "Loading your GitHub account…"}
              </span>
            </div>
          </div>
          <div className="activity-repo-row">
            <label htmlFor="activity-repositoryName">Repository name</label>
            <div>
              <div className="activity-repo-input">
                <input
                  id="activity-repositoryName"
                  className="ws-input"
                  value={values.repositoryName}
                  maxLength={100}
                  onChange={(event) =>
                    update("repositoryName", event.target.value)
                  }
                  aria-invalid={
                    !repoValid.success || current?.status === "taken"
                  }
                  aria-describedby="activity-repository-status"
                />
                <span
                  id="activity-repository-status"
                  role="status"
                  className={
                    current?.status === "available"
                      ? "activity-available"
                      : current?.status === "taken" ||
                          current?.status === "error" ||
                          !repoValid.success
                        ? "ws-error"
                        : "activity-muted"
                  }
                >
                  {!repoValid.success
                    ? repoValid.error.issues[0].message
                    : (current?.message ?? "Checking availability…")}
                </span>
              </div>
              {account && (
                <p className="activity-muted activity-destination">
                  Full destination: {account.username}/{repo || "…"}
                </p>
              )}
              {error("repositoryName")}
              {current?.status === "error" && !current.reconnect && (
                <button
                  type="button"
                  className="ws-text-button"
                  onClick={() => {
                    setAvailability(null);
                    setRetry((value) => value + 1);
                  }}
                >
                  Retry name check
                </button>
              )}
            </div>
          </div>
        </fieldset>
        {current?.reconnect && reconnectButton}
        <div className="activity-private">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <rect x="4" y="10" width="16" height="12" rx="2" />
            <path d="M8 10V6a4 4 0 0 1 8 0v4M12 15v3" />
          </svg>
          <div>
            <strong>Private</strong>
            <p>
              This repository will be visible only to you and people you grant
              access.
            </p>
          </div>
        </div>
        <ActivityPublish
          input={input}
          total={calendar?.total ?? 0}
          activeDays={calendar?.activeDays ?? 0}
          available={current?.status === "available" && !!account}
          owner={account?.username ?? ""}
          onBusy={setBusy}
        />
      </section>
      <p className="activity-bottom-note">Nothing publishes automatically.</p>
    </section>
  );
}

export function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
