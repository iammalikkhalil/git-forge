import type { ReadmeForm } from "@/lib/profile-readme-schema";

export type SelectableTemplateId = `temp-0${1 | 2 | 3 | 4 | 5}`;
export const selectableTemplates: {
  id: SelectableTemplateId;
  title: string;
  style: string;
  source: string;
}[] = [
  {
    id: "temp-01",
    title: "Personal story",
    style: "Animated introduction, about-me code card, and social badges",
    source: "https://github.com/Thaiane/Thaiane",
  },
  {
    id: "temp-02",
    title: "Portfolio showcase",
    style: "Social icons, skill icons, projects, stats, and profile views",
    source: "https://github.com/AbhishekMaira10/AbhishekMaira10",
  },
  {
    id: "temp-03",
    title: "Compact professional",
    style: "Role, contact badges, and a small technology icon row",
    source: "https://github.com/achyutghosh/achyutghosh",
  },
  {
    id: "temp-04",
    title: "Skills showcase",
    style: "Short introduction, technology badges, GitHub stats, and views",
    source: "https://github.com/aemmadi/aemmadi",
  },
  {
    id: "temp-05",
    title: "Engineering overview",
    style: "Leadership summary, grouped information, focus, and contact",
    source: "https://github.com/BhagawatAdhikari/bhagawatadhikari",
  },
];

const gifs = {
  hello: "https://media.giphy.com/media/mGcNjsfWAjY5AEZNw6/giphy.gif",
  right: "https://media.giphy.com/media/ieyl9zmCjO4b4t6qoY/giphy.gif",
  spark: "https://media.giphy.com/media/fYSnHlufseco8Fh93Z/giphy.gif",
  work: "https://media.giphy.com/media/WUlplcMpOCEmTGBtBW/giphy.gif",
  about: "https://media.giphy.com/media/VgCDAzcKvsR6OM0uWg/giphy.gif",
  connect: "https://media.giphy.com/media/LnQjpWaON8nhr21vNW/giphy.gif",
  sunglasses:
    "https://emojis.slackmojis.com/emojis/images/1531849430/4246/blob-sunglasses.gif?1531849430",
  working: "https://media.giphy.com/media/3ohzdKvLT1DxFxhZAI/giphy.gif",
  wave: "https://raw.githubusercontent.com/aemmadi/aemmadi/master/wave.gif",
  achyutWork:
    "https://github.com/achyutghosh/achyutghosh/blob/master/gifs/people-at-work.gif",
};

