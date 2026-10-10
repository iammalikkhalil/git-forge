"use client";

import "./workspace-controls.css";
import "./profile.css";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import {
  profileValuesSchema,
  profileDraftSchema,
  profileLabels,
  changedProfileFields,
  profileUrl,
  suggestBios,
  type GitHubProfile,
  type ProfileValues,
  type ProfileField,
} from "@/lib/github-profile-schema";

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

export function ProfileEditor() {
  const [bioOpen, setBioOpen] = useState(false);
  const reviewTrigger = useRef<HTMLButtonElement>(null);
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
  const [recovered, setRecovered] = useState(false);

  function showError(failure: unknown) {
    setReview(false);
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
        setRecovered(true);
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
      setRecovered(false);
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
        setRecovered(false);
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

  function discard() {
    if (!profile) return;
    setDraft(profile.values);
    setHelpers(emptyHelpers);
    setReview(false);
    setReport(null);
    setError("");
    setRecovered(false);
    setMessage("Draft discarded. GitHub was not changed.");
    try {
      sessionStorage.removeItem(storageKey(profile.id));
    } catch {
      /* Optional storage. */
    }
  }
  const reconnectButton = (
    <button
      type="button"
      className="ws-button"
      disabled={busy}
      onClick={() => void signIn("github", { callbackUrl: "/workspace" })}
    >
      Reconnect GitHub
    </button>
  );

  return (
    <section aria-labelledby="profile-title">
      <div className="workspace-section-heading">
        <h1 id="profile-title">My Profile</h1>
        <p>Update the details people see on your GitHub profile.</p>
        <div className="profile-managed">
          <ProfileIcon kind="info" />
          Your avatar and username are managed on GitHub.
        </div>
      </div>
      {!profile || !draft ? (
        loading ? (
          <div
            className="profile-grid"
            aria-busy="true"
            aria-label="Loading profile"
          >
            <div className="workspace-panel profile-skeleton" role="status">
              Loading your profile details…
              <div />
              <div />
              <div />
            </div>
            <div className="workspace-panel profile-skeleton">
              <div />
              <div />
            </div>
          </div>
        ) : (
          <div className="workspace-panel ws-notice" role="alert">
            <p>{error}</p>
            <button
              type="button"
              className="ws-button"
              disabled={busy}
              onClick={reload}
            >
              Retry profile fetch
            </button>
            {reconnect && reconnectButton}
          </div>
        )
      ) : (
        <>
          {(reconnect || !profile.canEdit) && (
            <div className="ws-notice ws-warning">
              <p>
                Reconnect GitHub to grant profile-editing permission. Your draft
                stays in this browser tab.
              </p>
              {reconnectButton}
            </div>
          )}
          {error && (
            <div className="ws-notice ws-error" role="alert">
              <p>{error}</p>
              {mustReload && (
                <button
                  type="button"
                  className="ws-button"
                  disabled={busy}
                  onClick={reload}
                >
                  Reload latest, keep draft
                </button>
              )}
            </div>
          )}
          {message && !recovered && (
            <div className="ws-notice" role="status">
              {message}
            </div>
          )}
          {report && (
            <div className="ws-notice" role="status">
              {report.savedFields.length > 0 && (
                <p className="ws-success">
                  Verified:{" "}
                  {report.savedFields
                    .map((key) => profileLabels[key])
                    .join(", ")}
                  .
                </p>
              )}
              {report.pendingFields.length > 0 && (
                <p className="ws-warning">
                  {report.status === "unverified"
                    ? "Needs verification"
                    : "Still pending"}
                  :{" "}
                  {report.pendingFields
                    .map((key) => profileLabels[key])
                    .join(", ")}
                  . Your remaining draft is kept.
                </p>
              )}
              {report.addedLinks.length > 0 && (
                <p>Added links: {report.addedLinks.join(", ")}</p>
              )}
              {report.removedLinks.length > 0 && (
                <p>Removed links: {report.removedLinks.join(", ")}</p>
              )}
              {mustReload && (
                <button
                  type="button"
                  className="ws-button"
                  disabled={busy}
                  onClick={reload}
                >
                  Reload latest, keep draft
                </button>
              )}
            </div>
          )}
          <div className="profile-grid">
            <div className="workspace-panel profile-editor-panel">
              <div
                className={`profile-save-state ${changes.length ? "is-dirty" : ""}`}
                role="status"
              >
                <span />
                <div>
                  <strong>
                    {busy
                      ? "Working on your profile…"
                      : changes.length
                        ? "Unsaved changes"
                        : "Your profile is up to date"}
                  </strong>
                  <p>
                    {changes.length
                      ? "Your edits stay here until you save."
                      : "Edit your details below to get started."}
                  </p>
                </div>
              </div>
              <fieldset disabled={busy} className="profile-fields">
                <legend className="ws-sr-only">Public profile details</legend>
                <label className="ws-field">
                  Name
                  <input
                    className="ws-input"
                    maxLength={100}
                    autoComplete="name"
                    value={draft.name}
                    onChange={(event) => field("name", event.target.value)}
                  />
                </label>
                <div>
                  <label className="ws-field">
                    Bio
                    <textarea
                      className="ws-input profile-bio"
                      maxLength={160}
                      rows={4}
                      value={draft.bio}
                      onChange={(event) => field("bio", event.target.value)}
                    />
                  </label>
                  <div className="profile-bio-footer">
                    <span>{draft.bio.length} / 160</span>
                    <button
                      type="button"
                      className="ws-button ws-button-small"
                      aria-expanded={bioOpen}
                      aria-controls="profile-bio-helper"
                      onClick={() => setBioOpen(!bioOpen)}
                    >
                      <ProfileIcon kind="spark" />
                      Help write my bio
                    </button>
                  </div>
                  {bioOpen && (
                    <div id="profile-bio-helper" className="profile-bio-helper">
                      <h2>Help write your bio</h2>
                      <p>Only the bio you choose is saved to GitHub.</p>
                      {(
                        [
                          ["role", "Role", "Full-stack developer"],
                          ["skills", "Skills", "TypeScript, React"],
                          ["interests", "Interests", "Open-source tools"],
                        ] as const
                      ).map(([key, label, placeholder]) => (
                        <label key={key} className="ws-field">
                          {label}
                          <input
                            className="ws-input"
                            maxLength={100}
                            placeholder={placeholder}
                            value={helpers[key]}
                            onChange={(event) => {
                              const next = {
                                ...helpers,
                                [key]: event.target.value,
                              };
                              setHelpers(next);
                              store(profile.id, draft, next);
                            }}
                          />
                        </label>
                      ))}
                      <ul>
                        {suggestBios(
                          helpers.role,
                          helpers.skills,
                          helpers.interests,
                        ).map((bio) => (
                          <li key={bio}>
                            <p>{bio}</p>
                            <div>
                              <span>{bio.length} / 160</span>
                              <button
                                type="button"
                                className="ws-button ws-button-small"
                                disabled={bio.length > 160}
                                onClick={() => field("bio", bio)}
                              >
                                Use this bio
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <label className="ws-field">
                  Website
                  <span className="profile-input-icon">
                    <ProfileIcon kind="link" />
                    <input
                      type="url"
                      className="ws-input"
                      maxLength={2048}
                      placeholder="https://your-website.com"
                      value={draft.website}
                      onChange={(event) => field("website", event.target.value)}
                    />
                  </span>
                </label>
                <div className="profile-socials">
                  <div className="profile-social-heading">
                    <span>Social links</span>
                    <span>Add up to 4 links.</span>
                  </div>
                  {draft.socials.map((url, index) => (
                    <div className="profile-social-row" key={index}>
                      <span className="profile-input-icon">
                        <ProfileIcon kind="link" />
                        <input
                          aria-label={`Social link ${index + 1}`}
                          type="url"
                          className="ws-input"
                          maxLength={2048}
                          placeholder="https://linkedin.com/in/your-name"
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
                      </span>
                      <button
                        type="button"
                        className="ws-button profile-remove"
                        aria-label={`Remove social link ${index + 1}`}
                        onClick={() =>
                          field(
                            "socials",
                            draft.socials.filter(
                              (_, position) => position !== index,
                            ),
                          )
                        }
                      >
                        <ProfileIcon kind="trash" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="ws-button"
                    disabled={draft.socials.length >= 4}
                    onClick={() => field("socials", [...draft.socials, ""])}
                  >
                    <span aria-hidden="true">＋</span>Add social link
                  </button>
                </div>
                <div className="profile-more-wrap">
                  <details className="profile-more">
                    <summary>
                      <ProfileIcon kind="company" />
                      <span>
                        <strong>More profile details</strong>
                        <small>Company, location, and availability</small>
                      </span>
                      <span className="profile-chevron" aria-hidden="true">
                        ⌄
                      </span>
                    </summary>
                    <div className="profile-more-fields">
                      <label className="ws-field">
                        Company
                        <input
                          className="ws-input"
                          maxLength={100}
                          value={draft.company}
                          onChange={(event) =>
                            field("company", event.target.value)
                          }
                        />
                      </label>
                      <label className="ws-field">
                        Location
                        <input
                          className="ws-input"
                          maxLength={100}
                          placeholder="City, country"
                          value={draft.location}
                          onChange={(event) =>
                            field("location", event.target.value)
                          }
                        />
                      </label>
                      <label className="profile-checkbox">
                        <input
                          type="checkbox"
                          checked={draft.hireable}
                          onChange={(event) =>
                            field("hireable", event.target.checked)
                          }
                        />
                        Available for hire
                      </label>
                    </div>
                  </details>
                </div>
              </fieldset>
              {parsed && !parsed.success && (
                <p className="ws-error profile-validation" role="alert">
                  {parsed.error.issues[0]?.message}
                </p>
              )}
              <div className="profile-actions">
                {recovered && (
                  <div className="profile-recovered" role="status">
                    <ProfileIcon kind="history" />
                    <span>Draft recovered from this tab.</span>
                    <button
                      type="button"
                      className="ws-text-button"
                      disabled={busy}
                      onClick={discard}
                    >
                      Discard draft
                    </button>
                  </div>
                )}
                <div className="profile-action-buttons">
                  <button
                    ref={reviewTrigger}
                    type="button"
                    className="ws-button ws-button-primary"
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
                    <ProfileIcon kind="forge" />
                    Review &amp; save profile
                  </button>
                  <button
                    type="button"
                    className="ws-button"
                    disabled={busy || !changes.length}
                    onClick={discard}
                  >
                    Discard changes
                  </button>
                </div>
                <p>You can review your changes before saving.</p>
                {mustReload && (
                  <button
                    type="button"
                    className="ws-text-button"
                    disabled={busy}
                    onClick={reload}
                  >
                    Reload latest, keep draft before reviewing again
                  </button>
                )}
              </div>
            </div>
            <aside
              className="profile-preview-column"
              aria-label="Profile preview"
            >
              <div className="workspace-panel profile-preview-panel">
                <h2>Profile preview</h2>
                <p className="profile-preview-caption">Preview of your edits</p>
                <div className="profile-preview-card">
                  {profile.avatar.startsWith(
                    "https://avatars.githubusercontent.com/",
                  ) ? (
                    <Image
                      src={profile.avatar}
                      alt={`${profile.username}'s avatar`}
                      width={144}
                      height={144}
                      className="profile-preview-avatar"
                    />
                  ) : (
                    <div className="profile-preview-avatar profile-avatar-fallback">
                      {profile.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <h3>{draft.name.trim() || profile.username}</h3>
                  <p className="profile-preview-username">{profile.username}</p>
                  {draft.bio.trim() && (
                    <p className="profile-preview-bio">{draft.bio}</p>
                  )}
                  <div className="profile-preview-details">
                    {draft.company.trim() && (
                      <p>
                        <ProfileIcon kind="company" />
                        <span>{draft.company}</span>
                      </p>
                    )}
                    {draft.location.trim() && (
                      <p>
                        <ProfileIcon kind="location" />
                        <span>{draft.location}</span>
                      </p>
                    )}
                    {draft.website.trim() && (
                      <PreviewLink url={draft.website} />
                    )}
                    {draft.socials
                      .filter((url) => url.trim())
                      .map((url, index) => (
                        <PreviewLink key={index} url={url} />
                      ))}
                    {draft.hireable && (
                      <p className="ws-success">
                        <ProfileIcon kind="profile" />
                        <span>Available for hire</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="workspace-panel profile-explainer">
                <ProfileIcon kind="bulb" />
                <div>
                  <h2>What changes?</h2>
                  <p>
                    Saving updates your public GitHub profile. Your README and
                    repositories are managed separately.
                  </p>
                </div>
              </div>
            </aside>
          </div>
          {review && parsed?.success && (
            <ProfileReview
              profile={profile}
              desired={parsed.data}
              changes={changes}
              busy={busy}
              onClose={() => {
                setReview(false);
                reviewTrigger.current?.focus();
              }}
              onSave={save}
            />
          )}
        </>
      )}
    </section>
  );
}

function PreviewLink({ url }: { url: string }) {
  const result = profileUrl.safeParse(url);
  return (
    <p>
      <ProfileIcon kind="link" />
      {result.success ? (
        <a href={result.data} target="_blank" rel="noopener noreferrer">
          {url}
        </a>
      ) : (
        <span>{url}</span>
      )}
    </p>
  );
}

function ProfileReview({
  profile,
  desired,
  changes,
  busy,
  onClose,
  onSave,
}: {
  profile: GitHubProfile;
  desired: ProfileValues;
  changes: ProfileField[];
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="profile-review"
      aria-labelledby="profile-review-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="profile-review-heading">
        <h2 id="profile-review-title">Review profile changes</h2>
        <button
          type="button"
          className="ws-button"
          aria-label="Close review"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <p>
        Only these fields will be updated. Empty values intentionally clear a
        field.
      </p>
      <div className="profile-review-table">
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Current on GitHub</th>
              <th>Your change</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((key) => (
              <tr key={key}>
                <th scope="row">{profileLabels[key]}</th>
                <td>{display(key, profile.values)}</td>
                <td>{display(key, desired)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="profile-review-actions">
        <button
          type="button"
          className="ws-button"
          disabled={busy}
          onClick={onClose}
        >
          Keep editing
        </button>
        <button
          type="button"
          className="ws-button ws-button-primary"
          disabled={busy}
          onClick={onSave}
        >
          {busy ? "Saving and verifying…" : "Confirm & save to GitHub"}
        </button>
      </div>
    </dialog>
  );
}

type ProfileIconKind =
  | "info"
  | "spark"
  | "link"
  | "trash"
  | "company"
  | "history"
  | "forge"
  | "location"
  | "profile"
  | "bulb";
function ProfileIcon({ kind }: { kind: ProfileIconKind }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "info" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7h.01" />
        </>
      )}
      {kind === "spark" && (
        <>
          <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4M18 4h4" />
        </>
      )}
      {kind === "link" && (
        <>
          <path d="m10 13 4-4M8 15l-1 1a3.5 3.5 0 0 1-5-5l5-5a3.5 3.5 0 0 1 5 0M16 9l1-1a3.5 3.5 0 0 1 5 5l-5 5a3.5 3.5 0 0 1-5 0" />
        </>
      )}
      {kind === "trash" && (
        <>
          <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
        </>
      )}
      {kind === "company" && (
        <>
          <path d="M4 21V5h10v16M14 11h6v10M2 21h20M8 9h2M8 13h2M8 17h2M17 15h1M17 18h1" />
        </>
      )}
      {kind === "history" && (
        <>
          <path d="M3 5v5h5M3 10a9 9 0 1 1 2 8M12 7v5l3 2" />
        </>
      )}
      {kind === "forge" && (
        <>
          <circle cx="6" cy="4" r="2" />
          <circle cx="6" cy="20" r="2" />
          <circle cx="18" cy="6" r="2" />
          <path d="M6 6v12M6 14h4a8 8 0 0 0 8-6" />
        </>
      )}
      {kind === "location" && (
        <>
          <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
          <circle cx="12" cy="10" r="2" />
        </>
      )}
      {kind === "profile" && (
        <>
          <circle cx="12" cy="7" r="4" />
          <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
        </>
      )}
      {kind === "bulb" && (
        <>
          <path d="M9 18h6M9 21h6M8 14a7 7 0 1 1 8 0l-1 4H9Z" />
        </>
      )}
    </svg>
  );
}
