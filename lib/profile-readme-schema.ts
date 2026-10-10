import { z } from "zod";

export const MAX_README_BYTES = 100_000;
export const readmeContentSchema = z
  .string()
  .max(MAX_README_BYTES)
  .refine(
    (value) => new TextEncoder().encode(value).length <= MAX_README_BYTES,
    "README must be smaller than 100 KB.",
  );
export const readmePublishSchema = z
  .object({
    content: readmeContentSchema.refine(
      (value) => value.trim().length > 0,
      "README cannot be empty.",
    ),
    expected: z
      .object({
        repositoryId: z.number().int().positive().nullable(),
        branch: z.string().min(1).max(255).nullable(),
        path: z.string().regex(/^readme\.md$/i),
        sha: z
          .string()
          .regex(/^[0-9a-f]{40}$/)
          .nullable(),
      })
      .strict(),
    createPublic: z.boolean(),
  })
  .strict();

export type ProfileReadme = {
  owner: string;
  name: string;
  bio: string;
  repositoryId: number | null;
  branch: string | null;
  path: string;
  sha: string | null;
  content: string;
  private: boolean;
  canWrite: boolean;
};
export type ShowcaseProject = {
  name: string;
  description: string;
  url: string;
};
export type ReadmeRevision = {
  sha: string;
  message: string;
  date: string | null;
};
export type ReadmeSection = "introduction" | "skills" | "projects" | "links";
export const sectionLabels: Record<ReadmeSection, string> = {
  introduction: "Introduction",
  skills: "Skills",
  projects: "Projects",
  links: "Links",
};

const text = (max: number) => z.string().trim().max(max);
const webLink = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ["https:", "http:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "Use a valid http:// or https:// link.");
export const readmeFormSchema = z.object({
  template: z.enum([
    "minimal",
    "professional",
    "temp-01",
    "temp-02",
    "temp-03",
    "temp-04",
    "temp-05",
  ]),
  name: text(100),
  headline: text(180),
  bio: text(2000),
  skills: text(1000),
  projects: z
    .array(z.object({ name: text(100), description: text(500), url: webLink }))
    .max(12),
  links: z.array(z.object({ label: text(80).min(1), url: webLink })).max(10),
  sections: z
    .array(z.enum(["introduction", "skills", "projects", "links"]))
    .max(4)
    .refine(
      (items) => new Set(items).size === items.length,
      "Sections cannot repeat.",
    ),
  role: text(160).default(""),
  company: text(160).default(""),
  location: text(120).default(""),
  education: text(240).default(""),
  interests: text(500).default(""),
  architecture: text(500).default(""),
  tools: text(500).default(""),
  communities: text(500).default(""),
  challenge: text(300).default(""),
  focus: text(500).default(""),
  workAreas: text(500).default(""),
  contactEmail: z
    .string()
    .trim()
    .max(254)
    .refine(
      (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      "Enter a valid email address.",
    )
    .default(""),
  showEmail: z.boolean().default(false),
});
export type ReadmeForm = z.infer<typeof readmeFormSchema>;
// In-progress links can be incomplete; draft recovery must not discard them.
export const readmeDraftFormSchema = readmeFormSchema.extend({
  contactEmail: z.string().max(254).default(""),
  links: z
    .array(z.object({ label: z.string().max(80), url: z.string().max(2048) }))
    .max(10),
});

function escapeMarkdown(value: string) {
  return value
    .replace(/[\\`*_{}\[\]()#+.!|>~-]/g, "\\$&")
    .replace(/</g, "&lt;")
    .replace(/&(?!(?:lt);)/g, "&amp;");
}
function markdownLink(label: string, url: string) {
  // Percent-encode Markdown delimiters; URLs are validated before rendering.
  const safe = new URL(url).href.replace(
    /[()<>\\]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `[${escapeMarkdown(label)}](${safe})`;
}
export function buildProfileReadme(value: ReadmeForm) {
  const form = readmeFormSchema.parse(value);
  const heading = form.template === "professional";
  const blocks: Record<ReadmeSection, string> = {
    introduction: [
      form.name
        ? `# ${heading ? "" : "Hi, I'm "}${escapeMarkdown(form.name)}`
        : "",
      form.headline ? `**${escapeMarkdown(form.headline)}**` : "",
      escapeMarkdown(form.bio),
    ]
      .filter(Boolean)
      .join("\n\n"),
    skills: form.skills.trim()
      ? `${heading ? "## Technical skills" : "## Skills"}\n\n${form.skills
          .split(",")
          .map((skill) => skill.trim())
          .filter(Boolean)
          .map(escapeMarkdown)
          .join(" · ")}`
      : "",
    projects: form.projects.length
      ? `## ${heading ? "Selected projects" : "Projects"}\n\n${form.projects.map((project) => `- ${markdownLink(project.name, project.url)}${project.description ? ` — ${escapeMarkdown(project.description)}` : ""}`).join("\n")}`
      : "",
    links: form.links.length
      ? `## ${heading ? "Connect" : "Find me online"}\n\n${form.links.map((link) => `- ${markdownLink(link.label, link.url)}`).join("\n")}`
      : "",
  };
  return (
    form.sections
      .map((section) => blocks[section])
      .filter(Boolean)
      .join("\n\n") + "\n"
  );
}
