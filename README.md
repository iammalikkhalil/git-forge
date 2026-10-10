This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Phase 1 setup

The starter includes TypeScript, ESLint, Prettier, and Tailwind CSS. `next-auth`
and `@octokit/rest` are installed for future GitHub OAuth and API integration.
GitHub authentication is implemented with a protected `/workspace` and logout.
Supabase and a local Git simulation library are not required for this phase.

```bash
npm run lint
npm run lint:fix
npm run format
npm run format:check
npm run build
```

## Authentication setup

Create a GitHub OAuth App with homepage `http://localhost:3000` and callback
`http://localhost:3000/api/auth/callback/github`. Put `GITHUB_ID`, `GITHUB_SECRET`,
`NEXTAUTH_URL`, and a random `NEXTAUTH_SECRET` in the ignored `.env.local` file.
Never commit credentials. Use a separate OAuth App and HTTPS URL for production.

Run `npm run dev`, open `/`, and choose Connect GitHub. After consent,
the dashboard displays your name and avatar. Sign out returns to login.
Anonymous dashboard requests redirect to login; authenticated login requests
redirect to the dashboard. Missing names or avatars have fallbacks.

Sessions expire after seven days. The GitHub access token is kept inside the
encrypted HttpOnly JWT cookie and is never included in the public session response.
Future GitHub API routes must authenticate each request, read the JWT on the
server, and handle revoked tokens by asking the user to sign in again.
No database or Supabase is required.

Manual verification: complete GitHub login, reload the dashboard, sign out,
then revisit `/workspace`. Also cancel GitHub consent and retry login.
Verify `/api/auth/session` never contains a GitHub access token.

## Phase 3 configuration

The dashboard includes repository and author details, dates, and an annual
commit slider (0–1,000, default 500). A pale-to-dark green gradient indicates
intensity without Low/Medium/High labels. Names are checked automatically after a
500 ms typing pause. Previous requests are cancelled and stale results ignored.
The backend independently validates every field. Preview updates are not persisted.
No repository or commits are created.

Defaults: `githubkit-history`, GitHub profile name/email when available, today
through one calendar year earlier. The browser timezone is detected after load
and can be edited in Advanced settings. Leap-day
anniversaries clamp to February 28. Advanced settings are collapsed by default:
eight independent 0–10 habit scores and a reset button.
Defaults are weekday activity 8, weekend projects 4, evenings 7,
after-midnight sessions 3, task-based commits 8, small frequent commits 4,
milestone bursts 6, and project breaks 5. Habit scores describe weekday and weekend
preferences without a separate preset or day checklist. End dates cannot
precede start dates or be in the future. Zero annual commits is valid.
Ranges are limited to 10 years to keep preview generation bounded.

GitHub login now requests `repo` alongside profile/email scopes so name checks
include private repositories. Existing users must reconnect and approve access.
GitHub's OAuth `repo` scope includes write permissions; this phase only performs
read requests. Tokens never leave the server-visible encrypted session.
Checks use the authenticated GitHub user's login, not a client-supplied owner.
Author email syntax is validated; account ownership is not verified.

Endpoints: `POST /api/projects/check-name` accepts `{ repositoryName }`;
`POST /api/projects` accepts `{ repositoryName, authorName, authorEmail,
startDate, endDate, timeZone, annualCommits, habits }`.
Both require authentication and same-origin requests. Missing permission,
rate limits, and upstream errors never produce an available result.
Run `npm test` for schema, GitHub check, and request-handler tests.

Manual check: reconnect GitHub, try an existing public and private repository,
then a new name. Type quickly and verify only the current name gets a status.
Edit valid settings and confirm the preview updates; try invalid author details,
reversed/future dates, and out-of-range habit scores and verify field errors.
Repository availability is not a reservation.

## Phase 4 calendar preview

The calendar automatically updates after a 500 ms editing pause, calling
`POST /api/generate-commits` when settings are valid. Generation requests are
cancelled on further edits and outdated responses are ignored. Inputs stay
editable while generating. Repository availability checks run independently;
a preview does not reserve or confirm an available name.
The endpoint requires a signed-in session and same-origin
JSON containing the project settings plus a nonempty `seed` (up to 100 characters)
and `asOf` ISO timestamp. It returns `{ calendar }` with UTC commit timestamps,
local-date daily counts, total, active-day count, seed, timezone and snapshot time.
It does not call GitHub or create repository content.