const esc = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const md = (value: string) =>
  value
    .replace(/[\\`*_{}\[\]()#+.!|>~-]/g, "\\$&")
    .replace(/</g, "&lt;")
    .replace(/&(?!(?:lt);)/g, "&amp;");
const items = (value: string) =>
  value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
const url = (value: string) =>
  new URL(value).href.replace(
    /[()<>\\]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
const list = (heading: string, value: string) => {
  const values = items(value);
  return values.length
    ? `### ${heading}\n\n${values.map((item) => `- ${md(item)}`).join("\n")}`
    : "";
};
function social(form: ReadmeForm, host: string) {
  return form.links.find((link) => {
    try {
      return new URL(link.url).hostname.toLowerCase().includes(host);
    } catch {
      return false;
    }
  });
}
function publicEmail(form: ReadmeForm) {
  return form.showEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)
    ? form.contactEmail
    : "";
}
function contactMarkdown(form: ReadmeForm) {
  const links = form.links.map(
    (item) => `[${md(item.label)}](${url(item.url)})`,
  );
  const email = publicEmail(form);
  if (email) links.push(`[Email](mailto:${encodeURIComponent(email)})`);
  return links.length ? `## 📫 Connect\n\n${links.join(" · ")}` : "";
}
function socialBadge(label: string, href: string, image: string) {
  return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer"><img alt="${esc(label)}" height="30" width="30" src="${esc(image)}"></a>`;
}
function tempOne(form: ReadmeForm, username: string) {
  const headline = form.role || form.headline;
  const companyLine = [headline, form.company]
    .filter(Boolean)
    .map(esc)
    .join(" at ");
  const linkedin = social(form, "linkedin.com");
  const socials = [
    linkedin
      ? `[![LinkedIn](https://img.shields.io/badge/-${encodeURIComponent(linkedin.label || "LinkedIn")}-blue?style=flat-square&logo=Linkedin&logoColor=white)](${url(linkedin.url)})`
      : "",
    `[![GitHub followers](https://img.shields.io/github/followers/${encodeURIComponent(username)}?label=follow&style=social)](https://github.com/${encodeURIComponent(username)})`,
  ].filter(Boolean);
  const profileObject = [
    `  code: ${JSON.stringify(items(form.skills))},`,
    form.architecture.trim()
      ? `  architecture: ${JSON.stringify(items(form.architecture))},`
      : "",
    form.tools.trim() ? `  tools: ${JSON.stringify(items(form.tools))},` : "",
    form.communities.trim()
      ? `  communities: ${JSON.stringify(items(form.communities))},`
      : "",
    form.challenge.trim()
      ? `  challenge: ${JSON.stringify(form.challenge.trim())}`
      : "",
  ]
    .filter(Boolean)
    .join("\n")
    .replace(/`/g, "\\u0060");
  const experience = [form.education, companyLine]
    .filter(Boolean)
    .map(
      (entry, index) =>
        `<p><em>${esc(entry)}${index === 0 ? `<img src="${gifs.spark}" width="30">` : `<img src="${gifs.work}" width="30">`}</em></p>`,
    )
    .join("\n");
  const about = form.interests.trim() ? `<p>${esc(form.interests)}</p>` : "";
  const remainingLinks = {
    ...form,
    links: form.links.filter(
      (link) => !link.url.toLowerCase().includes("linkedin.com"),
    ),
  };
  return [
    `<h2> Hi, I'm ${esc(form.name || username)}! <img src="${gifs.hello}" width="50"></h2>`,
    `<img align='right' src="${gifs.right}" width="230">`,
    experience,
    socials.join("\n"),
    form.skills.trim() ||
    form.tools.trim() ||
    form.architecture.trim() ||
    form.communities.trim() ||
    form.challenge.trim()
      ? '### <img src="' +
        gifs.about +
        '" width="50"> A little more about me...\n\n```javascript\nconst developer = {\n' +
        profileObject +
        "\n}\n```"
      : "",
    about,
    remainingLinks.links.length || publicEmail(form)
      ? `<img src="${gifs.connect}" width="60"> <em>I enjoy connecting with other developers.</em>\n\n${contactMarkdown(remainingLinks)}`
      : "",
    "---",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const exploreIcon = (slug: string) =>
  `https://raw.githubusercontent.com/github/explore/80688e429a7d4ef2fca1e82350fe8e3517d3494d/topics/${slug}/${slug}.png`;
const tempTwoIcons: Record<string, string> = {
  "visual studio code": exploreIcon("visual-studio-code"),
  javascript: exploreIcon("javascript"),
  python: exploreIcon("python"),
  dart: exploreIcon("dart"),
  flutter: exploreIcon("flutter"),
  "c++": exploreIcon("cpp"),
  html: exploreIcon("html"),
  css: exploreIcon("css"),
  bootstrap: exploreIcon("bootstrap"),
  firebase: exploreIcon("firebase"),
  flask: exploreIcon("flask"),
  git: exploreIcon("git"),
  terminal: exploreIcon("terminal"),
};
const platformIcons: Record<string, string> = {
  codechef:
    "https://raw.githubusercontent.com/AbhishekMaira10/AbhishekMaira10/master/Resources/svg/codechef.svg",
  leetcode:
    "https://raw.githubusercontent.com/AbhishekMaira10/AbhishekMaira10/master/Resources/svg/leetcode.svg",
  hackerrank:
    "https://raw.githubusercontent.com/AbhishekMaira10/AbhishekMaira10/master/Resources/svg/hackerrank.svg",
  codewars:
    "https://raw.githubusercontent.com/AbhishekMaira10/AbhishekMaira10/master/Resources/svg/codewars.svg",
};
function tempTwo(form: ReadmeForm, username: string) {
  const iconLinks: Record<string, string> = {
    twitter:
      "https://raw.githubusercontent.com/AbhishekMaira10/AbhishekMaira10/master/Resources/png/twitter.png?raw=true",
    linkedin:
      "https://raw.githubusercontent.com/AbhishekMaira10/AbhishekMaira10/master/linkedin.png?raw=true",
    instagram: "https://image.flaticon.com/icons/svg/725/725278.svg",
    spotify:
      "https://raw.githubusercontent.com/AbhishekMaira10/AbhishekMaira10/master/Resources/png/spotify.png?raw=true",
    vscode:
      "https://raw.githubusercontent.com/AbhishekMaira10/AbhishekMaira10/master/Resources/png/visual-studio.png?raw=true",
  };
  const socialLinks = [
    ["twitter.com", "twitter"],
    ["linkedin.com", "linkedin"],
    ["instagram.com", "instagram"],
    ["spotify.com", "spotify"],
    ["marketplace.visualstudio.com", "vscode"],
  ].flatMap(([host, key]) => {
    const link = social(form, host);
    return link ? [socialBadge(link.label, link.url, iconLinks[key])] : [];
  });
  const platforms = Object.entries(platformIcons).flatMap(([host, icon]) => {
    const link = social(form, host);
    return link
      ? [
          `<a href="${esc(link.url)}"><img src="${icon}" alt="${esc(link.label)}" style="vertical-align:top; margin:4px"></a>`,
        ]
      : [];
  });
  const tech = items(form.skills).map((skill) => {
    const icon = tempTwoIcons[skill.toLowerCase()];
    return icon
      ? `<code><img height="20" width="20" alt="${esc(skill)}" src="${icon}"></code>`
      : "`" + md(skill) + "`";
  });
  const email = publicEmail(form);
  const projects = form.projects.map(
    (project) =>
      `<a href="${esc(project.url)}"><img align="center" src="https://github-readme-stats.vercel.app/api/pin/?username=${encodeURIComponent(username)}&repo=${encodeURIComponent(project.name)}&theme=dracula" /></a>`,
  );
  const intro = form.bio.trim() ? md(form.bio) : "";
  const headline = [form.headline || form.role, form.company]
    .filter(Boolean)
    .map(md)
    .join(" at ");
  const codechef = social(form, "codechef.com");
  const leetcode = social(form, "leetcode.com");
  const hackerrank = social(form, "hackerrank.com");
  const codewars = social(form, "codewars.com");
  const platformHeader =
    codechef || leetcode || hackerrank || codewars
      ? `---\n\n### 📢 Find me elsewhere\n\n<p align="left">\n${platforms.join("\n")}\n</p>`
      : "";
  const emailContact = email
    ? `[Email](mailto:${encodeURIComponent(email)})`
    : "";
  const miscellaneousLinks = form.links.filter(
    (link) =>
      ![
        "twitter.com",
        "linkedin.com",
        "instagram.com",
        "spotify.com",
        "marketplace.visualstudio.com",
      ].some((host) => link.url.toLowerCase().includes(host)),
  );
  return [
    `<h1><img src="${gifs.sunglasses}" width="30"/> Hey, nice to see you.</h1>`,
    socialLinks.length || emailContact
      ? `<p align="left">\n${socialLinks.join("&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;\n")}\n${emailContact}\n</p>`
      : "",
    `<br>\n\nHi, I'm ${md(form.name || username)}${form.location ? `, ${md(form.location)}` : ""}.${headline ? ` ${headline}.` : ""}${intro ? ` ${intro}` : ""}`,
    form.interests ? `\n\n${md(form.interests)}` : "",
    miscellaneousLinks.length || (email && !socialLinks.length)
      ? contactMarkdown({ ...form, links: miscellaneousLinks })
      : "",
    `<img align="right" alt="GIF" src="${gifs.working}" />`,
    `<p align="left"> <img src="https://komarev.com/ghpvc/?username=${encodeURIComponent(username)}" alt="Profile views" /> </p>`,
    tech.length ? `**Languages and Tools:**\n\n${tech.join("\n")}` : "",
    platformHeader,
    `<details>\n<summary>📈 My GitHub Stats</summary>\n\n<p align="center"> <img src="https://github-readme-stats.vercel.app/api?username=${encodeURIComponent(username)}&show_icons=true&theme=gotham" alt="GitHub stats for ${esc(username)}" />\n\n</details>`,
    projects.length ? projects.join("\n") : "",
    `<div align="center">\n\n### Show some ❤️ by starring some of the repositories!\n</div>`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const deviconRoot =
  "https://raw.githubusercontent.com/devicons/devicon/master/icons";
const tempThreeIcons: Record<string, string> = {
  "c#": `${deviconRoot}/csharp/csharp-plain.svg`,
  csharp: `${deviconRoot}/csharp/csharp-plain.svg`,
  ".net": `${deviconRoot}/dot-net/dot-net-plain-wordmark.svg`,
  dotnet: `${deviconRoot}/dot-net/dot-net-plain-wordmark.svg`,
  javascript: `${deviconRoot}/javascript/javascript-plain.svg`,
  oracle: `${deviconRoot}/oracle/oracle-original.svg`,
};
function contactBadges(form: ReadmeForm) {
  const theme: Record<string, [string, string, string]> = {
    "linkedin.com": ["LinkedIn", "0e76a8", "Linkedin"],
    "instagram.com": ["Instagram", "e4405f", "Instagram"],
    "facebook.com": ["Facebook", "3b5998", "Facebook"],
    "youtube.com": ["YouTube", "darkred", "youtube"],
    "medium.com": ["Medium", "03a57a", "Medium"],
    "twitter.com": ["Twitter", "1da1f2", "Twitter"],
  };
  const badges = form.links.map((link) => {
    let host = "";
    try {
      host = new URL(link.url).hostname.toLowerCase();
    } catch {
      /* already validated */
    }
    const spec = Object.entries(theme).find(([key]) =>
      host.includes(key),
    )?.[1] ?? [link.label, "333333", "globe"];
    const label = encodeURIComponent(spec[0]);
    const image = `https://img.shields.io/badge/-${label}-${spec[1]}?style=flat-square&logo=${encodeURIComponent(spec[2])}&logoColor=white`;
    return `[![${md(spec[0])} Badge](${image})](${url(link.url)})`;
  });
  const email = publicEmail(form);
  if (email)
    badges.push(
      `[![Email Badge](https://img.shields.io/badge/-Email-c14438?style=flat-square&logo=Gmail&logoColor=white)](mailto:${encodeURIComponent(email)})`,
    );
  return badges;
}
function tempThree(form: ReadmeForm, username: string) {
  const roleLine = [form.role || form.headline, form.company]
    .filter(Boolean)
    .map(esc)
    .join(" at ");
  const icons = items(form.skills).flatMap((skill) => {
    const icon = tempThreeIcons[skill.toLowerCase()];
    return icon
      ? [`<img src="${icon}" alt="${esc(skill)}" width="45" height="45" />`]
      : [];
  });
  const uniconizedSkills = items(form.skills).filter(
    (skill) => !tempThreeIcons[skill.toLowerCase()],
  );
  const contacts = contactBadges(form);
  return [
    `## Fancy seeing you here! <img src="${gifs.wave}" width="30">`,
    form.bio
      ? md(form.bio)
      : `Hi, I'm ${md(form.name || username)}${form.location ? ` from ${md(form.location)}` : ""}.`,
    roleLine ? `### 💼 ${roleLine}` : "",
    form.education ? `**${md(form.education)}**` : "",
    `<img align='right' src="${gifs.achyutWork}" width="300">`,
    contacts.length ? `## :envelope: Let's talk\n\n${contacts.join("\n")}` : "",
    items(form.skills).length
      ? `## :computer: Currently playing with\n${icons.length ? `<p align="left">\n${icons.join("\n")}\n</p>` : ""}${uniconizedSkills.length ? `\n${uniconizedSkills.map(md).join(" · ")}` : ""}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function tempFour(form: ReadmeForm, username: string) {
  const skills = items(form.skills).map((skill) => {
    const slug = encodeURIComponent(skill.trim().replace(/\s+/g, " "));
    const name = encodeURIComponent(skill.trim());
    return `![${md(skill)}](https://img.shields.io/badge/-${name}-black?style=flat-square&logo=${slug})`;
  });
  return [
    `## Fancy seeing you here! <img src="${gifs.wave}" width="30">`,
    form.bio
      ? md(form.bio)
      : `I'm ${md(form.name || username)}${form.education ? `, ${md(form.education)}` : ""}.`,
    form.headline ? md(form.headline) : "",
    contactBadges(form).join("\n"),
    form.education ? `**Education:** ${md(form.education)}` : "",
    form.location ? `**Location:** ${md(form.location)}` : "",
    skills.length ? `## ⚡ Technologies\n\n${skills.join("\n")}` : "",
    `![GitHub Stats](https://github-readme-stats.vercel.app/api?username=${encodeURIComponent(username)}&count_private=true&show_icons=true&include_all_commits=true)`,
    `![Visitor Badge](https://visitor-badge.laobi.icu/badge?page_id=${encodeURIComponent(username)}.${encodeURIComponent(username)})`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function tempFive(form: ReadmeForm, username: string) {
  const header = form.role || form.headline;
  const skills = items(form.skills);
  return [
    `# Hi there 👋 I'm ${md(form.name || username)}`,
    header
      ? `**${md(header)}${form.company ? ` @ ${md(form.company)}` : ""}**`
      : "",
    md(form.bio),
    "---",
    list(
      "🚀 About Me",
      [
        form.interests,
        form.location && `Based in ${form.location}`,
        form.workAreas,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    skills.length
      ? `## 💻 Tech Stack\n\n${skills.map((skill) => `- ${md(skill)}`).join("\n")}`
      : "",
    form.focus ? list("📈 Current Focus", form.focus) : "",
    contactMarkdown(form),
    form.challenge ? `> *${md(form.challenge)}*` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildSelectableTemplate(
  template: SelectableTemplateId,
  form: ReadmeForm,
  username: string,
) {
  switch (template) {
    case "temp-01":
      return tempOne(form, username);
    case "temp-02":
      return tempTwo(form, username);
    case "temp-03":
      return tempThree(form, username);
    case "temp-04":
      return tempFour(form, username);
    case "temp-05":
      return tempFive(form, username);
  }
}
