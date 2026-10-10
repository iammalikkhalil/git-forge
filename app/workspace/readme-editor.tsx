"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { ReadmePreview } from "@/app/components/readme-preview";
import {
  buildProfileReadme,
  readmeContentSchema,
  readmeFormSchema,
  sectionLabels,
  type ProfileReadme,
  type ReadmeForm,
  type ReadmeRevision,
  type ReadmeSection,
  type ShowcaseProject,
} from "@/lib/profile-readme-schema";
import {
  buildSelectableTemplate,
  selectableTemplates,
  type SelectableTemplateId,
} from "@/lib/profile-readme-templates";
import {
  download,
  draftKey,
  recoverDraft,
  request,
  type Draft,
  type ProfileHandoff,
} from "./readme-state";
import { WorkspaceDialog } from "./workspace-dialog";
import { ReadmeImport } from "./readme-import";
import { WorkspaceIcon } from "./workspace-shell";
import "./workspace-controls.css";
import "./readme.css";

const templates = [
  {
    id: "minimal",
    title: "Developer essentials",
    style: "A clean introduction with your skills, projects, and links.",
  },
  {
    id: "professional",
    title: "Professional",
    style: "A concise overview with technical skills and selected projects.",
  },
  ...selectableTemplates,
] as const;
const extraFields: Record<
  string,
  { key: keyof ReadmeForm; label: string; max: number }[]
> = {
  minimal: [{ key: "headline", label: "Headline", max: 180 }],
  professional: [{ key: "headline", label: "Headline", max: 180 }],
  "temp-01": [
    { key: "role", label: "Role", max: 160 },
    { key: "company", label: "Company", max: 160 },
    { key: "education", label: "Education", max: 240 },
    { key: "architecture", label: "Architecture", max: 500 },
    { key: "tools", label: "Tools", max: 500 },
    { key: "communities", label: "Communities", max: 500 },
    { key: "challenge", label: "Current challenge", max: 300 },
  ],
  "temp-02": [
    { key: "headline", label: "Headline", max: 180 },
    { key: "company", label: "Company", max: 160 },
    { key: "location", label: "Location", max: 120 },
    { key: "interests", label: "Interests", max: 500 },
  ],
  "temp-03": [
    { key: "role", label: "Role", max: 160 },
    { key: "company", label: "Company", max: 160 },
    { key: "education", label: "Education", max: 240 },
    {
      key: "location",
      label: "Location (used when introduction is empty)",
      max: 120,
    },
  ],
  "temp-04": [
    { key: "headline", label: "Headline", max: 180 },
    { key: "education", label: "Education", max: 240 },
    { key: "location", label: "Location", max: 120 },
  ],
  "temp-05": [
    { key: "role", label: "Role", max: 160 },
    { key: "company", label: "Company", max: 160 },
    { key: "location", label: "Location", max: 120 },
    { key: "interests", label: "Interests", max: 500 },
    { key: "workAreas", label: "Work areas", max: 500 },
    { key: "focus", label: "Current focus", max: 500 },
    { key: "challenge", label: "Current challenge", max: 300 },
  ],
};

