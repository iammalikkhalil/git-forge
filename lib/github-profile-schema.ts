import { z } from "zod";

export const profileFields = [
  "name",
  "bio",
  "website",
  "location",
  "company",
  "hireable",
  "socials",
] as const;
export type ProfileField = (typeof profileFields)[number];
export const profileLabels: Record<ProfileField, string> = {
  name: "Display name",
  bio: "Bio",
  website: "Website / portfolio",
  location: "Location",
  company: "Company / organization",
  hireable: "Available for hire",
  socials: "Social links",
};
const singleLine = (length: number) =>
  z
    .string()
    .trim()
    .max(length)
    .regex(
      /^[^\u0000-\u001f\u007f]*$/,
      "Use a single line without control characters.",
    );
export const profileUrl = z
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
  }, "Use a full http:// or https:// URL.");
export function socialKey(value: string) {
  try {
    return new URL(value).href.replace(/\/$/, "");
  } catch {
    return value.trim();
  }
}
export const profileValuesSchema = z
  .object({
    name: singleLine(100),
    bio: singleLine(160),
    website: z.union([z.literal(""), profileUrl]),
    location: singleLine(100),
    company: singleLine(100),
    hireable: z.boolean(),
    socials: z
      .array(profileUrl)
      .max(4)
      .refine(
        (values) => new Set(values.map(socialKey)).size === values.length,
        "Remove duplicate social links.",
      ),
  })
  .strict();
// Baselines and in-progress drafts can contain an old bare-domain URL or an incomplete link.
export const profileDraftSchema = profileValuesSchema.extend({
  website: z.string().max(2048),
  socials: z.array(z.string().max(2048)).max(4),
});
export type ProfileValues = z.infer<typeof profileValuesSchema>;
export type GitHubProfile = {
  id: number;
  username: string;
  avatar: string;
  canEdit: boolean;
  values: ProfileValues;
};
export const profileSaveSchema = z
  .object({
    expected: z
      .object({ id: z.number().int().positive(), values: profileDraftSchema })
      .strict(),
    desired: profileValuesSchema,
  })
  .strict();
export function sameProfileField(
  field: ProfileField,
  left: ProfileValues,
  right: ProfileValues,
) {
  if (field === "socials")
    return (
      JSON.stringify(left.socials.map(socialKey).sort()) ===
      JSON.stringify(right.socials.map(socialKey).sort())
    );
  return left[field] === right[field];
}
export function changedProfileFields(
  left: ProfileValues,
  right: ProfileValues,
) {
  return profileFields.filter((field) => !sameProfileField(field, left, right));
}
export function profileCompleteness(values: ProfileValues) {
  const checks = [
    {
      done: !!values.name.trim(),
      message: "Add a display name so visitors know how to address you.",
    },
    {
      done: !!values.bio.trim(),
      message: "Add a short bio explaining what you work on.",
    },
    {
      done:
        profileUrl.safeParse(values.website).success ||
        values.socials.some((url) => profileUrl.safeParse(url).success),
      message:
        "Add a website or social link if you want visitors to connect with you.",
    },
  ];
  return {
    score: Math.round(
      (checks.filter((check) => check.done).length / checks.length) * 100,
    ),
    suggestions: checks
      .filter((check) => !check.done)
      .map((check) => check.message),
  };
}
export function suggestBios(role: string, skills: string, interests: string) {
  const title = role.trim() || "Developer";
  return [
    ...new Set([
      [
        title,
        skills.trim() && `Working with ${skills.trim()}`,
        interests.trim() && `Interested in ${interests.trim()}`,
      ]
        .filter(Boolean)
        .join(" | "),
      `${title}${skills.trim() ? ` building with ${skills.trim()}` : ""}.${interests.trim() ? ` Exploring ${interests.trim()}.` : ""}`,
      [
        title,
        interests.trim() && `Exploring ${interests.trim()}`,
        skills.trim() && `Tools: ${skills.trim()}`,
      ]
        .filter(Boolean)
        .join(" · "),
    ]),
  ];
}