The exact target is `round(annualCommits × inclusiveDays / 365.25)`. This is an
annual rate: a 365-day range at 500/year gives 500; a 366-day inclusive range gives 501. There are no monthly/weekly quotas. Zero produces an empty calendar.

A seeded weighted scheduler combines weekday/weekend preferences, changing daily
momentum, multi-day breaks and milestone bursts. Day allocations preserve the exact
target. One or two session windows shape timestamps: evening/night preferences
choose hours, task completion clusters commits near session ends, and frequent
small commits can use multiple sessions. Night sessions may cross midnight into
another eligible day. Temporal handles timezone/DST conversion. Timestamps stay
within the selected local dates and never exceed `asOf`; today's sessions are
redistributed into elapsed time when needed. Zero weekday/weekend scores exclude
those day types. Impossible positive schedules return a validation error.

The same settings, seed and snapshot repeat exactly. Edit the seed in Advanced
settings to get another distribution; the snapshot remains fixed while the page
is open. Regenerate chooses a new seed while preserving settings and the total;
editing settings also updates the preview automatically. The preview shows a scrollable contribution
grid by year; hover, focus or tap a square for its date/count. Changing settings
clears the old preview. Results remain in memory only. These are simulated habits,
not a model trained on real developer histories or a guarantee of human realism.

## Local project generation (Part 1)

The local generator is reused internally by GitHub upload. The dashboard now
shows only the GitHub upload action. The authenticated, same-origin
`POST /api/projects/generate` archive endpoint remains available for development
checks; it returns README.md and the complete `.git` directory on branch `main`.

`isomorphic-git` builds the repository in a unique OS temporary directory;
no GitHub calls or native Git executable are required by the app. Each scheduled
commit changes the README. Author and committer names, emails, timestamps and
timezone offsets are explicitly set. The first scheduled commit is the root:
there is no extra initialization commit. Git timestamps have second precision.
Zero commits yields an initialized repository with an uncommitted README.

Before downloading, the reachable parent chain, count, metadata and changing
trees are verified against the generated calendar. Temporary files are cleaned
after success, failure or cooperative cancellation. Downloads contain no OAuth
credentials. Nothing is persisted between requests or uploaded to GitHub.

This initial generation step allows at most 1,000 **total** commits, independently
of the annual-volume slider. The Node route has a 300-second duration setting;
actual Vercel availability and performance still require a deployed test.
On the local Windows test machine, 500 commits plus verification took about
10.3 seconds and 172 KB of repository files. These are not Vercel measurements.
`npm test` independently checks the resulting history with native Git `fsck`
(Git must be installed for that test), archive extraction, cleanup and endpoint
guards. Future upload needs an explicit durable handoff or regeneration; it
must not assume these temporary directories survive into another request.

## GitHub upload (Part 2)

**Create on GitHub** creates an empty **private** repository in the signed-in
user's personal account, regenerates the exact preview history, and pushes
`main` using `isomorphic-git` over HTTPS. GitHub receives one Git push rather
than REST writes for every commit. The local HEAD must match GitHub's `main`
SHA before success is reported. GitHub profile contribution processing may
take time and still depends on verified author email and contribution rules.

`POST /api/projects/publish` accepts same-origin, authenticated operations:

- `{ action: "prepare", input: <calendar settings> }` checks `repo` OAuth scope,
  account, name availability and the 1–1,000 total-commit limit. It returns a
  signed receipt containing the original settings and a unique operation ID.
  Preparation does not write to GitHub.
- `{ action: "publish", receipt }` checks the signed receipt and current GitHub
  account, generates/verifies history, checks the repository again, creates it
  privately without GitHub's initial README, pushes, and verifies the SHA.
  Progress, success and sanitized errors are newline-delimited JSON events.
- `{ action: "status", receipt }` checks the account and repository without
  generating, creating or pushing anything. Reload uses this to clear an old
  pending receipt if its repository no longer exists. Network, authorization
  and permission failures preserve the receipt rather than treating it as deleted.