function generate(form: ReadmeForm, owner: string) {
  if (form.template.startsWith("temp-"))
    return buildSelectableTemplate(
      form.template as SelectableTemplateId,
      form,
      owner,
    );
  const content = buildProfileReadme(form);
  return (
    content +
    (form.showEmail && form.contactEmail
      ? `\n[Email](mailto:${encodeURIComponent(form.contactEmail)})\n`
      : "")
  );
}
type Modal = "templates" | "import" | "history" | "review" | null;
export function ReadmeEditor() {
  const [profile, setProfile] = useState<ProfileReadme | null>(null);
  const [context, setContext] = useState<ProfileHandoff>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reconnect, setReconnect] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [started, setStarted] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [replacement, setReplacement] = useState<{
    message: string;
    apply: () => void;
  } | null>(null);
  const [selectedTemplate, setSelectedTemplate] =
    useState<ReadmeForm["template"]>("minimal");
  const [previewSize, setPreviewSize] = useState<"desktop" | "mobile">(
    "desktop",
  );
  const [createPublic, setCreatePublic] = useState(false);
  const [skill, setSkill] = useState("");
  const [projects, setProjects] = useState<ShowcaseProject[]>([]);
  const [projectPage, setProjectPage] = useState(0);
  const [moreProjects, setMoreProjects] = useState(true);
  const [revisions, setRevisions] = useState<ReadmeRevision[]>([]);
  const [historyPage, setHistoryPage] = useState(0);
  const [moreHistory, setMoreHistory] = useState(true);
  const [revision, setRevision] = useState<{
    sha: string;
    content: string;
  } | null>(null);
  const alive = useRef(true);
  const running = useRef(false);
  const source = useRef<HTMLTextAreaElement>(null);
  const more = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function dismiss(event: PointerEvent | FocusEvent) {
      if (event.target instanceof Node && !more.current?.contains(event.target))
        closeMore();
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && more.current?.open) {
        closeMore();
        more.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("focusin", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  const basic =
    draft?.form.template === "minimal" ||
    draft?.form.template === "professional";
  const activeForm = draft
    ? {
        ...draft.form,
        links:
          basic && !draft.form.sections.includes("links")
            ? []
            : draft.form.links,
        projects:
          basic && !draft.form.sections.includes("projects")
            ? []
            : draft.form.projects,
      }
    : null;
  const parsed = activeForm ? readmeFormSchema.safeParse(activeForm) : null;
  const preview = activeForm
    ? readmeFormSchema.safeParse({
        ...activeForm,
        contactEmail: readmeFormSchema.shape.contactEmail.safeParse(
          activeForm.contactEmail,
        ).success
          ? activeForm.contactEmail
          : "",
        links: activeForm.links.filter(
          (link) =>
            readmeFormSchema.shape.links.element.safeParse(link).success,
        ),
      })
    : null;
  const content =
    draft?.mode === "raw"
      ? draft.raw
      : preview?.success
        ? generate(preview.data, profile?.owner ?? "")
        : "";
  const contentResult = readmeContentSchema.safeParse(content);
  const valid =
    !!content.trim() &&
    contentResult.success &&
    (draft?.mode === "raw" ||
      (parsed?.success &&
        (!draft?.form.showEmail || !!draft?.form.contactEmail)));
  const changed = !!profile && content !== profile.content;
  const canPublish =
    started && valid && changed && !!profile?.canWrite && !profile.private;
  const bytes = new TextEncoder().encode(content).length;
  const chosen = templates.find(
    (template) => template.id === draft?.form.template,
  );
  const skills =
    draft?.form.skills
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? [];

  function failure(cause: unknown) {
    setError(
      cause instanceof Error
        ? cause.message
        : "Could not complete this request.",
    );
    const code =
      typeof cause === "object" && cause && "code" in cause ? cause.code : "";
    setReconnect(code === "SIGN_IN" || code === "REAUTHORIZE");
    if (modal === "review") setModal(null);
  }
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    request("", { signal: controller.signal })
      .then(async (data) => {
        const loaded: ProfileReadme = data.profile;
        let handoff: ProfileHandoff = null;
        try {
          const response = await fetch("/api/github-profile", {
            cache: "no-store",
            signal: controller.signal,
          });
          if (response.ok) {
            const details = await response.json();
            if (details.profile?.username === loaded.owner)
              handoff = { profile: details.profile, skills: "" };
          }
        } catch {
          /* README name and bio remain available as a fallback. */
        }
        if (!alive.current || controller.signal.aborted) return;
        const recoveredDraft = recoverDraft(loaded, handoff);
        setProfile(loaded);
        setContext(handoff);
        setDraft(recoveredDraft.initial);
        setRecovered(recoveredDraft.restored);
        setStarted(recoveredDraft.restored || !!loaded.sha);
        setLoading(false);
      })
      .catch((cause) => {
        if (alive.current && !controller.signal.aborted) {
          failure(cause);
          setLoading(false);
        }
      });
    return () => {
      alive.current = false;
      controller.abort();
    };
    // Initial fetch owns its abort controller; editing state must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function work(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setReconnect(false);
    try {
      await action();
    } catch (cause) {
      if (alive.current) failure(cause);
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function update(next: Draft) {
    setDraft(next);
    setMessage("");
    setError("");
    setCreatePublic(false);
    setStarted(true);
    if (profile)
      try {
        sessionStorage.setItem(draftKey(profile.owner), JSON.stringify(next));
      } catch {
        /* Optional browser storage. */
      }
  }
  function field<K extends keyof ReadmeForm>(key: K, value: ReadmeForm[K]) {
    if (draft) update({ ...draft, form: { ...draft.form, [key]: value } });
  }
  function replace(
    message: string,
    apply: () => void,
    needsConfirmation = changed,
  ) {
    if (needsConfirmation) {
      setReplacement({ message, apply });
    } else apply();
  }
  function discard() {
    if (!profile) return;
    // Clear before reconstructing so discarded form edits are not recovered again.
    try {
      sessionStorage.removeItem(draftKey(profile.owner));
    } catch {
      /* Optional browser storage. */
    }
    const fresh = recoverDraft(profile, context).initial;
    setDraft(fresh);
    setStarted(!!profile.sha);
    setRecovered(false);
    setError("");
    setMessage("Draft discarded. GitHub was not changed.");
    setModal(null);
  }
  function markdown() {
    if (!draft) return;
    update({ ...draft, mode: "raw", raw: content });
    setTimeout(() => source.current?.focus(), 0);
  }
  function details() {
    if (!draft || draft.mode === "form") return;
    replace(
      "Regenerating from your saved details will replace the current Markdown. Your custom Markdown cannot be converted back into form fields.",
      () => {
        update({ ...draft, mode: "form" });
        setModal(null);
      },
      draft.raw !==
        (preview?.success ? generate(preview.data, profile?.owner ?? "") : ""),
    );
  }
  function applyTemplate() {
    if (!draft) return;
    replace(
      "Applying this template will replace your current README draft. Your saved form details will be kept.",
      () => {
        update({
          ...draft,
          mode: "form",
          form: { ...draft.form, template: selectedTemplate },
        });
        setModal(null);
      },
      started && changed,
    );
  }
  function addSkill() {
    const next = skill.trim().replace(/,+/g, " ");
    if (
      !next ||
      skills.some((item) => item.toLowerCase() === next.toLowerCase())
    ) {
      setSkill("");
      return;
    }
    if ([...skills, next].join(", ").length > 1000) {
      setError("Keep your skills list within 1,000 characters.");
      return;
    }
    field("skills", [...skills, next].join(", "));
    setSkill("");
  }
  async function reload() {
    await work(async () => {
      const data = await request("");
      if (!alive.current) return;
      setProfile(data.profile);
      if (!draft) {
        const fresh = recoverDraft(data.profile, context);
        setDraft(fresh.initial);
        setRecovered(fresh.restored);
        setStarted(fresh.restored || !!data.profile.sha);
      }
      setLoading(false);
      setMessage(
        "Latest README loaded. Your draft was kept; review it before publishing.",
      );
      setModal(null);
    });
  }
  async function loadProjects() {
    await work(async () => {
      const data = await request(`?resource=projects&page=${projectPage + 1}`);
      if (!alive.current) return;
      setProjects((current) => [
        ...current,
        ...data.projects.filter(
          (project: ShowcaseProject) =>
            !current.some((item) => item.url === project.url),
        ),
      ]);
      setProjectPage((page) => page + 1);
      setMoreProjects(data.hasMore);
    });
  }
  async function history() {
    await work(async () => {
      const data = await request(`?resource=history&page=${historyPage + 1}`);
      if (!alive.current) return;
      setRevisions((current) => [
        ...current,
        ...data.revisions.filter(
          (item: ReadmeRevision) =>
            !current.some((entry) => entry.sha === item.sha),
        ),
      ]);
      setHistoryPage((page) => page + 1);
      setMoreHistory(data.hasMore);
    });
  }
  async function loadRevision(sha: string) {
    await work(async () => {
      const data = await request(`?resource=revision&sha=${sha}`);
      if (alive.current) setRevision({ sha, content: data.content });
    });
  }
  async function publish() {
    if (
      !profile ||
      !canPublish ||
      modal !== "review" ||
      (!profile.repositoryId && !createPublic)
    )
      return;
    await work(async () => {
      const data = await request("", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          expected: {
            repositoryId: profile.repositoryId,
            branch: profile.branch,
            path: profile.path,
            sha: profile.sha,
          },
          createPublic,
        }),
      });
      if (!alive.current) return;
      setProfile(data.profile);
      setRecovered(false);
      setModal(null);
      setCreatePublic(false);
      setRevisions([]);
      setHistoryPage(0);
      setMoreHistory(true);
      try {
        sessionStorage.removeItem(draftKey(data.profile.owner));
      } catch {
        /* Optional storage. */
      }
      setMessage(
        data.unchanged
          ? "Your README is already up to date."
          : "Your profile README was published and verified.",
      );
    });
  }
  function reorder(index: number, direction: number) {
    if (!draft) return;
    const next = [...draft.form.sections];
    const destination = index + direction;
    if (destination < 0 || destination >= next.length) return;
    [next[index], next[destination]] = [next[destination], next[index]];
    field("sections", next);
  }
  function closeMore() {
    if (more.current) more.current.open = false;
  }
  const reconnectAction = (
    <button
      type="button"
      className="ws-button"
      onClick={() =>
        void signIn("github", { callbackUrl: "/workspace/readme" })
      }
    >
      Reconnect GitHub
    </button>
  );
  return (
    <section className="readme-workspace" aria-labelledby="readme-title">
      <div className="readme-page-heading">
        <div className="workspace-section-heading">
          <h1 id="readme-title">My README</h1>
          <p>Create the introduction people see on your GitHub profile.</p>
        </div>
        {profile && draft && (
          <div className="readme-toolbar">
            <button
              type="button"
              className="ws-button"
              disabled={busy}
              onClick={() => setModal("import")}
            >
              <ReadmeIcon kind="upload" />
              Import README
            </button>
            <details ref={more} className="readme-more">
              <summary className="ws-button">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                </svg>
                <span>More</span>
              </summary>
              <div className="readme-more-menu">
                <button
                  type="button"
                  disabled={!content.trim()}
                  onClick={() => {
                    download(content, "README.md");
                    closeMore();
                  }}
                >
                  Download draft
                </button>
                {profile.sha && (
                  <button
                    type="button"
                    onClick={() => {
                      download(
                        profile.content,
                        `${profile.owner}-README-backup.md`,
                      );
                      closeMore();
                    }}
                  >
                    Download GitHub backup
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    closeMore();
                    void reload();
                  }}
                >
                  Reload latest, keep draft
                </button>
                {profile.sha && (
                  <a
                    href={`https://github.com/${profile.owner}/${profile.owner}/blob/${encodeURIComponent(profile.branch ?? "main")}/${profile.path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={closeMore}
                  >
                    Open GitHub README ↗
                  </a>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    closeMore();
                    replace(
                      "Discard this draft and return to the latest loaded GitHub README?",
                      discard,
                    );
                  }}
                >
                  Discard draft
                </button>
              </div>
            </details>
          </div>
        )}
      </div>
      {loading ? (
        <div className="readme-grid" aria-busy="true">
          <div className="workspace-panel readme-loading" role="status">
            Loading your README workspace…
          </div>
          <div className="workspace-panel readme-loading" />
        </div>
      ) : !profile || !draft ? (
        <div className="ws-notice ws-error" role="alert">
          <p>{error || "Could not load your README."}</p>
          <button
            type="button"
            className="ws-button"
            disabled={busy}
            onClick={reload}
          >
            Retry
          </button>
          {reconnect && reconnectAction}
        </div>
      ) : (
        <>
          <div className="readme-destination">
            <div>
              <ReadmeIcon kind="github" />
              <strong>
                {profile.owner} / {profile.owner}
              </strong>
              <span
                className={`readme-repo-badge ${profile.private ? "ws-warning" : ""}`}
              >
                {profile.private
                  ? "Private repository"
                  : profile.repositoryId
                    ? "Public repository"
                    : "Will create a public repository"}
              </span>
            </div>
            <button
              type="button"
              className="readme-history-button"
              disabled={busy}
              onClick={() => {
                setModal("history");
                if (!historyPage) void history();
              }}
            >
              <ReadmeIcon kind="history" />
              Version history
            </button>
          </div>
          {recovered && (
            <div className="readme-recovered" role="status">
              <WorkspaceIcon name="readme" />
              <span>Draft recovered from this tab.</span>
              <button
                type="button"
                className="ws-text-button"
                disabled={busy}
                onClick={() =>
                  replace(
                    "Discard the recovered draft and return to the latest loaded GitHub README?",
                    discard,
                  )
                }
              >
                Discard draft
              </button>
            </div>
          )}
          {error && (
            <div className="ws-notice ws-error" role="alert">
              <p>{error}</p>
              {reconnect && reconnectAction}
              <button
                type="button"
                className="ws-button"
                disabled={busy}
                onClick={reload}
              >
                Reload latest, keep draft
              </button>
            </div>
          )}
          {message && (
            <div className="ws-notice" role="status">
              {message}
            </div>
          )}
          {(profile.private || !profile.canWrite) && (
            <div className="ws-notice ws-warning">
              {profile.private
                ? "This profile repository is private. Make it public in GitHub settings before publishing a profile README."
                : "This repository is read-only. You can edit and download your draft, but publishing is unavailable."}
            </div>
          )}
          {!started && (
            <div className="workspace-panel readme-start">
              <div>
                <h2>Start your profile README</h2>
                <p>
                  Use your GitHub details as a starting point, or bring your own
                  Markdown.
                </p>
              </div>
              <div>
                <button
                  type="button"
                  className="ws-button ws-button-primary"
                  onClick={() => {
                    setSelectedTemplate(draft.form.template);
                    setModal("templates");
                  }}
                >
                  Choose a template
                </button>
                <button
                  type="button"
                  className="ws-button"
                  onClick={() => update({ ...draft, mode: "raw", raw: "" })}
                >
                  Write Markdown
                </button>
                <button
                  type="button"
                  className="ws-button"
                  onClick={() => setModal("import")}
                >
                  Import
                </button>
              </div>
            </div>
          )}
          {started && (
            <>
              <div className="readme-grid">
                <div className="workspace-panel readme-editor-panel">
                  <div className="readme-panel-heading">
                    <h2>
                      {draft.mode === "form"
                        ? "Personalize your README"
                        : "Edit your README"}
                    </h2>
                    <div
                      className="readme-segment"
                      role="group"
                      aria-label="Editing mode"
                    >
                      <button
                        type="button"
                        aria-pressed={draft.mode === "form"}
                        disabled={busy}
                        onClick={details}
                      >
                        <WorkspaceIcon name="readme" />
                        Details
                      </button>
                      <button
                        type="button"
                        aria-pressed={draft.mode === "raw"}
                        disabled={busy}
                        onClick={markdown}
                      >
                        <ReadmeIcon kind="code" />
                        Markdown
                      </button>
                    </div>
                  </div>
                  {draft.mode === "form" ? (
                    <fieldset className="readme-form" disabled={busy}>
                      <legend className="ws-sr-only">README details</legend>
                      <div className="readme-selected-template">
                        <span className="readme-field-title">
                          Selected template
                        </span>
                        <div>
                          <div
                            className="readme-template-thumb"
                            aria-hidden="true"
                          >
                            <span>README.md</span>
                            <strong>Hi, I’m you 👋</strong>
                            <i />
                            <i />
                            <div>
                              <b />
                              <b />
                              <b />
                            </div>
                          </div>
                          <div>
                            <strong>{chosen?.title}</strong>
                            <p>{chosen?.style}</p>
                          </div>
                          <button
                            type="button"
                            className="ws-button ws-button-small"
                            onClick={() => {
                              setSelectedTemplate(draft.form.template);
                              setModal("templates");
                            }}
                          >
                            Change template
                          </button>
                        </div>
                      </div>
                      <p className="readme-prefill">
                        Started with your GitHub profile details. These edits
                        only affect your README.
                      </p>
                      <label className="ws-field">
                        Display name
                        <input
                          className="ws-input"
                          maxLength={100}
                          value={draft.form.name}
                          onChange={(event) =>
                            field("name", event.target.value)
                          }
                        />
                      </label>
                      <label className="ws-field">
                        {draft.form.template === "temp-01"
                          ? "About me"
                          : "Introduction"}
                        <textarea
                          className="ws-input"
                          rows={4}
                          maxLength={
                            draft.form.template === "temp-01" ? 500 : 2000
                          }
                          value={
                            draft.form.template === "temp-01"
                              ? draft.form.interests
                              : draft.form.bio
                          }
                          onChange={(event) =>
                            field(
                              draft.form.template === "temp-01"
                                ? "interests"
                                : "bio",
                              event.target.value,
                            )
                          }
                        />
                      </label>
                      <div className="readme-skills">
                        <label
                          className="readme-field-title"
                          htmlFor="readme-skill"
                        >
                          Skills
                        </label>
                        <div className="readme-chips">
                          {skills.map((item, index) => (
                            <span key={index} className="readme-chip">
                              {item}
                              <button
                                type="button"
                                aria-label={`Remove ${item}`}
                                onClick={() =>
                                  field(
                                    "skills",
                                    skills
                                      .filter(
                                        (_, position) => position !== index,
                                      )
                                      .join(", "),
                                  )
                                }
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                        <div className="readme-skill-input">
                          <input
                            id="readme-skill"
                            className="ws-input"
                            placeholder="Add a skill"
                            maxLength={80}
                            value={skill}
                            onChange={(event) => setSkill(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                addSkill();
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="ws-button"
                            disabled={
                              !skill.trim() ||
                              draft.form.skills.length +
                                skill.trim().length +
                                2 >
                                1000
                            }
                            onClick={addSkill}
                          >
                            Add
                          </button>
                        </div>
                      </div>
                      <details className="readme-disclosure">
                        <summary>
                          Additional details <span aria-hidden="true">⌄</span>
                        </summary>
                        <div className="readme-disclosure-content">
                          {(extraFields[draft.form.template] ?? []).map(
                            (item) => (
                              <label key={item.key} className="ws-field">
                                {item.label}
                                <input
                                  className="ws-input"
                                  maxLength={item.max}
                                  value={String(draft.form[item.key])}
                                  onChange={(event) =>
                                    field(item.key, event.target.value)
                                  }
                                />
                              </label>
                            ),
                          )}
                        </div>
                      </details>
                      {(!basic || draft.form.sections.includes("links")) && (
                        <div className="readme-link-fields">
                          <span className="readme-field-title">
                            Profile links <small>Up to 10 links</small>
                          </span>
                          {draft.form.links.map((link, index) => {
                            const linkValid =
                              readmeFormSchema.shape.links.element.safeParse(
                                link,
                              );
                            const known = [
                              "Website",
                              "LinkedIn",
                              "GitHub",
                              "X",
                              "YouTube",
                            ];
                            const custom = !known.includes(link.label);
                            return (
                              <div className="readme-link-item" key={index}>
                                <div className="readme-link-row">
                                  <select
                                    className="ws-input"
                                    aria-label={`Link ${index + 1} type`}
                                    value={custom ? "Custom" : link.label}
                                    onChange={(event) =>
                                      field(
                                        "links",
                                        draft.form.links.map(
                                          (item, position) =>
                                            position === index
                                              ? {
                                                  ...item,
                                                  label:
                                                    event.target.value ===
                                                    "Custom"
                                                      ? "Custom link"
                                                      : event.target.value,
                                                }
                                              : item,
                                        ),
                                      )
                                    }
                                  >
                                    {known.map((label) => (
                                      <option key={label}>{label}</option>
                                    ))}
                                    <option>Custom</option>
                                  </select>
                                  <input
                                    className="ws-input"
                                    aria-label={`Link ${index + 1} URL`}
                                    type="url"
                                    maxLength={2048}
                                    placeholder="https://…"
                                    value={link.url}
                                    onChange={(event) =>
                                      field(
                                        "links",
                                        draft.form.links.map(
                                          (item, position) =>
                                            position === index
                                              ? {
                                                  ...item,
                                                  url: event.target.value,
                                                }
                                              : item,
                                        ),
                                      )
                                    }
                                  />
                                  <button
                                    type="button"
                                    className="readme-remove"
                                    aria-label={`Remove link ${index + 1}`}
                                    onClick={() =>
                                      field(
                                        "links",
                                        draft.form.links.filter(
                                          (_, position) => position !== index,
                                        ),
                                      )
                                    }
                                  >
                                    ×
                                  </button>
                                </div>
                                {custom && (
                                  <input
                                    className="ws-input"
                                    aria-label={`Link ${index + 1} label`}
                                    maxLength={80}
                                    placeholder="Link label"
                                    value={link.label}
                                    onChange={(event) =>
                                      field(
                                        "links",
                                        draft.form.links.map(
                                          (item, position) =>
                                            position === index
                                              ? {
                                                  ...item,
                                                  label: event.target.value,
                                                }
                                              : item,
                                        ),
                                      )
                                    }
                                  />
                                )}
                                {!linkValid.success && (
                                  <p className="readme-inline-error">
                                    Add a label and a complete http:// or
                                    https:// URL.
                                  </p>
                                )}
                              </div>
                            );
                          })}
                          <button
                            type="button"
                            className="ws-button ws-button-small"
                            disabled={draft.form.links.length >= 10}
                            onClick={() =>
                              field("links", [
                                ...draft.form.links,
                                { label: "Website", url: "" },
                              ])
                            }
                          >
                            ＋ Add another link
                          </button>
                        </div>
                      )}
                      {(draft.form.template === "temp-02" ||
                        (basic &&
                          draft.form.sections.includes("projects"))) && (
                        <details className="readme-disclosure">
                          <summary>
                            Featured projects <span aria-hidden="true">⌄</span>
                          </summary>
                          <div className="readme-disclosure-content">
                            <p className="readme-muted">
                              Choose up to 12 public repositories.
                            </p>
                            <button
                              type="button"
                              className="ws-button"
                              disabled={!moreProjects || busy}
                              onClick={() => void loadProjects()}
                            >
                              {projectPage
                                ? "Load more repositories"
                                : "Load my repositories"}
                            </button>
                            {projectPage > 0 && !projects.length && (
                              <p>No public repositories found.</p>
                            )}
                            <div className="readme-project-list">
                              {projects.map((project) => {
                                const checked = draft.form.projects.some(
                                  (item) => item.url === project.url,
                                );
                                return (
                                  <label
                                    key={project.url}
                                    className="readme-checkbox"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={
                                        !checked &&
                                        draft.form.projects.length >= 12
                                      }
                                      onChange={(event) =>
                                        field(
                                          "projects",
                                          event.target.checked
                                            ? [...draft.form.projects, project]
                                            : draft.form.projects.filter(
                                                (item) =>
                                                  item.url !== project.url,
                                              ),
                                        )
                                      }
                                    />
                                    <span>{project.name}</span>
                                  </label>
                                );
                              })}
                            </div>
                            {draft.form.projects.map((project, index) => (
                              <div
                                className="readme-project-selected"
                                key={project.url}
                              >
                                <div>
                                  <strong>{project.name}</strong>
                                  <button
                                    type="button"
                                    className="ws-text-button"
                                    onClick={() =>
                                      field(
                                        "projects",
                                        draft.form.projects.filter(
                                          (_, position) => position !== index,
                                        ),
                                      )
                                    }
                                  >
                                    Remove
                                  </button>
                                </div>
                                {basic ? (
                                  <label className="ws-field">
                                    Description
                                    <input
                                      className="ws-input"
                                      maxLength={500}
                                      value={project.description}
                                      onChange={(event) =>
                                        field(
                                          "projects",
                                          draft.form.projects.map(
                                            (item, position) =>
                                              position === index
                                                ? {
                                                    ...item,
                                                    description:
                                                      event.target.value,
                                                  }
                                                : item,
                                          ),
                                        )
                                      }
                                    />
                                  </label>
                                ) : (
                                  <p className="readme-muted">
                                    This template uses a live repository card.
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                      {basic && (
                        <details className="readme-disclosure">
                          <summary>
                            Sections and order <span aria-hidden="true">⌄</span>
                          </summary>
                          <div className="readme-disclosure-content">
                            {(
                              [
                                "introduction",
                                "skills",
                                "projects",
                                "links",
                              ] as ReadmeSection[]
                            ).map((key) => (
                              <label className="readme-checkbox" key={key}>
                                <input
                                  type="checkbox"
                                  checked={draft.form.sections.includes(key)}
                                  onChange={(event) =>
                                    field(
                                      "sections",
                                      event.target.checked
                                        ? [...draft.form.sections, key]
                                        : draft.form.sections.filter(
                                            (item) => item !== key,
                                          ),
                                    )
                                  }
                                />
                                {sectionLabels[key]}
                              </label>
                            ))}
                            <div className="readme-section-order">
                              {draft.form.sections.map((key, index) => (
                                <div key={key}>
                                  <span>{sectionLabels[key]}</span>
                                  <button
                                    type="button"
                                    className="ws-button ws-button-small"
                                    aria-label={`Move ${sectionLabels[key]} up`}
                                    disabled={index === 0}
                                    onClick={() => reorder(index, -1)}
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    className="ws-button ws-button-small"
                                    aria-label={`Move ${sectionLabels[key]} down`}
                                    disabled={
                                      index === draft.form.sections.length - 1
                                    }
                                    onClick={() => reorder(index, 1)}
                                  >
                                    ↓
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </details>
                      )}
                      <div className="readme-email">
                        <label className="readme-checkbox">
                          <input
                            type="checkbox"
                            checked={draft.form.showEmail}
                            onChange={(event) =>
                              field("showEmail", event.target.checked)
                            }
                          />
                          Include my email publicly
                        </label>
                        <p>
                          Your email stays out unless you choose to include it.
                        </p>
                        {draft.form.showEmail && (
                          <label className="ws-field">
                            Public contact email
                            <input
                              className="ws-input"
                              type="email"
                              maxLength={254}
                              placeholder="you@example.com"
                              value={draft.form.contactEmail}
                              onChange={(event) =>
                                field("contactEmail", event.target.value)
                              }
                            />
                          </label>
                        )}
                      </div>
                      {parsed && !parsed.success && (
                        <p role="alert" className="readme-inline-error">
                          {parsed.error.issues[0]?.path[0] === "links"
                            ? "Complete your profile links before publishing."
                            : parsed.error.issues[0]?.message}
                        </p>
                      )}
                      {draft.form.showEmail &&
                        !draft.form.contactEmail.trim() && (
                          <p role="alert" className="readme-inline-error">
                            Enter the email address you want to include
                            publicly.
                          </p>
                        )}
                      <div className="readme-switch-hint">
                        Prefer editing code?{" "}
                        <button type="button" onClick={markdown}>
                          Switch to Markdown.
                        </button>
                      </div>
                    </fieldset>
                  ) : (
                    <div className="readme-source">
                      <div>
                        <span>README.md</span>
                        <span>{(bytes / 1000).toFixed(1)} KB / 100 KB</span>
                      </div>
                      <label className="ws-sr-only" htmlFor="readme-markdown">
                        README Markdown
                      </label>
                      <textarea
                        ref={source}
                        id="readme-markdown"
                        spellCheck={false}
                        disabled={busy}
                        value={draft.raw}
                        onChange={(event) =>
                          update({ ...draft, raw: event.target.value })
                        }
                        placeholder="# Hi, I’m…"
                      />
                      <p>
                        Markdown and supported HTML. Preview updates as you
                        type.
                      </p>
                      {!contentResult.success && (
                        <p className="readme-inline-error" role="alert">
                          README must be smaller than 100 KB.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="workspace-panel readme-preview-panel">
                  <div className="readme-panel-heading">
                    <div>
                      <h2>Live preview</h2>
                      <p>Updates as you edit</p>
                    </div>
                    <div
                      className="readme-devices"
                      role="group"
                      aria-label="Preview width"
                    >
                      <button
                        type="button"
                        className="ws-button"
                        aria-label="Desktop preview"
                        aria-pressed={previewSize === "desktop"}
                        onClick={() => setPreviewSize("desktop")}
                      >
                        <ReadmeIcon kind="desktop" />
                      </button>
                      <button
                        type="button"
                        className="ws-button"
                        aria-label="Mobile preview"
                        aria-pressed={previewSize === "mobile"}
                        onClick={() => setPreviewSize("mobile")}
                      >
                        <ReadmeIcon kind="mobile" />
                      </button>
                    </div>
                  </div>
                  <div
                    className={`readme-preview-document ${previewSize === "mobile" ? "is-mobile" : ""}`}
                  >
                    <div className="readme-filename">
                      <WorkspaceIcon name="readme" />
                      <span>README.md</span>
                      <button
                        type="button"
                        aria-label="Edit README Markdown"
                        disabled={busy}
                        onClick={markdown}
                      >
                        <ReadmeIcon kind="edit" />
                      </button>
                    </div>
                    <div className="readme-preview-body">
                      {content.trim() ? (
                        <ReadmePreview
                          content={content}
                          owner={profile.owner}
                          branch={profile.branch}
                        />
                      ) : (
                        <p className="readme-empty">
                          Your README preview will appear here as you write.
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="readme-preview-note">
                    GitHub may render some HTML differently. External images and
                    widgets depend on their providers.
                  </p>
                </div>
              </div>
              <div className="readme-publish-bar">
                <div className="readme-publish-status">
                  <span className={changed ? "is-draft" : "is-saved"} />
                  <div>
                    <strong>
                      {busy
                        ? "Working…"
                        : changed
                          ? "Draft — not published to GitHub"
                          : "README is up to date"}
                    </strong>
                    <p>
                      {changed
                        ? "Review your README before publishing."
                        : "No unpublished changes."}
                    </p>
                  </div>
                </div>
                <div className="readme-publish-action">
                  <button
                    type="button"
                    className="ws-button ws-button-primary"
                    disabled={busy || !canPublish}
                    onClick={() => {
                      setCreatePublic(false);
                      setModal("review");
                    }}
                  >
                    Review &amp; publish README{" "}
                    <span aria-hidden="true">→</span>
                  </button>
                  <p>
                    {profile.repositoryId
                      ? `Publishing updates ${profile.path} in ${profile.owner}/${profile.owner}.`
                      : `Publishing creates the public repository ${profile.owner}/${profile.owner}.`}
                  </p>
                </div>
              </div>
            </>
          )}
          {modal === "templates" && (
            <WorkspaceDialog
              title="Choose a template"
              wide
              busy={busy}
              onClose={() => setModal(null)}
            >
              <p className="readme-muted">
                Your saved details stay available when you change templates.
                Each choice creates an editable copy.
              </p>
              <div className="readme-template-gallery">
                {templates.map((template) => (
                  <button
                    type="button"
                    className={`readme-template-option ${selectedTemplate === template.id ? "is-selected" : ""}`}
                    key={template.id}
                    aria-pressed={selectedTemplate === template.id}
                    onClick={() => setSelectedTemplate(template.id)}
                  >
                    <div className="readme-gallery-thumb" aria-hidden="true">
                      <strong>{template.title}</strong>
                      <i />
                      <i />
                      <div>
                        <b />
                        <b />
                        <b />
                      </div>
                    </div>
                    <strong>{template.title}</strong>
                    <p>{template.style}</p>
                  </button>
                ))}
              </div>
              <details className="readme-template-inspect">
                <summary>Preview selected template</summary>
                <div className="readme-preview-body">
                  <ReadmePreview
                    content={generate(
                      readmeFormSchema.parse({
                        ...draft.form,
                        template: selectedTemplate,
                        links: draft.form.links.filter(
                          (link) =>
                            readmeFormSchema.shape.links.element.safeParse(link)
                              .success,
                        ),
                        contactEmail: "",
                        showEmail: false,
                      }),
                      profile.owner,
                    )}
                    owner={profile.owner}
                    branch={profile.branch}
                  />
                </div>
              </details>
              <div className="ws-dialog-actions">
                <button
                  type="button"
                  className="ws-button"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ws-button ws-button-primary"
                  onClick={applyTemplate}
                >
                  Use template
                </button>
              </div>
            </WorkspaceDialog>
          )}
          {modal === "import" && (
            <ReadmeImport
              owner={profile.owner}
              name={draft.form.name || profile.name}
              onClose={() => setModal(null)}
              onImport={(text) =>
                replace(
                  "Importing will replace your current draft with this Markdown.",
                  () => {
                    update({ ...draft, mode: "raw", raw: text });
                    setModal(null);
                  },
                )
              }
            />
          )}
          {modal === "history" && (
            <WorkspaceDialog
              title="Version history"
              wide
              busy={busy}
              onClose={() => {
                setModal(null);
                setRevision(null);
              }}
            >
              <p className="readme-muted">
                Load a version into your draft, then review and publish.
                Publishing creates a new commit.
              </p>
              {error && (
                <p className="ws-error" role="alert">
                  {error}
                </p>
              )}
              <div className="readme-history-layout">
                <div className="readme-revisions">
                  {revisions.map((item) => (
                    <article key={item.sha}>
                      <strong>{item.message}</strong>
                      <p>
                        {item.date?.slice(0, 10) ?? "Date unavailable"} ·{" "}
                        {item.sha.slice(0, 7)}
                      </p>
                      <button
                        type="button"
                        className="ws-button ws-button-small"
                        disabled={busy}
                        onClick={() => void loadRevision(item.sha)}
                      >
                        Preview version
                      </button>
                    </article>
                  ))}
                  {historyPage > 0 && !revisions.length && (
                    <p>No README history yet.</p>
                  )}
                  <button
                    type="button"
                    className="ws-button"
                    disabled={busy || !moreHistory}
                    onClick={() => void history()}
                  >
                    {busy
                      ? "Loading…"
                      : historyPage
                        ? "Load older versions"
                        : "Load version history"}
                  </button>
                </div>
                <div>
                  {revision ? (
                    <>
                      <h3>Version {revision.sha.slice(0, 7)}</h3>
                      <div className="readme-revision-preview">
                        <ReadmePreview
                          content={revision.content}
                          owner={profile.owner}
                          branch={revision.sha}
                        />
                      </div>
                      <button
                        type="button"
                        className="ws-button ws-button-primary"
                        disabled={busy}
                        onClick={() =>
                          replace(
                            "Loading this version will replace your current draft. GitHub will not change until you publish.",
                            () => {
                              update({
                                ...draft,
                                mode: "raw",
                                raw: revision.content,
                              });
                              setModal(null);
                              setRevision(null);
                            },
                          )
                        }
                      >
                        Load into draft
                      </button>
                    </>
                  ) : (
                    <p className="readme-empty">
                      Select a version to preview it here.
                    </p>
                  )}
                </div>
              </div>
            </WorkspaceDialog>
          )}
          {modal === "review" && (
            <WorkspaceDialog
              title="Review before publishing"
              wide
              busy={busy}
              onClose={() => setModal(null)}
            >
              <p className="readme-muted">
                Destination:{" "}
                <strong>
                  {profile.owner}/{profile.owner}
                </strong>{" "}
                · {profile.path}
              </p>
              <div className="readme-review-columns">
                <div>
                  <h3>Current on GitHub</h3>
                  <pre>{profile.content || "No README yet."}</pre>
                </div>
                <div>
                  <h3>Your draft</h3>
                  <pre>{content}</pre>
                </div>
              </div>
              {profile.sha && (
                <button
                  type="button"
                  className="ws-button"
                  disabled={busy}
                  onClick={() =>
                    download(
                      profile.content,
                      `${profile.owner}-README-backup.md`,
                    )
                  }
                >
                  Download current README backup
                </button>
              )}
              {!profile.repositoryId && (
                <label className="readme-checkbox readme-public-confirm">
                  <input
                    type="checkbox"
                    checked={createPublic}
                    disabled={busy}
                    onChange={(event) => setCreatePublic(event.target.checked)}
                  />
                  Create the public repository {profile.owner}/{profile.owner}.
                  This README will be visible on my GitHub profile.
                </label>
              )}
              <div className="ws-dialog-actions">
                <button
                  type="button"
                  className="ws-button"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  className="ws-button ws-button-primary"
                  disabled={
                    busy ||
                    !canPublish ||
                    (!profile.repositoryId && !createPublic)
                  }
                  onClick={() => void publish()}
                >
                  {busy
                    ? "Publishing and verifying…"
                    : "Confirm & publish README"}
                </button>
              </div>
            </WorkspaceDialog>
          )}
        </>
      )}
      {replacement && (
        <WorkspaceDialog
          title="Replace current draft?"
          onClose={() => setReplacement(null)}
        >
          <p className="readme-muted">{replacement.message}</p>
          <div className="ws-dialog-actions">
            <button
              type="button"
              className="ws-button"
              onClick={() => setReplacement(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ws-button ws-button-primary"
              onClick={() => {
                replacement.apply();
                setReplacement(null);
              }}
            >
              Continue
            </button>
          </div>
        </WorkspaceDialog>
      )}
    </section>
  );
}

export function ReadmeIcon({
  kind,
}: {
  kind:
    "upload" | "history" | "code" | "desktop" | "mobile" | "edit" | "github";
}) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "upload" && (
        <>
          <path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" />
        </>
      )}
      {kind === "history" && (
        <>
          <path d="M3 5v5h5M3 10a9 9 0 1 1 2 8M12 7v5l3 2" />
        </>
      )}
      {kind === "code" && <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" />}
      {kind === "desktop" && (
        <>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </>
      )}
      {kind === "mobile" && (
        <>
          <rect x="6" y="2" width="12" height="20" rx="2" />
          <path d="M11 18h2" />
        </>
      )}
      {kind === "edit" && (
        <>
          <path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 15Z" />
        </>
      )}
      {kind === "github" && (
        <>
          <path d="M9 19c-4 1-4-2-6-2m12 5v-4a3 3 0 0 0-1-2c4-.4 7-2 7-6a5 5 0 0 0-1.5-3.5 5 5 0 0 0-.1-3.5S18 3 15 4a13 13 0 0 0-6 0C6 3 4.6 3 4.6 3a5 5 0 0 0-.1 3.5A5 5 0 0 0 3 10c0 4 3 5.6 7 6a3 3 0 0 0-1 2v4" />
        </>
      )}
    </svg>
  );
}
