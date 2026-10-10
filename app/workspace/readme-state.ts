import {
  readmeFormSchema,
  readmeDraftFormSchema,
  readmeContentSchema,
  type ProfileReadme,
  type ReadmeForm,
} from "@/lib/profile-readme-schema";
import type { GitHubProfile } from "@/lib/github-profile-schema";
export type Draft = { mode: "form" | "raw"; raw: string; form: ReadmeForm };
export type ProfileHandoff = { profile: GitHubProfile; skills: string } | null;
const sections: ReadmeForm["sections"] = [
  "introduction",
  "skills",
  "projects",
  "links",
];
export function starter(
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
export function draftKey(owner: string) {
  return `git-forge-readme-draft:${owner}`;
}
export function recoverDraft(
  profile: ProfileReadme,
  handoff: ProfileHandoff = null,
) {
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
export async function request(resource: string, options?: RequestInit) {
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
export function download(content: string, filename: string) {
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