Receipts use HMAC with the existing `NEXTAUTH_SECRET`, expire after 24 hours,
and contain no GitHub token. Keep the secret stable across deployments for
pending retries. The browser retains unfinished-upload receipts in sessionStorage
for retries in the same tab, including reloads. Verified success removes the
stored receipt so a subsequent reload starts fresh. No new environment variables or Supabase
are required. Storage-disabled browsers retain retries only while the page
remains open. The original upload settings are shown separately from current
form edits. Upload never starts automatically after a reload or reconnect.

A unique marker in the repository description associates it with the signed
operation. Retries only accept that private, admin-accessible repository in
the same account, with either no branches or exactly the expected `main` SHA.
Unrelated or changed repositories are rejected. A concurrent creation conflict
is rechecked; a completed push is verified without another push. No force push,
automatic repository deletion, or automatic rate-limit retry is performed.
Keep the description marker until the operation is complete. After receipt
expiry or loss, inspect any created repository before choosing a new name.

The OAuth token is only passed in a server-side Git authentication callback;
it is never written into a remote URL, local Git configuration, receipt or
browser response. The existing OAuth app needs `repo` scope; users who signed
in before it was added must reconnect. Private repositories stay private.
If push fails after repository creation, the repository remains available for
retry and temporary local files are cleaned. The signed receipt lets retries
rebuild the same history without relying on Vercel temporary-file persistence.

The route allows up to 300 seconds and the Git push has a 120-second timeout.
GitHub API errors are sanitized; an interrupted response may mean the push
completed, so use **Retry / verify this upload** before starting another project.
Tests cover receipt tampering/expiry, account and permission checks, creation
races, failed and repeated uploads, SHA verification, stream responses, and a
real authenticated push to a temporary native Git smart-HTTP server.

For a real Vercel smoke test, use a new repository name and a short preview
with a few commits, click **Create private repository**, and check privacy,
`main`, README, author/dates and commit count in GitHub. Then test the normal
407–500 commit preview. Actual GitHub OAuth/network and Vercel push behavior
must be tested in deployment; local transport tests do not establish that.

## GitHub Profile Setup

The dashboard opens with **GitHub Profile**, followed by **Profile README** and
**Activity Generator**. Profile setup fetches the authenticated user's public
name, bio, website, location, company, hireable preference and social links.
Username/avatar are read-only. Avatar, pronouns, local-time and email settings
link to GitHub; private email addresses are not fetched or copied into a README.

OAuth now requests `user repo`. Existing sessions may need **Reconnect GitHub**
to grant profile-write access; no new client secret or environment variable is
needed. The form shows missing name/bio/contact-link suggestions, optional bio
suggestions based on entered role/skills/interests, a 160-character bio limit,
and up to four social links. Optional personal fields do not reduce completeness.

Review compares the baseline with the draft before saving. Only edited fields
are submitted; the server rechecks their current values and account ID first.
These checks are optimistic, since GitHub profile updates have no atomic SHA
condition. Basic fields and social-link changes use separate API calls. After
each save, a fresh read reports verified saved fields and any pending changes;
an unavailable verification requires reloading before retrying.

Drafts and their baseline are stored per account in this tab's sessionStorage.
Reload latest preserves edited fields while updating untouched values. Discard
clears the draft. **Continue to README** passes confirmed profile data and entered
skills into the builder without overwriting an existing custom README draft.

Authenticated `GET /api/github-profile` loads the public editable profile.
Same-origin authenticated `POST` accepts `{ expected: { id, values }, desired }`.
Strict Zod validation rejects extra fields and unsafe links. Tokens stay on the
server; responses use `Cache-Control: no-store`.

Profile tests mock GitHub and cover conflicts, permissions, clearing fields,
idempotent retries, social-link replacement, partial saves and failed verification.
After deployment, reconnect and smoke-test fetch, edit/review/save, draft recovery,
and the saved-profile handoff using your real GitHub account.

## Profile README Builder

The dashboard includes **Activity Generator** and **Profile README** tools. Switching
tools keeps the current editor state. README import starts when its tab is first
opened; `#readme` opens it directly. No new environment variables are needed.

