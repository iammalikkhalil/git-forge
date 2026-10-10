# Profile README Template Feature Plan

## Goal

Let a user build their GitHub profile README with two clear paths:

1. **Select a template** from the five collected READMEs.
2. **Custom**: use the existing custom README editor/import flow.

Template mode collects the user's details once, fills a personal copy of the
selected template, and opens it in the existing editor and preview. The user can
review and publish through the existing README workflow.

## Decisions already made

- Keep the five source READMEs as references under `docs/readme-candidates/`.
- Make an app-ready, fillable version of each template. Never edit the shared
  source references when generating or editing a user's README.
- Preserve each template's own GIF, icon, badge and widget URL sources. Do not
  replace them with one shared icon/link set.
- Replace the source author's personal details with that user's details.
- Autofill information already available from the signed-in GitHub profile and
  public repositories. Ask for missing details in this app; do not send the user
  to GitHub to fill them first.
- User's README form data is for that README. Saving the README does not change
  the GitHub profile. The profile editor remains a separate workflow.
- Make information optional unless it is needed by the chosen template. Omit
  empty optional sections rather than showing empty headings or fake details.
- Do not insert the user's email into the README automatically. They must choose
  to show a contact address.
- After choosing a template, let the user edit the generated Markdown and preview
  it before the existing review/publish step.

## Phase 1: Analyze and map the five source templates

For each `temp-01.md` through `temp-05.md`:

- Inventory its sections, personal-data spots, links, image/GIF sources, badges,
  technology icons, counters, stats and project widgets.
- Mark content as either fixed template presentation, user-provided content,
  derived from GitHub, an optional section, or a widget URL needing a username.
- Check which existing URLs are usable and whether their intended values can be
  parameterized safely without changing the source service.
- Record attribution/license notes when known. Preserve the source URL and
  attribution requirements; do not assume that public availability means every
  asset or complete template can be republished without conditions.

Deliverable: a template field and widget map, before writing the app-ready
versions.

## Phase 2: Define one shared, short data form

Prefill these from the signed-in profile or GitHub API where available:

- Username, display name, bio, website, location and company.
- Public profile social links.
- Public repositories and their descriptions, for template 2 project cards.
- Repository language data as optional skill suggestions only; do not claim
  languages as the user's full skill set.

Ask in the app only for information that cannot be reliably fetched and that is
used by the selected template:

- Short headline or introduction.
- Skills/tools (with any fetched language list as editable suggestions).
- Optional work/education, community, current focus, challenge, and interests
  only when used by the selected template.
- Optional contact email, with a separate explicit “show this in my README”
  choice; never read a private email and publish it silently.
- Optional social links not already present in the profile.
- Optional featured public projects, selected from the user's public repos.

Keep the form compact by showing only fields used by the selected template.
Reuse values when the user switches templates, and provide an easy way to change
the selected template without restarting the form.

Deliverable: shared form schema, prefill rules, required/optional status, and
empty-field behavior.

## Phase 3: Create five fillable template versions

- Keep each template's structure and its original visual asset/widget sources.
- Replace identifying source-author content with typed placeholders or render
  functions; do not perform broad blind substitutions on arbitrary Markdown.
- Inject the signed-in username into username-dependent links and widgets.
- Encode URL parameters correctly and validate generated external links.
- For repeated skills, projects and social links, render Markdown/HTML safely
  from validated user data.
- Hide optional sections entirely when no corresponding information is given.
- Avoid stale private contact details, sample project links, usernames and names.
- Keep a clean text-based version where an external GIF/widget is unavailable.

Deliverable: five reusable templates with explicit input contracts and example
output for a test user.

## Phase 4: Implement the “Select a template” path

- Keep the two top-level choices: **Select a template** and **Custom**.
- The Select a template path presents the shared, prefilled profile details
  before showing template cards, so users enter common information once.
- In template selection, show five concise cards with representative previews.
- If an existing profile README is detected, make it available as the first
  selectable starting point, while preserving its current content as the source
  for that user's personal draft.
- After the shared information step, show the template cards; after a card is
  selected, ask only for any additional details that design can use.
- Generate a private-in-the-browser personal draft; selection or edits must not
  mutate the shared template file.
- Open the generated draft in the existing Markdown editor and preview.
- Save/recover drafts per user and browser tab, consistent with current README
  draft behavior.

Deliverable: a user can choose, fill, edit and preview any of the five templates.

## Phase 5: Connect to existing review and publishing

- Reuse the current review, repository/SHA conflict detection, publish and
  verification workflow.
- Do not publish on template selection or form submission.
- Keep the clear review confirmation before GitHub writes.
- Show actionable errors for unavailable images/widgets without blocking README
  editing or publishing.

Deliverable: a generated template can be safely reviewed and published as the
profile README.

## Phase 6: Verify end to end

- Confirm profile values prefill correctly and missing values are requested in
  the app.
- Switch across all five templates and verify each retains its own asset URLs.
- Verify username-dependent widget links, socials, projects and special
  characters in URL values.
- Verify empty optional data hides sections and private email never appears by
  default.
- Verify generated drafts do not modify source templates and recover after
  reload.
- Verify custom import/editor still works and both paths reach the same review
  and publish flow.

Deliverable: all five template outputs and the custom path work with the existing
README preview and publisher.

## Implementation status and remaining limitations

- The five source files have been mapped and generated by isolated renderers.
  The current README appears before the five template cards when present.
- The shared form appears before the cards and prefills GitHub name, bio, company, location and profile links
  when the user/reconnect scopes allow it. Missing details are asked in the app.
- Optional email requires explicit opt-in. Public repositories can be selected
  for Template 2. Switching templates retains shared field values.
- Generated Markdown enters the existing editable preview, draft recovery,
  review and guarded publish flow. Custom import remains available as the other
  top-level path.
- All five profile repositories returned 404 from GitHub's public license
  endpoint during review, so no reuse license was confirmed. Cards link to the
  source profiles; assets and remote widget availability can change. Users can
  edit or remove those links from their personal README copy.
- External widgets such as Readme Stats may be discontinued or change behavior;
  the generated output remains editable if that happens.
- Automated checks cover generator output and existing publishing. A real
  account/Vercel smoke test remains for the user after deployment.

## Out of scope for this feature

- Updating GitHub profile fields from the README form.
- Automatically publishing without review.
- Adding a large marketplace of templates or many design controls.
- Replacing every template's visual assets with a shared icon library.
