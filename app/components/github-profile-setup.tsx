"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AuthButton } from "@/app/components/auth-button";
import {
  profileValuesSchema,
  profileDraftSchema,
  profileLabels,
  changedProfileFields,
  profileCompleteness,
  suggestBios,
  type GitHubProfile,
  type ProfileValues,
  type ProfileField,
} from "@/lib/github-profile-schema";

const inputClass =
  "mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";
const buttonClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium disabled:opacity-50";
type Helpers = { role: string; skills: string; interests: string };
type SaveReport = {
  status: string;
  savedFields: ProfileField[];
  pendingFields: ProfileField[];
  addedLinks: string[];
  removedLinks: string[];
};
const emptyHelpers: Helpers = { role: "", skills: "", interests: "" };
const storageKey = (id: number) => `git-forge-profile-draft:${id}`;
async function api(options?: RequestInit) {
  const response = await fetch("/api/github-profile", {
    ...options,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(data.message ?? "Could not load your profile."),
      { code: data.code },
    );
  return data;
}
function display(field: ProfileField, values: ProfileValues) {
  if (field === "hireable")
    return values.hireable ? "Available" : "Not available";
  if (field === "socials") return values.socials.join("\n") || "No links";
  return values[field] || "Empty";
}
function cleaned(values: ProfileValues): ProfileValues {
  return {
    ...values,
    socials: values.socials.map((url) => url.trim()).filter(Boolean),
  };
}
function mergeEdits(
  latest: ProfileValues,
  baseline: ProfileValues,
  draft: ProfileValues,
): ProfileValues {
  const result = { ...latest };
  for (const field of changedProfileFields(baseline, cleaned(draft))) {
    if (field === "socials") result.socials = draft.socials;
    else if (field === "hireable") result.hireable = draft.hireable;
    else result[field] = draft[field];
  }
  return result;
}

export function GitHubProfileSetup({
  onContinue,
}: {
  onContinue: (profile: GitHubProfile, skills: string) => void;
}) {
  const [profile, setProfile] = useState<GitHubProfile | null>(null);
  const [draft, setDraft] = useState<ProfileValues | null>(null);
  const [helpers, setHelpers] = useState<Helpers>(emptyHelpers);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reconnect, setReconnect] = useState(false);
  const [report, setReport] = useState<SaveReport | null>(null);
  const [mustReload, setMustReload] = useState(false);
  const running = useRef(false);
  const alive = useRef(true);
  const parsed = draft ? profileValuesSchema.safeParse(cleaned(draft)) : null;
  const changes =
    profile && draft
      ? changedProfileFields(
          profile.values,
          parsed?.success ? parsed.data : cleaned(draft),
        )
      : [];
  const completeness = draft ? profileCompleteness(cleaned(draft)) : null;

  function showError(failure: unknown) {
    setError(
      failure instanceof Error
        ? failure.message
        : "Could not complete this request.",
    );
    const code =
      typeof failure === "object" && failure && "code" in failure
        ? failure.code
        : "";
    setReconnect(code === "SIGN_IN" || code === "REAUTHORIZE");
    if (code === "CONFLICT" || code === "WRONG_ACCOUNT") setMustReload(true);
  }
  function store(
    id: number,
    values: ProfileValues,
    helperValues: Helpers,
    baseline = profile?.values,
  ) {
    try {
      sessionStorage.setItem(
        storageKey(id),
        JSON.stringify({ values, helpers: helperValues, baseline }),
      );
    } catch {
      /* Optional browser storage. */
    }
  }
  function restore(loaded: GitHubProfile) {
    let values = loaded.values;
    let helperValues = emptyHelpers;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(storageKey(loaded.id)) ?? "null",
      );
      const result = profileDraftSchema.safeParse(saved?.values);
      if (result.success) {
        const baseline = profileDraftSchema.safeParse(saved.baseline);
        values = baseline.success
          ? mergeEdits(loaded.values, baseline.data, result.data)
          : result.data;
        if (
          saved.helpers &&
          ["role", "skills", "interests"].every(
            (key) =>
              typeof saved.helpers[key] === "string" &&
              saved.helpers[key].length <= 100,
          )
        )
          helperValues = saved.helpers;
        setMessage(
          "Your unsaved draft was restored. Review it against the latest GitHub profile before saving.",
        );
      }
    } catch {
      /* Optional browser storage. */
    }
    setDraft(values);
    setHelpers(helperValues);
  }
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    api({ signal: controller.signal })
      .then((data) => {
        if (!alive.current || controller.signal.aborted) return;
        setProfile(data.profile);
        restore(data.profile);
        setLoading(false);
      })
      .catch((failure) => {
        if (alive.current && !controller.signal.aborted) {
          showError(failure);
          setLoading(false);
        }
      });
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, []);
  async function work(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setReconnect(false);
    try {
      await action();
    } catch (failure) {
      if (alive.current) showError(failure);
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function edit(next: ProfileValues) {
    setDraft(next);
    setReview(false);
    setReport(null);
    setMessage("");
    setError("");
    if (profile) store(profile.id, next, helpers);
  }
  function field<K extends keyof ProfileValues>(
    key: K,
    value: ProfileValues[K],
  ) {
    if (draft) edit({ ...draft, [key]: value });
  }
  async function reload() {
    await work(async () => {
      const data = await api();
      if (!alive.current) return;
      if (draft && profile && profile.id === data.profile.id) {
        const next = mergeEdits(data.profile.values, profile.values, draft);
        setDraft(next);
        store(data.profile.id, next, helpers, data.profile.values);
      } else restore(data.profile);
      setProfile(data.profile);
      setMustReload(false);
      setReview(false);
      setReport(null);
      setLoading(false);
      setMessage(
        "Latest profile loaded. Your edited fields are kept for another review.",
      );
    });
  }
  async function save() {
    if (!profile || !parsed?.success || !review || mustReload) return;
    await work(async () => {
      const data = await api({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expected: { id: profile.id, values: profile.values },
          desired: parsed.data,
        }),
      });
      if (!alive.current) return;
      setReport(data);
      setReview(false);
      setMessage(data.message);
      setReconnect(data.code === "SIGN_IN" || data.code === "REAUTHORIZE");
      if (!data.profile) {
        setMustReload(true);
        return;
      }
      setProfile(data.profile);
      const next = { ...data.profile.values } as ProfileValues;
      for (const key of data.pendingFields as ProfileField[]) {
        if (key === "socials") next.socials = parsed.data.socials;
        else if (key === "hireable") next.hireable = parsed.data.hireable;
        else next[key] = parsed.data[key];
      }
      setDraft(next);
      if (data.status === "complete") {
        setMustReload(false);
        try {
          sessionStorage.removeItem(storageKey(profile.id));
        } catch {
          /* Optional storage. */
        }
      } else {
        store(profile.id, next, helpers, data.profile.values);
        setMustReload(data.code === "CONFLICT");
      }
    });
  }

  if (!profile || !draft || !completeness)
    return (
      <section className="mt-8">
        <h2 className="text-xl font-semibold">GitHub Profile Setup</h2>
        {loading ? (
          <p role="status" className="mt-4">
            Fetching your profile details…
          </p>
        ) : (
          <>
            <p role="alert" className="mt-4 text-red-700">
              {error}
            </p>
            <button
              type="button"
              className={`${buttonClass} mt-4`}
              disabled={busy}
              onClick={reload}
            >
              Retry profile fetch
            </button>
            {reconnect && (
              <div className="mt-3">
                <AuthButton callbackUrl="/workspace" />
              </div>
            )}
          </>
        )}
      </section>
    );

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">GitHub Profile Setup</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Complete your actual GitHub profile first. Saved details can be
            reused in your README.
          </p>
        </div>
        <button
          type="button"
          className={buttonClass}
          disabled={busy}
          onClick={reload}
        >
          Reload latest (keep draft)
        </button>
      </div>
      <div className="mt-5 flex items-center gap-3">
        {profile.avatar.startsWith(
          "https://avatars.githubusercontent.com/",
        ) && (
          <Image
            src={profile.avatar}
            alt={`${profile.username}'s avatar`}
            width={56}
            height={56}
            className="rounded-full"
          />
        )}
        <div>
          <p className="font-medium">@{profile.username}</p>
          <p className="text-xs text-zinc-500">
            Username and avatar are shown for identification.
          </p>
        </div>
      </div>
      {(!profile.canEdit || reconnect) && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="mb-3">
            Reconnect GitHub to grant profile-editing permission. Your draft
            stays in this browser tab.
          </p>
          <AuthButton callbackUrl="/workspace" />
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-4 rounded-lg bg-zinc-50 p-3 text-sm">
          {message}
        </p>
      )}
      {report && (
        <div className="mt-3 space-y-2 rounded-lg border border-zinc-200 p-4 text-sm">
          {report.savedFields.length > 0 && (
            <p className="text-emerald-800">
              Verified:{" "}
              {report.savedFields.map((key) => profileLabels[key]).join(", ")}.
            </p>
          )}
          {report.pendingFields.length > 0 && (
            <p className="text-amber-900">
              {report.status === "unverified"
                ? "Needs verification"
                : "Still pending"}
              :{" "}
              {report.pendingFields.map((key) => profileLabels[key]).join(", ")}
              . Your remaining draft is kept.
            </p>
          )}
          {report.addedLinks.length > 0 && (
            <p className="break-all">
              Added links: {report.addedLinks.join(", ")}
            </p>
          )}
          {report.removedLinks.length > 0 && (
            <p className="break-all">
              Removed links: {report.removedLinks.join(", ")}
            </p>
          )}
        </div>
      )}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <fieldset
          disabled={busy}
          className="min-w-0 space-y-5 disabled:opacity-60"
        >
          <legend className="mb-3 font-semibold">Public profile details</legend>
          <label className="block text-sm">
            Display name
            <input
              className={inputClass}
              maxLength={100}
              value={draft.name}
              onChange={(event) => field("name", event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Bio
            <textarea
              className={inputClass}
              maxLength={160}
              rows={3}
              value={draft.bio}
              onChange={(event) => field("bio", event.target.value)}
            />
            <span className="mt-1 block text-xs text-zinc-500">
              {draft.bio.length}/160 · Describe your focus. You can use
              @mentions.
            </span>
          </label>
          <details className="rounded-lg border border-zinc-200 p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Help me write my bio
            </summary>
            <p className="mt-2 text-xs text-zinc-500">
              Optional helper information. Only the bio you choose is saved to
              GitHub.
            </p>
            <div className="mt-3 space-y-3">
              {(
                [
                  ["role", "Role", "Full-stack developer"],
                  ["skills", "Main skills", "TypeScript, React"],
                  ["interests", "Interests", "Open-source tools"],
                ] as const
              ).map(([key, label, placeholder]) => (
                <label key={key} className="block text-xs">
                  {label}
                  <input
                    className={inputClass}
                    maxLength={100}
                    placeholder={placeholder}
                    value={helpers[key]}
                    onChange={(event) => {
                      const next = { ...helpers, [key]: event.target.value };
                      setHelpers(next);
                      store(profile.id, draft, next);
                    }}
                  />
                </label>
              ))}
            </div>
            <ul className="mt-4 space-y-3">
              {suggestBios(helpers.role, helpers.skills, helpers.interests).map(
                (bio) => (
                  <li key={bio} className="rounded-lg bg-zinc-50 p-3 text-sm">
                    <p className="break-words">{bio}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-zinc-500">
                        {bio.length}/160
                        {bio.length > 160 ? " — shorten helper details" : ""}
                      </span>
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={bio.length > 160}
                        onClick={() => field("bio", bio)}
                      >
                        Use this bio
                      </button>
                    </div>
                  </li>
                ),
              )}
            </ul>
          </details>
          <label className="block text-sm">
            Website / portfolio
            <input
              type="url"
              className={inputClass}
              maxLength={2048}
              placeholder="https://your-website.com"
              value={draft.website}
              onChange={(event) => field("website", event.target.value)}
            />
          </label>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-sm">
              Location <span className="text-zinc-500">(optional)</span>
              <input
                className={inputClass}
                maxLength={100}
                placeholder="City, country"
                value={draft.location}
                onChange={(event) => field("location", event.target.value)}
              />
            </label>
            <label className="block text-sm">
              Company / organization{" "}
              <span className="text-zinc-500">(optional)</span>
              <input
                className={inputClass}
                maxLength={100}
                value={draft.company}
                onChange={(event) => field("company", event.target.value)}
              />
            </label>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">
              Social accounts{" "}
              <span className="font-normal text-zinc-500">(up to 4)</span>
            </p>
            {draft.socials.map((url, index) => (
              <div key={index} className="flex items-center gap-2">
                <label className="min-w-0 flex-1 text-xs">
                  Social account {index + 1}
                  <input
                    type="url"
                    className={inputClass}
                    maxLength={2048}
                    placeholder="https://www.linkedin.com/in/your-name"
                    value={url}
                    onChange={(event) =>
                      field(
                        "socials",
                        draft.socials.map((item, position) =>
                          position === index ? event.target.value : item,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className={`${buttonClass} mt-5`}
                  aria-label={`Remove social account ${index + 1}`}
                  onClick={() =>
                    field(
                      "socials",
                      draft.socials.filter((_, position) => position !== index),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className={buttonClass}
              disabled={draft.socials.length >= 4}
              onClick={() => field("socials", [...draft.socials, ""])}
            >
              Add social account
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.hireable}
              onChange={(event) => field("hireable", event.target.checked)}
            />
            Available for hire <span className="text-zinc-500">(optional)</span>
          </label>
          {parsed && !parsed.success && (
            <p role="alert" className="text-sm text-red-700">
              {parsed.error.issues[0]?.message}
            </p>
          )}
        </fieldset>
        <aside className="space-y-5 lg:sticky lg:top-6">
          <div className="rounded-xl border border-zinc-200 p-5">
            <h3 className="font-semibold">Profile completeness</h3>
            <p className="mt-3 text-3xl font-semibold text-emerald-800">
              {completeness.score}%
            </p>
            <progress
              className="mt-3 h-2 w-full accent-emerald-700"
              max={100}
              value={completeness.score}
              aria-label="Profile information completeness"
            />
            <p className="mt-3 text-xs text-zinc-500">
              Based on name, bio and a website/social link. This measures
              information, not developer skill. Optional personal details are
              not scored.
            </p>
            {completeness.suggestions.length ? (
              <ul className="mt-4 list-disc space-y-2 pl-4 text-sm text-zinc-600">
                {completeness.suggestions.map((suggestion) => (
                  <li key={suggestion}>{suggestion}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-emerald-800">
                Your main profile details are filled.
              </p>
            )}
          </div>
          <div className="rounded-xl bg-zinc-50 p-5 text-sm">
            <h3 className="font-semibold">Other GitHub settings</h3>
            <p className="mt-2 text-zinc-600">
              Manage your picture, pronouns and local-time display directly on
              GitHub. Email stays separate and is never copied into your README
              automatically.
            </p>
            <a
              className="mt-3 block underline underline-offset-4"
              href="https://github.com/settings/profile"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open profile settings
            </a>
            <a
              className="mt-2 block underline underline-offset-4"
              href="https://github.com/settings/emails"
              target="_blank"
              rel="noopener noreferrer"
            >
              Manage email settings
            </a>
          </div>
        </aside>
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-6">
        <button
          type="button"
          className="rounded-lg bg-emerald-700 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
          disabled={
            busy ||
            !parsed?.success ||
            !changes.length ||
            !profile.canEdit ||
            mustReload
          }
          onClick={() => {
            setReview(true);
            setReport(null);
          }}
        >
          Review changes
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={busy}
          onClick={() => {
            setDraft(profile.values);
            setHelpers(emptyHelpers);
            setReview(false);
            setReport(null);
            setError("");
            setMessage("Draft discarded. GitHub was not changed.");
            try {
              sessionStorage.removeItem(storageKey(profile.id));
            } catch {
              /* Optional storage. */
            }
          }}
        >
          Discard changes
        </button>
        {!changes.length && (
          <span className="text-sm text-zinc-500">
            No unsaved profile changes.
          </span>
        )}
        {mustReload && (
          <p className="text-sm text-amber-900">
            Reload latest before reviewing another save.
          </p>
        )}
      </div>
      {review && parsed?.success && (
        <div className="mt-5 rounded-xl border border-zinc-200 p-5">
          <h3 className="font-semibold">Review profile changes</h3>
          <p className="mt-2 text-sm text-zinc-600">
            Only these fields will be updated. Empty values intentionally clear
            a field.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Field</th>
                  <th className="p-2">Current on GitHub</th>
                  <th className="p-2">Your change</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((key) => (
                  <tr key={key} className="border-t border-zinc-100">
                    <th className="p-2 align-top font-medium">
                      {profileLabels[key]}
                    </th>
                    <td className="max-w-64 whitespace-pre-wrap break-words p-2 align-top">
                      {display(key, profile.values)}
                    </td>
                    <td className="max-w-64 whitespace-pre-wrap break-words p-2 align-top text-emerald-800">
                      {display(key, parsed.data)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              disabled={busy || mustReload}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={save}
            >
              {busy ? "Saving and verifying…" : "Save to GitHub"}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => setReview(false)}
            >
              Keep editing
            </button>
          </div>
        </div>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <a
          className="text-sm underline underline-offset-4"
          href={`https://github.com/${profile.username}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          View GitHub profile
        </a>
        <button
          type="button"
          className={buttonClass}
          disabled={busy || mustReload || changes.length > 0}
          onClick={() => onContinue(profile, helpers.skills)}
        >
          Continue to README →
        </button>
        {changes.length > 0 && (
          <span className="text-xs text-zinc-500">
            Save or discard your edits to continue with GitHub&apos;s saved
            details.
          </span>
        )}
      </div>
    </section>
  );
}