The README builder starts with **Select a template** or **Custom**. Template
selection first shows shared profile details prefilled from GitHub and asks for
missing values in the app. It then shows the current README first when it exists,
followed by the five collected designs. A chosen design asks only for any extra
details it can use. Form values are per-user draft data;
selecting a template creates a generated copy. Original source files are kept
under `docs/readme-candidates/`, with the field and asset audit in
`docs/readme-template-audit.md`. Each design keeps its own GIF, badge, icon and
widget sources. Username-based widget URLs use the authenticated account. Email
is shown only after explicit opt-in. Edit the generated Markdown, preview,
review and publish through the existing guarded README flow.

The builder imports the signed-in user's `username/username` repository and root
`README.md` (including case variants). Existing Markdown is preserved verbatim
and opens in raw-edit mode. Missing READMEs start with the user's name and bio.
Private/read-only repositories can be inspected, but publishing is disabled;
the app never changes repository visibility or modifies other files.

The shared form prefills name, bio, company, location and public social links
when those values are available. It asks only for additional fields used by the
selected template. Template 2 can load and select up to 12 public repositories;
all templates support up to 10 profile links. Profile fields stay in the form
when switching templates. A chosen template generates a personal draft, which
can be edited as Markdown or as form data before publishing. Drafts are stored
per GitHub username in this browser tab's sessionStorage; they survive refresh
and can be discarded. Successful publication clears the stored draft. This is
local draft recovery, not cross-device persistence.

Custom READMEs can be
loaded from a public GitHub profile/repository URL, pasted Markdown, or a local
Markdown file (100 KB maximum). The gallery link opens external inspiration;
URL imports read the repository's default README using GitHub's public API
directly from the browser without the user's OAuth token. API limits may require
using paste/file instead. Optional literal username/name replacements update the
personal copy, including matching widget URLs. Replacing the editor requires
confirmation; the resulting draft uses the existing recovery/review/publish flow.
Other personal details and relative asset paths need reviewing in the editor.

The responsive preview supports Markdown, GFM tables and sanitized HTML using
react-markdown, remark-gfm, rehype-raw and rehype-sanitize. Scripts, event handlers
and unsafe URLs are removed; external images are rendered in the browser without
server-side fetching. Relative image/link paths resolve against the profile repo.
GitHub's exact rendering can differ, particularly custom HTML styles.

Publishing requires reviewing the current README beside the proposed Markdown.
Creating a missing profile repository requires explicit confirmation that it
will be **public**. The backend rechecks repository ID, default branch, root
filename and the README blob SHA, and sends that SHA to GitHub's Contents API.
Conflicts preserve the draft; **Reload latest (keep draft)** refreshes the baseline
for another review. A retry of identical published content creates no extra commit.
If repository creation succeeds but writing fails, reload before retrying.

The current imported README can be downloaded as a backup. Version history
lists README commits with pagination. Selecting a revision only loads its content
into the editor; reviewing and publishing it restores via a new commit using
the latest baseline SHA. History is retained by GitHub, without force pushes.

Authenticated `GET /api/profile-readme` resources:

- Default / `resource=profile`: import profile README and metadata.
- `resource=projects&page=1`: public repositories owned by this user (30/page).
- `resource=history&page=1`: README revisions (20/page).
- `resource=revision&sha=<40-character commit SHA>`: one previous README.

Same-origin authenticated `POST /api/profile-readme` accepts `{ content,
expected: { repositoryId, branch, path, sha }, createPublic }`. Owners/repository
names are derived on the server. Strict Zod validation limits content to 100 KB,
rejects empty publishes and forged extra fields. Tokens remain server-side and
all responses use `Cache-Control: no-store`.

Tests cover exact import, missing/private/read-only repos, public-creation consent,
SHA/branch/repository conflicts, idempotent retry, history restore, public-project
filtering, template validation, sanitized rendering and API access guards.
After deployment, smoke-test import/edit/review/publish in your actual GitHub
profile, reload a draft, and load/restore a previous version. Unit tests use
mocked GitHub responses and do not publish to your account.

## Learning resources

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
