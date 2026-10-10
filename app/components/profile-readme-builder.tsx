"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildProfileReadme,
  readmeFormSchema,
  readmeDraftFormSchema,
  readmeContentSchema,
  sectionLabels,
  type ProfileReadme,
  type ReadmeForm,
  type ReadmeRevision,
  type ReadmeSection,
  type ShowcaseProject,
} from "@/lib/profile-readme-schema";
import { ReadmePreview } from "@/app/components/readme-preview";
import { AuthButton } from "@/app/components/auth-button";
import { CustomReadmeImport } from "@/app/components/custom-readme-import";
import { ReadmeTemplatePicker } from "@/app/components/readme-template-picker";
import type { GitHubProfile } from "@/lib/github-profile-schema";
import {
  buildSelectableTemplate,
  type SelectableTemplateId,
} from "@/lib/profile-readme-templates";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";
const buttonClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium disabled:opacity-50";
const sections: ReadmeSection[] = [
  "introduction",
  "skills",
  "projects",
  "links",
];
type Draft = { mode: "form" | "raw"; raw: string; form: ReadmeForm };
type BuilderPath = "choose" | "details" | "templates" | "template" | "custom";
type ProfileHandoff = { profile: GitHubProfile; skills: string } | null;
function starter(
  profile: ProfileReadme,
  handoff: ProfileHandoff = null,
): ReadmeForm {
  const saved = handoff?.profile.username === profile.owner ? handoff : null;
  const links: ReadmeForm["links"] = [];
  for (const url of [
    saved?.profile.values.website ?? "",
    ...(saved?.profile.values.socials ?? []),
  ]) {
    if (!url) continue;
    const result = readmeFormSchema.shape.links.element.safeParse({
      label:
        url === saved?.profile.values.website
          ? "Website / portfolio"
          : (() => {
              try {
                return new URL(url).hostname.replace(/^www\./, "");
              } catch {
                return "Social profile";
              }
            })(),
      url,
    });
    if (result.success && !links.some((link) => link.url === result.data.url))
      links.push(result.data);
  }
  return {
    template: "minimal",
    name: saved?.profile.values.name || profile.name,
    headline: "",
    bio: saved?.profile.values.bio ?? profile.bio,
    skills: saved?.skills ?? "",
    projects: [],
    links,
    sections: [...sections],
    role: "",
    company: saved?.profile.values.company ?? "",
    location: saved?.profile.values.location ?? "",
    education: "",
    interests: "",
    architecture: "",
    tools: "",
    communities: "",
    challenge: "",
    focus: "",
    workAreas: "",
    contactEmail: "",
    showEmail: false,
  };
}
function draftKey(owner: string) {
  return `git-forge-readme-draft:${owner}`;
}
function recoverDraft(profile: ProfileReadme, handoff: ProfileHandoff = null) {
  const initial: Draft = {
    mode: profile.sha ? "raw" : "form",
    raw: profile.content,
    form: starter(profile, handoff),
  };
  let restored = false;
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(draftKey(profile.owner)) ?? "null",
    );
    const form = readmeDraftFormSchema.safeParse(saved?.form);
    if (
      saved &&
      (saved.mode === "raw" || saved.mode === "form") &&
      typeof saved.raw === "string" &&
      readmeContentSchema.safeParse(saved.raw).success &&
      form.success
    ) {
      initial.mode = saved.mode;
      initial.raw = saved.raw;
      initial.form = form.data;
      restored = true;
    }
  } catch {
    /* Optional browser draft storage. */
  }
  return { initial, restored };
}
async function request(resource: string, options?: RequestInit) {
  const response = await fetch(`/api/profile-readme${resource}`, {
    ...options,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(data.message ?? "Could not complete this request."),
      { code: data.code },
    );
  return data;
}
function download(content: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/markdown;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ProfileReadmeBuilder({
  handoff = null,
}: {
  handoff?: ProfileHandoff;
}) {
  const [profile, setProfile] = useState<ProfileReadme | null>(null);
  const [profileContext, setProfileContext] = useState<ProfileHandoff>(handoff);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reconnect, setReconnect] = useState(false);
  const [review, setReview] = useState(false);
  const [createPublic, setCreatePublic] = useState(false);
  const [builderPath, setBuilderPath] = useState<BuilderPath>("choose");
  const [projects, setProjects] = useState<ShowcaseProject[]>([]);
  const [projectPage, setProjectPage] = useState(0);
  const [moreProjects, setMoreProjects] = useState(true);
  const [revisions, setRevisions] = useState<ReadmeRevision[]>([]);
  const [historyPage, setHistoryPage] = useState(0);
  const [moreHistory, setMoreHistory] = useState(true);
  const running = useRef(false);
  const alive = useRef(true);
  const activeForm = draft
    ? {
        ...draft.form,
        links: draft.form.sections.includes("links") ? draft.form.links : [],
        projects: draft.form.sections.includes("projects")
          ? draft.form.projects
          : [],
      }
    : null;
  const parsed = activeForm ? readmeFormSchema.safeParse(activeForm) : null;
  // An unfinished link should not blank the rest of the live preview.
  const preview = activeForm
    ? readmeFormSchema.safeParse({
        ...activeForm,
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
        ? preview.data.template.startsWith("temp-")
          ? buildSelectableTemplate(
              preview.data.template as SelectableTemplateId,
              preview.data,
              profile?.owner ?? "",
            )
          : buildProfileReadme(preview.data)
        : "";
  const valid =
    !!content.trim() &&
    readmeContentSchema.safeParse(content).success &&
    (!draft?.form.showEmail || !!draft.form.contactEmail.trim()) &&
    (draft?.mode === "raw" || parsed?.success);
  const changed = !!profile && content !== profile.content;

  function showError(failure: unknown) {
    setError(
      failure instanceof Error
        ? failure.message
        : "Something went wrong. Please retry.",
    );
    const code =
      typeof failure === "object" && failure && "code" in failure
        ? failure.code
        : "";
    setReconnect(code === "SIGN_IN" || code === "REAUTHORIZE");
  }

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    request("", { signal: controller.signal })
      .then(async (data) => {
        if (!alive.current) return;
        const loaded: ProfileReadme = data.profile;
        let profileHandoff = handoff;
        if (!profileHandoff) {
          try {
            const response = await fetch("/api/github-profile", {
              cache: "no-store",
              signal: controller.signal,
            });
            if (response.ok) {
              const profileData = await response.json();
              if (profileData.profile?.username === loaded.owner)
                profileHandoff = { profile: profileData.profile, skills: "" };
            }
          } catch {
            // The profile README API already provides name and bio as a fallback.
          }
        }
        if (!alive.current || controller.signal.aborted) return;
        setProfileContext(profileHandoff);
        const { initial, restored } = recoverDraft(loaded, profileHandoff);
        if (restored) {
          setMessage(
            "Your draft was restored from this tab. Review it against the latest GitHub README before publishing.",
          );
        }
        setProfile(loaded);
        setDraft(initial);
        setBuilderPath(
          restored
            ? initial.mode === "raw"
              ? "custom"
              : "template"
            : "choose",
        );
        setLoading(false);
      })
      .catch((failure) => {
        if (!controller.signal.aborted && alive.current) {
          showError(failure);
          setLoading(false);
        }
      });
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [handoff]);

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
  function update(next: Draft) {
    setDraft(next);
    setReview(false);
    setCreatePublic(false);
    setMessage("");
    setError("");
    // Save edits immediately so navigation/reconnect cannot lose a recent keystroke.
    if (profile)
      try {
        sessionStorage.setItem(draftKey(profile.owner), JSON.stringify(next));
      } catch {
        /* Optional storage. */
      }
  }
  function chooseTemplate(template: SelectableTemplateId) {
    if (!draft) return;
    update({
      ...draft,
      mode: "form",
      form: { ...draft.form, template },
    });
    setBuilderPath("template");
  }
  function chooseExistingReadme() {
    if (!draft || !profile) return;
    update({ ...draft, mode: "raw", raw: profile.content });
    setBuilderPath("custom");
    setMessage(
      "Your current GitHub README is open as an editable personal draft.",
    );
  }
  function chooseCustom() {
    if (!draft || !profile) return;
    update({
      ...draft,
      mode: "raw",
      raw:
        draft.mode === "raw"
          ? draft.raw
          : builderPath === "template"
            ? content
            : profile.content,
    });
    setBuilderPath("custom");
  }
  async function loadFeaturedProjects() {
    await work(async () => {
      const data = await request("?resource=projects&page=1");
      if (!alive.current) return;
      setProjects(data.projects);
      setProjectPage(1);
      setMoreProjects(data.hasMore);
    });
  }
  function field<K extends keyof ReadmeForm>(key: K, value: ReadmeForm[K]) {
    if (draft) update({ ...draft, form: { ...draft.form, [key]: value } });
  }
  function moveSection(index: number, direction: number) {
    if (!draft) return;
    const next = [...draft.form.sections];
    const destination = index + direction;
    if (destination < 0 || destination >= next.length) return;
    [next[index], next[destination]] = [next[destination], next[index]];
    field("sections", next);
  }

  async function reload() {
    await work(async () => {
      const data = await request("");
      setProfile(data.profile);
      setReview(false);
      setCreatePublic(false);
      if (!draft) setDraft(recoverDraft(data.profile, handoff).initial);
      setMessage(
        "Latest README loaded. Your draft was kept; compare both before publishing.",
      );
      setLoading(false);
    });
  }
  async function publish() {
    if (!profile || !valid || !review) return;
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
      setProfile(data.profile);
      setReview(false);
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
          ? "This README is already up to date."
          : "Your profile README was published and verified.",
      );
    });
  }

  if (!profile || !draft)
    return (
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Profile README Builder</h2>
        {loading ? (
          <p role="status" className="mt-4">
            Loading your GitHub README…
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
              Retry import
            </button>
            {reconnect && (
              <div className="mt-3">
                <AuthButton />
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
          <h2 className="text-xl font-semibold">Profile README Builder</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {profile.owner}/{profile.owner} ·{" "}
            {profile.sha
              ? "Existing README imported"
              : "Start your profile README"}
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
      {profile.private && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900"
        >
          Your profile repository is private. GitHub displays profile READMEs
          from public repositories. Change visibility in GitHub settings if you
          want it displayed; this app will not change visibility.
        </p>
      )}
      {!profile.canWrite && (
        <p role="alert" className="mt-4 text-sm text-amber-900">
          This repository is read-only. You can edit and preview a draft, but
          publishing is unavailable.
        </p>
      )}
      {message && (
        <p
          role="status"
          className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}
      {reconnect && (
        <div className="mt-3">
          <AuthButton />
        </div>
      )}
      {builderPath !== "choose" && (
        <div
          className="mt-6 flex flex-wrap gap-2"
          aria-label="README creation options"
        >
          {builderPath !== "templates" && (
            <button
              type="button"
              className={`${buttonClass} ${builderPath === "template" ? "border-emerald-700 bg-emerald-50" : ""}`}
              disabled={busy}
              onClick={() => {
                setBuilderPath("details");
                setReview(false);
              }}
            >
              Select a template
            </button>
          )}
          <button
            type="button"
            className={`${buttonClass} ${builderPath === "custom" ? "border-emerald-700 bg-emerald-50" : ""}`}
            disabled={busy}
            onClick={chooseCustom}
          >
            Custom
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={busy}
            onClick={() => {
              update({
                mode: profile.sha ? "raw" : "form",
                raw: profile.content,
                form: starter(profile, profileContext),
              });
              try {
                sessionStorage.removeItem(draftKey(profile.owner));
              } catch {
                /* Optional storage. */
              }
              setMessage(
                "Draft discarded. The latest imported README is unchanged.",
              );
              setBuilderPath("choose");
            }}
          >
            Discard draft
          </button>
          {profile.sha && builderPath === "custom" && (
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                download(profile.content, `${profile.owner}-README-backup.md`)
              }
            >
              Download original backup
            </button>
          )}
        </div>
      )}
      {builderPath === "choose" && (
        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <button
            type="button"
            className="rounded-xl border border-zinc-200 p-6 text-left hover:border-emerald-700 hover:bg-emerald-50"
            onClick={() => setBuilderPath("details")}
          >
            <span className="text-lg font-semibold">Select a template</span>
            <span className="mt-2 block text-sm text-zinc-600">
              Check your GitHub details once, then choose one of the five
              collected profile designs.
            </span>
          </button>
          <button
            type="button"
            className="rounded-xl border border-zinc-200 p-6 text-left hover:border-emerald-700 hover:bg-emerald-50"
            onClick={chooseCustom}
          >
            <span className="text-lg font-semibold">Custom</span>
            <span className="mt-2 block text-sm text-zinc-600">
              Import a public README, upload or paste Markdown, and edit it
              yourself.
            </span>
          </button>
        </section>
      )}
      {(builderPath === "details" ||
        builderPath === "templates" ||
        builderPath === "template") && (
        <ReadmeTemplatePicker
          profile={profile}
          form={draft.form}
          hasExistingReadme={!!profile.sha}
          view={
            builderPath === "details"
              ? "shared"
              : builderPath === "templates"
                ? "cards"
                : "selected"
          }
          onTemplate={chooseTemplate}
          onExisting={
            builderPath === "template"
              ? () => setBuilderPath("templates")
              : chooseExistingReadme
          }
          onNext={() => setBuilderPath("templates")}
          onEditShared={() => setBuilderPath("details")}
          onChange={(key, value) => field(key, value)}
          onLoadProjects={loadFeaturedProjects}
          projects={projects}
          projectsLoaded={projectPage > 0}
          projectsBusy={busy}
        />
      )}
      {builderPath === "template" && draft.mode === "form" && (
        <button
          type="button"
          className={`${buttonClass} mt-4`}
          disabled={!parsed?.success}
          onClick={() => {
            update({ ...draft, mode: "raw", raw: content });
            setBuilderPath("custom");
          }}
        >
          Edit generated Markdown
        </button>
      )}
      {builderPath === "custom" && (
        <CustomReadmeImport
          owner={profile.owner}
          name={
            profileContext?.profile.values.name || profile.name || profile.owner
          }
          disabled={busy}
          onImport={(raw) => {
            update({ ...draft, mode: "raw", raw });
            setMessage(
              "Custom README loaded into your personal draft. Check your details and preview before publishing.",
            );
          }}
        />
      )}
      {(builderPath === "custom" || builderPath === "template") && (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
          <fieldset
            disabled={busy}
            className="min-w-0 space-y-5 disabled:opacity-70"
          >
            <legend className="mb-3 font-semibold">
              {draft.mode === "raw" ? "Markdown" : "Your content"}
            </legend>
            {draft.mode === "raw" ? (
              <label className="block text-sm">
                README.md
                <textarea
                  value={draft.raw}
                  maxLength={100000}
                  rows={24}
                  spellCheck={false}
                  className={`${inputClass} mt-2 min-h-96 font-mono`}
                  onChange={(event) =>
                    update({ ...draft, raw: event.target.value })
                  }
                />
              </label>
            ) : draft.form.template.startsWith("temp-") ? (
              <div className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600">
                Your README is generated from the selected template and details.
                To edit its Markdown directly, choose <strong>Custom</strong> or
                use the button above. The live preview shows the current output.
              </div>
            ) : draft.form.template.startsWith("temp-") ? (
              <div className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600">
                Your README is generated from the selected template and details.
                To edit its Markdown directly, choose <strong>Custom</strong> or
                use the button above. The live preview shows the current output.
              </div>
            ) : (
              <>
                <label className="block text-sm">
                  Template
                  <select
                    value={draft.form.template}
                    className={`${inputClass} mt-2`}
                    onChange={(event) =>
                      field(
                        "template",
                        event.target.value as ReadmeForm["template"],
                      )
                    }
                  >
                    <option value="minimal">Minimal</option>
                    <option value="professional">Professional</option>
                  </select>
                </label>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Sections</p>
                  {sections.map((section) => (
                    <label
                      key={section}
                      className="mr-3 inline-flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={draft.form.sections.includes(section)}
                        onChange={(event) =>
                          field(
                            "sections",
                            event.target.checked
                              ? [...draft.form.sections, section]
                              : draft.form.sections.filter(
                                  (item) => item !== section,
                                ),
                          )
                        }
                      />
                      {sectionLabels[section]}
                    </label>
                  ))}
                  <ol className="space-y-2">
                    {draft.form.sections.map((section, index) => (
                      <li
                        key={section}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="mr-auto">
                          {index + 1}. {sectionLabels[section]}
                        </span>
                        <button
                          type="button"
                          className={buttonClass}
                          disabled={index === 0}
                          aria-label={`Move ${sectionLabels[section]} up`}
                          onClick={() => moveSection(index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className={buttonClass}
                          disabled={index === draft.form.sections.length - 1}
                          aria-label={`Move ${sectionLabels[section]} down`}
                          onClick={() => moveSection(index, 1)}
                        >
                          ↓
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
                {draft.form.sections.includes("introduction") && (
                  <div className="space-y-4">
                    <label className="block text-sm">
                      Display name
                      <input
                        className={`${inputClass} mt-2`}
                        maxLength={100}
                        value={draft.form.name}
                        onChange={(event) => field("name", event.target.value)}
                      />
                    </label>
                    <label className="block text-sm">
                      Headline
                      <input
                        className={`${inputClass} mt-2`}
                        maxLength={180}
                        placeholder="Full-stack developer · Building useful tools"
                        value={draft.form.headline}
                        onChange={(event) =>
                          field("headline", event.target.value)
                        }
                      />
                    </label>
                    <label className="block text-sm">
                      Short bio
                      <textarea
                        className={`${inputClass} mt-2`}
                        maxLength={2000}
                        rows={4}
                        value={draft.form.bio}
                        onChange={(event) => field("bio", event.target.value)}
                      />
                    </label>
                  </div>
                )}
                {draft.form.sections.includes("skills") && (
                  <label className="block text-sm">
                    Skills, separated by commas
                    <input
                      className={`${inputClass} mt-2`}
                      maxLength={1000}
                      placeholder="TypeScript, React, Next.js"
                      value={draft.form.skills}
                      onChange={(event) => field("skills", event.target.value)}
                    />
                  </label>
                )}
                {draft.form.sections.includes("projects") && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Public projects</p>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={!moreProjects}
                      onClick={() =>
                        work(async () => {
                          const data = await request(
                            `?resource=projects&page=${projectPage + 1}`,
                          );
                          setProjects((current) => [
                            ...current,
                            ...data.projects.filter(
                              (project: ShowcaseProject) =>
                                !current.some(
                                  (entry) => entry.url === project.url,
                                ),
                            ),
                          ]);
                          setProjectPage((page) => page + 1);
                          setMoreProjects(data.hasMore);
                        })
                      }
                    >
                      {projectPage
                        ? "Load more repositories"
                        : "Load my repositories"}
                    </button>
                    {projectPage > 0 && !projects.length && (
                      <p className="text-sm text-zinc-500">
                        No public repositories found.
                      </p>
                    )}
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                      {projects.map((project) => (
                        <label
                          key={project.url}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={draft.form.projects.some(
                              (selected) => selected.url === project.url,
                            )}
                            disabled={
                              !draft.form.projects.some(
                                (selected) => selected.url === project.url,
                              ) && draft.form.projects.length >= 12
                            }
                            onChange={(event) =>
                              field(
                                "projects",
                                event.target.checked
                                  ? [...draft.form.projects, project]
                                  : draft.form.projects.filter(
                                      (item) => item.url !== project.url,
                                    ),
                              )
                            }
                          />
                          {project.name}
                        </label>
                      ))}
                    </div>
                    {draft.form.projects.map((project, index) => (
                      <div
                        key={project.url}
                        className="rounded-lg border border-zinc-200 p-3"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-sm font-medium">
                            {project.name}
                          </span>
                          <button
                            type="button"
                            className="text-xs underline"
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
                        <label className="block text-xs">
                          Description
                          <input
                            className={`${inputClass} mt-1`}
                            maxLength={500}
                            value={project.description}
                            onChange={(event) =>
                              field(
                                "projects",
                                draft.form.projects.map((item, position) =>
                                  position === index
                                    ? {
                                        ...item,
                                        description: event.target.value,
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
                {draft.form.sections.includes("links") && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">
                      Portfolio & social links
                    </p>
                    {draft.form.links.map((link, index) => (
                      <div
                        key={index}
                        className="space-y-2 rounded-lg border border-zinc-200 p-3"
                      >
                        <label className="block text-xs">
                          Label
                          <input
                            className={`${inputClass} mt-1`}
                            maxLength={80}
                            value={link.label}
                            onChange={(event) =>
                              field(
                                "links",
                                draft.form.links.map((item, position) =>
                                  position === index
                                    ? { ...item, label: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                        <label className="block text-xs">
                          URL
                          <input
                            type="url"
                            className={`${inputClass} mt-1`}
                            maxLength={2048}
                            placeholder="https://…"
                            value={link.url}
                            onChange={(event) =>
                              field(
                                "links",
                                draft.form.links.map((item, position) =>
                                  position === index
                                    ? { ...item, url: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="text-xs underline"
                          onClick={() =>
                            field(
                              "links",
                              draft.form.links.filter(
                                (_, position) => position !== index,
                              ),
                            )
                          }
                        >
                          Remove link
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={draft.form.links.length >= 10}
                      onClick={() =>
                        field("links", [
                          ...draft.form.links,
                          { label: "", url: "" },
                        ])
                      }
                    >
                      Add link
                    </button>
                  </div>
                )}
                {parsed && !parsed.success && (
                  <p className="text-sm text-red-700">
                    {parsed.error.issues[0]?.message}
                  </p>
                )}
              </>
            )}
            {!readmeContentSchema.safeParse(content).success && (
              <p className="text-sm text-red-700">
                README must be smaller than 100 KB.
              </p>
            )}
            {draft.mode === "form" &&
              draft.form.showEmail &&
              !draft.form.contactEmail.trim() && (
                <p className="text-sm text-red-700">
                  Enter the contact email you chose to show.
                </p>
              )}
          </fieldset>
          <div className="min-w-0 rounded-xl border border-zinc-200 p-5 lg:sticky lg:top-6">
            <h3 className="mb-5 font-semibold">Live preview</h3>
            <ReadmePreview
              content={content}
              owner={profile.owner}
              branch={profile.branch}
            />
            <p className="mt-5 text-xs text-zinc-500">
              GitHub may render some HTML and styles differently. Unsafe HTML is
              removed from this preview.
            </p>
          </div>
        </div>
      )}
      {builderPath !== "choose" && builderPath !== "templates" && (
        <>
          <div className="mt-8 border-t border-zinc-200 pt-6">
            <button
              type="button"
              className="rounded-lg bg-emerald-700 px-5 py-3 font-medium text-white disabled:opacity-50"
              disabled={
                busy ||
                !valid ||
                !changed ||
                profile.private ||
                !profile.canWrite
              }
              onClick={() => {
                setReview(true);
                setCreatePublic(false);
              }}
            >
              Review changes
            </button>
            {!changed && (
              <span className="ml-3 text-sm text-zinc-500">
                No unpublished changes.
              </span>
            )}
            {review && (
              <div className="mt-5 space-y-4 rounded-xl border border-zinc-200 p-5">
                <h3 className="font-semibold">Review before publishing</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="mb-2 text-sm font-medium">
                      Current on GitHub
                    </h4>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-xs">
                      {profile.content || "No README yet."}
                    </pre>
                  </div>
                  <div>
                    <h4 className="mb-2 text-sm font-medium">Your draft</h4>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-emerald-50 p-3 text-xs">
                      {content}
                    </pre>
                  </div>
                </div>
                {profile.sha && (
                  <button
                    type="button"
                    className={buttonClass}
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
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={createPublic}
                      disabled={busy}
                      onChange={(event) =>
                        setCreatePublic(event.target.checked)
                      }
                    />
                    Create the public repository {profile.owner}/{profile.owner}
                    . This README will be visible on my GitHub profile.
                  </label>
                )}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busy || (!profile.repositoryId && !createPublic)}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    onClick={publish}
                  >
                    {busy ? "Publishing…" : "Publish reviewed README"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={buttonClass}
                    onClick={() => setReview(false)}
                  >
                    Keep editing
                  </button>
                </div>
              </div>
            )}
            {profile.sha && (
              <p className="mt-4 flex flex-wrap gap-4 text-sm">
                <a
                  className="underline underline-offset-4"
                  href={`https://github.com/${profile.owner}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View GitHub profile
                </a>
                <a
                  className="underline underline-offset-4"
                  href={`https://github.com/${profile.owner}/${profile.owner}/blob/${encodeURIComponent(profile.branch ?? "main")}/${profile.path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View README
                </a>
              </p>
            )}
          </div>
          <details className="mt-8 rounded-xl border border-zinc-200 p-5">
            <summary className="cursor-pointer font-medium">
              Previous README versions
            </summary>
            <p className="mt-3 text-sm text-zinc-600">
              Load a version into your draft, preview it, then review and
              publish. Restoring creates a new commit.
            </p>
            <button
              type="button"
              className={`${buttonClass} mt-3`}
              disabled={busy || !moreHistory}
              onClick={() =>
                work(async () => {
                  const data = await request(
                    `?resource=history&page=${historyPage + 1}`,
                  );
                  setRevisions((current) => [
                    ...current,
                    ...data.revisions.filter(
                      (revision: ReadmeRevision) =>
                        !current.some((entry) => entry.sha === revision.sha),
                    ),
                  ]);
                  setHistoryPage((page) => page + 1);
                  setMoreHistory(data.hasMore);
                })
              }
            >
              {historyPage ? "Load older versions" : "Load version history"}
            </button>
            {historyPage > 0 && !revisions.length && (
              <p className="mt-3 text-sm text-zinc-500">
                No README history yet.
              </p>
            )}
            <ul className="mt-4 space-y-3">
              {revisions.map((revision) => (
                <li
                  key={revision.sha}
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3"
                >
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">
                      {revision.message}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {revision.sha.slice(0, 7)} ·{" "}
                      {revision.date?.slice(0, 10) ?? "Date unavailable"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy}
                    onClick={() =>
                      work(async () => {
                        const data = await request(
                          `?resource=revision&sha=${revision.sha}`,
                        );
                        update({ ...draft, mode: "raw", raw: data.content });
                        setMessage(
                          `Version ${revision.sha.slice(0, 7)} loaded into your draft. Review it before publishing.`,
                        );
                      })
                    }
                  >
                    Load into draft
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
