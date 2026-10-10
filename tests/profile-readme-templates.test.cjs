/* eslint-disable @typescript-eslint/no-require-imports -- Node test loader. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(relative, dependencies = {}) {
  const source = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, "..", relative), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", source)(
    (name) =>
      Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
    mod,
    mod.exports,
  );
  return mod.exports;
}

const templates = load("lib/profile-readme-templates.ts");
const form = {
  template: "temp-01",
  name: "Example Developer",
  headline: "Software engineer",
  bio: "Building useful things",
  skills: "JavaScript, TypeScript, React, C#, .NET, Oracle",
  projects: [
    {
      name: "demo-project",
      description: "A useful demo",
      url: "https://github.com/example-user/demo-project",
    },
  ],
  links: [
    { label: "Twitter", url: "https://twitter.com/example-user" },
    { label: "LinkedIn", url: "https://www.linkedin.com/in/example-user" },
    { label: "Instagram", url: "https://instagram.com/example-user" },
    { label: "LeetCode", url: "https://leetcode.com/example-user" },
    { label: "Website", url: "https://example.com/?a=1&b=two" },
  ],
  sections: ["introduction", "skills", "projects", "links"],
  role: "Engineer",
  company: "Example Labs",
  location: "Wellington",
  education: "Example University",
  interests: "Open source and thoughtful tools",
  architecture: "microservices, event-driven systems",
  tools: "Docker, GitHub Actions",
  communities: "Local Dev Community",
  challenge: "Building a small compiler",
  focus: "Developer experience, API design",
  workAreas: "Developer platforms, internal tools",
  contactEmail: "private@example.com",
  showEmail: false,
};

test("five cards map to five generators while source visual links stay template-specific", () => {
  assert.deepEqual(
    templates.selectableTemplates.map((item) => item.id),
    ["temp-01", "temp-02", "temp-03", "temp-04", "temp-05"],
  );
  const outputs = templates.selectableTemplates.map((item) =>
    templates.buildSelectableTemplate(
      item.id,
      { ...form, template: item.id },
      "example-user",
    ),
  );
  assert.match(outputs[0], /mGcNjsfWAjY5AEZNw6/);
  assert.match(outputs[0], /github\/followers\/example-user/);
  assert.match(outputs[1], /blob-sunglasses\.gif/);
  assert.match(outputs[1], /komarev\.com\/ghpvc\/\?username=example-user/);
  assert.match(outputs[1], /repo=demo-project/);
  assert.match(outputs[1], /Resources\/png\/twitter\.png/);
  assert.match(outputs[2], /aemmadi\/aemmadi\/master\/wave\.gif/);
  assert.match(outputs[2], /devicons\/devicon\/master\/icons\/csharp/);
  assert.match(
    outputs[3],
    /github-readme-stats\.vercel\.app\/api\?username=example-user&count_private=true/,
  );
  assert.match(
    outputs[3],
    /visitor-badge\.laobi\.icu\/badge\?page_id=example-user\.example-user/,
  );
  assert.match(outputs[4], /## 💻 Tech Stack/);
  assert.equal(outputs[4].includes("https://img.shields.io"), false);
});

test("template output personalizes usernames and removes author details and empty optional sections", () => {
  const noExtras = {
    ...form,
    role: "",
    company: "",
    location: "",
    education: "",
    interests: "",
    architecture: "",
    tools: "",
    communities: "",
    challenge: "",
    focus: "",
    workAreas: "",
    links: [],
    projects: [],
  };
  for (const item of templates.selectableTemplates) {
    const output = templates.buildSelectableTemplate(
      item.id,
      { ...noExtras, template: item.id },
      "new-account",
    );
    assert.equal(output.includes("thaianebraga@gmail.com"), false);
    assert.equal(output.includes("kanna6501@gmail.com"), false);
    assert.equal(output.includes("abhishekmaira1999@gmail.com"), false);
    assert.equal(output.includes("achyutghosh06@gmail.com"), false);
    assert.equal(output.includes("education"), false);
  }
  assert.match(
    templates.buildSelectableTemplate(
      "temp-04",
      { ...noExtras, template: "temp-04" },
      "new-account",
    ),
    /username=new-account/,
  );
});

test("contact email is omitted unless explicitly selected; user text is escaped", () => {
  const privateEmail = templates.buildSelectableTemplate(
    "temp-05",
    { ...form, template: "temp-05", name: "<script>alert(1)</script>" },
    "example-user",
  );
  assert.equal(privateEmail.includes("private@example.com"), false);
  assert.equal(privateEmail.includes("<script>"), false);
  const publicEmail = templates.buildSelectableTemplate(
    "temp-05",
    { ...form, template: "temp-05", showEmail: true },
    "example-user",
  );
  assert.match(publicEmail, /mailto:private%40example\.com/);
});
