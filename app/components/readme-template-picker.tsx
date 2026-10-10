"use client";

import {
  selectableTemplates,
  type SelectableTemplateId,
} from "@/lib/profile-readme-templates";
import type { ProfileReadme, ReadmeForm } from "@/lib/profile-readme-schema";

const fieldClass =
  "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-emerald-700";
const buttonClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50";

export function ReadmeTemplatePicker({
  profile,
  form,
  hasExistingReadme,
  view,
  onTemplate,
  onExisting,
  onNext,
  onEditShared,
  onChange,
  onLoadProjects,
  projects,
  projectsLoaded,
  projectsBusy,
}: {
  profile: ProfileReadme;
  form: ReadmeForm;
  hasExistingReadme: boolean;
  view: "shared" | "cards" | "selected";
  onTemplate: (template: SelectableTemplateId) => void;
  onExisting: () => void;
  onNext: () => void;
  onEditShared: () => void;
  onChange: <K extends keyof ReadmeForm>(key: K, value: ReadmeForm[K]) => void;
  onLoadProjects: () => void;
  projects: { name: string; description: string; url: string }[];
  projectsLoaded: boolean;
  projectsBusy: boolean;
}) {
  if (view === "cards")
    return (
      <section className="mt-6">
        <h3 className="text-lg font-semibold">Select a README template</h3>
        <p className="mt-1 text-sm text-zinc-600">
          Your GitHub details are prefilled where available. Each choice creates
          an editable copy for your profile.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {hasExistingReadme && (
            <button
              type="button"
              className="rounded-xl border-2 border-emerald-700 bg-emerald-50 p-4 text-left hover:bg-emerald-100"
              onClick={onExisting}
            >
              <span className="font-semibold">Your current README</span>
              <span className="mt-2 block text-sm text-zinc-600">
                Start from your current GitHub profile README and edit its copy.
              </span>
            </button>
          )}
          {selectableTemplates.map((template, index) => (
            <article
              key={template.id}
              className="rounded-xl border border-zinc-200 p-4 hover:border-emerald-700 hover:bg-emerald-50"
            >
              <button
                type="button"
                className="block w-full text-left focus-visible:outline-2 focus-visible:outline-emerald-700"
                onClick={() => onTemplate(template.id)}
              >
                <span className="flex items-center justify-between gap-2 font-semibold">
                  <span>{template.title}</span>
                  <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
                    {index + 1} / 5
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="mt-3 flex h-14 items-center gap-2 overflow-hidden rounded-md bg-zinc-50 px-3 py-2"
                >
                  {index === 0 && (
                    <>
                      <span className="text-sm font-bold">
                        Hi, I&apos;m you!
                      </span>
                      <span className="ml-auto text-xl">👋</span>
                    </>
                  )}
                  {index === 1 && (
                    <>
                      <span className="flex gap-1">
                        <i className="h-6 w-6 rounded bg-sky-500" />
                        <i className="h-6 w-6 rounded bg-violet-500" />
                        <i className="h-6 w-6 rounded bg-green-600" />
                      </span>
                      <span className="text-xs">stats · projects · skills</span>
                    </>
                  )}
                  {index === 2 && (
                    <>
                      <span className="text-lg font-bold">Hello</span>
                      <span className="h-2 flex-1 rounded bg-emerald-300" />
                      <span className="h-5 w-5 rounded-full bg-zinc-300" />
                    </>
                  )}
                  {index === 3 && (
                    <>
                      <span className="grid grid-cols-4 gap-1">
                        {Array.from({ length: 8 }, (_, cell) => (
                          <i
                            key={cell}
                            className={`h-3 w-3 rounded-sm ${cell % 3 === 0 ? "bg-emerald-600" : "bg-emerald-200"}`}
                          />
                        ))}
                      </span>
                      <span className="text-xs">skills · GitHub stats</span>
                    </>
                  )}
                  {index === 4 && (
                    <>
                      <span className="text-sm font-bold"># About me</span>
                      <span className="h-2 flex-1 rounded bg-zinc-300" />
                      <span className="h-2 w-8 rounded bg-zinc-200" />
                    </>
                  )}
                </span>
                <span className="mt-2 block text-sm text-zinc-600">
                  {template.style}
                </span>
              </button>
              <a
                className="mt-3 inline-block text-xs underline underline-offset-2"
                href={template.source}
                target="_blank"
                rel="noopener noreferrer"
              >
                View source profile ↗
              </a>
            </article>
          ))}
        </div>
      </section>
    );

  type OptionalField =
    | "education"
    | "company"
    | "interests"
    | "architecture"
    | "tools"
    | "communities"
    | "challenge"
    | "location"
    | "workAreas"
    | "focus";
  const details: Record<SelectableTemplateId, OptionalField[]> = {
    "temp-01": [
      "company",
      "education",
      "interests",
      "architecture",
      "tools",
      "communities",
      "challenge",
    ],
    "temp-02": ["company", "interests"],
    "temp-03": ["company", "education"],
    "temp-04": ["education", "location"],
    "temp-05": [
      "company",
      "location",
      "interests",
      "workAreas",
      "focus",
      "challenge",
    ],
  };
  const labels: Record<string, string> = {
    company: "Company / organization (prefilled where available)",
    education: "Education (optional)",
    interests: "About me / interests (optional)",
    architecture: "Architecture / areas of expertise (optional)",
    tools: "Tools and frameworks (optional)",
    communities: "Communities, mentoring or speaking (optional)",
    challenge: "Current challenge or closing quote (optional)",
    location: "Location (optional)",
    workAreas: "What I build (optional)",
    focus: "Current focus (optional)",
  };
  const activeTemplate = selectableTemplates.find(
    (template) => template.id === form.template,
  );
  const templateId = (activeTemplate?.id ?? "temp-01") as SelectableTemplateId;
  const additional = details[templateId];
  return (
    <section className="mt-6 rounded-xl border border-zinc-200 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">
            {view === "shared"
              ? "Your profile details"
              : (activeTemplate?.title ?? "Your template details")}
          </h3>
          <p className="mt-1 text-sm text-zinc-600">
            {view === "shared"
              ? "Check the GitHub details we filled in, and add anything missing. Then choose a design."
              : "Add only the extra details this design can use. Your shared details stay saved if you switch templates."}
          </p>
        </div>
        {view === "selected" && (
          <span className="flex gap-2">
            <button
              type="button"
              className={buttonClass}
              onClick={onEditShared}
            >
              Edit shared details
            </button>
            <button type="button" className={buttonClass} onClick={onExisting}>
              Choose another template
            </button>
          </span>
        )}
      </div>
      {activeTemplate && (
        <a
          className="mt-2 inline-block text-xs underline"
          href={activeTemplate.source}
          target="_blank"
          rel="noopener noreferrer"
        >
          Template source and original assets ↗
        </a>
      )}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {view === "shared" && (
          <>
            <label className="text-sm">
              Name
              <input
                className={fieldClass}
                maxLength={100}
                value={form.name}
                onChange={(event) => onChange("name", event.target.value)}
              />
            </label>
            <label className="text-sm">
              Headline / role (optional)
              <input
                className={fieldClass}
                maxLength={180}
                placeholder="Backend developer · Building useful tools"
                value={form.headline}
                onChange={(event) => onChange("headline", event.target.value)}
              />
            </label>
            <label className="text-sm md:col-span-2">
              Bio / introduction
              <textarea
                className={fieldClass}
                maxLength={2000}
                rows={3}
                value={form.bio}
                onChange={(event) => onChange("bio", event.target.value)}
              />
            </label>
            <label className="text-sm md:col-span-2">
              Skills and tools (optional, comma-separated)
              <input
                className={fieldClass}
                maxLength={1000}
                placeholder="TypeScript, React, PostgreSQL"
                value={form.skills}
                onChange={(event) => onChange("skills", event.target.value)}
              />
            </label>
          </>
        )}
        {view === "selected" &&
          additional.map((key) => (
            <label className="text-sm" key={key}>
              {labels[key]}
              {key === "interests" ||
              key === "architecture" ||
              key === "tools" ||
              key === "communities" ||
              key === "workAreas" ||
              key === "focus" ||
              key === "challenge" ? (
                <textarea
                  className={fieldClass}
                  rows={2}
                  maxLength={key === "challenge" ? 300 : 500}
                  value={form[key]}
                  onChange={(event) =>
                    onChange(
                      key as keyof ReadmeForm,
                      event.target.value as never,
                    )
                  }
                />
              ) : (
                <input
                  className={fieldClass}
                  maxLength={240}
                  value={form[key]}
                  onChange={(event) =>
                    onChange(
                      key as keyof ReadmeForm,
                      event.target.value as never,
                    )
                  }
                />
              )}
            </label>
          ))}
        {view === "shared" && (
          <label className="text-sm md:col-span-2">
            Profile links (prefilled from GitHub; you can edit them)
            <span className="mt-2 block space-y-2">
              {form.links.map((link, index) => (
                <span
                  className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]"
                  key={`${index}-${link.label}`}
                >
                  <input
                    aria-label={`Link ${index + 1} label`}
                    className={fieldClass}
                    maxLength={80}
                    value={link.label}
                    onChange={(event) =>
                      onChange(
                        "links",
                        form.links.map((item, position) =>
                          position === index
                            ? { ...item, label: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <input
                    aria-label={`Link ${index + 1} URL`}
                    type="url"
                    className={fieldClass}
                    maxLength={2048}
                    placeholder="https://…"
                    value={link.url}
                    onChange={(event) =>
                      onChange(
                        "links",
                        form.links.map((item, position) =>
                          position === index
                            ? { ...item, url: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className={buttonClass}
                    aria-label={`Remove ${link.label || "link"}`}
                    onClick={() =>
                      onChange(
                        "links",
                        form.links.filter((_, position) => position !== index),
                      )
                    }
                  >
                    Remove
                  </button>
                </span>
              ))}
            </span>
            <button
              type="button"
              className={`${buttonClass} mt-2`}
              disabled={form.links.length >= 10}
              onClick={() =>
                onChange("links", [...form.links, { label: "", url: "" }])
              }
            >
              Add profile link
            </button>
          </label>
        )}
        {view === "shared" && (
          <div className="rounded-lg bg-zinc-50 p-3 text-sm md:col-span-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.showEmail}
                onChange={(event) =>
                  onChange("showEmail", event.target.checked)
                }
              />
              I want to show a contact email in my README
            </label>
            {form.showEmail && (
              <input
                aria-label="Public contact email"
                type="email"
                className={fieldClass}
                maxLength={254}
                placeholder="name@example.com"
                value={form.contactEmail}
                onChange={(event) =>
                  onChange("contactEmail", event.target.value)
                }
              />
            )}
            <p className="mt-1 text-xs text-zinc-500">
              Email is never fetched from your private GitHub settings.
            </p>
          </div>
        )}
        {view === "shared" && (
          <button
            type="button"
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white md:col-span-2"
            disabled={
              form.showEmail &&
              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)
            }
            onClick={onNext}
          >
            Continue to template selection
          </button>
        )}
        {view === "selected" && templateId === "temp-02" && (
          <div className="md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                Featured public repositories (optional)
              </p>
              <button
                type="button"
                className={buttonClass}
                disabled={projectsBusy}
                onClick={onLoadProjects}
              >
                {projectsBusy
                  ? "Loading…"
                  : projectsLoaded
                    ? "Refresh repositories"
                    : "Load my repositories"}
              </button>
            </div>
            {projects.map((project) => (
              <label
                key={project.url}
                className="mt-2 flex items-start gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={form.projects.some(
                    (entry) => entry.url === project.url,
                  )}
                  disabled={
                    !form.projects.some((entry) => entry.url === project.url) &&
                    form.projects.length >= 12
                  }
                  onChange={(event) =>
                    onChange(
                      "projects",
                      event.target.checked
                        ? [...form.projects, project]
                        : form.projects.filter(
                            (entry) => entry.url !== project.url,
                          ),
                    )
                  }
                />
                <span>
                  {project.name}
                  {project.description ? (
                    <span className="text-zinc-500">
                      {" "}
                      · {project.description}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
            {projectsLoaded && projects.length === 0 && (
              <p className="mt-2 text-xs text-zinc-500">
                No public repositories found.
              </p>
            )}
          </div>
        )}
      </div>
      <p className="mt-4 text-xs text-zinc-500">
        Only information relevant to this design is requested. Empty optional
        sections stay out of your generated README. Select another card to keep
        these details and switch layout.
      </p>
      <span className="sr-only">Signed in as {profile.owner}</span>
    </section>
  );
}
