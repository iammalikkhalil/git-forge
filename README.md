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
GitHub authentication is implemented with a protected `/dashboard` and logout.
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

Run `npm run dev`, open `/login`, and choose Continue with GitHub. After consent,
the dashboard displays your name and avatar. Sign out returns to login.
Anonymous dashboard requests redirect to login; authenticated login requests
redirect to the dashboard. Missing names or avatars have fallbacks.

Sessions expire after seven days. The GitHub access token is kept inside the
encrypted HttpOnly JWT cookie and is never included in the public session response.
Future GitHub API routes must authenticate each request, read the JWT on the
server, and handle revoked tokens by asking the user to sign in again.
No database or Supabase is required.

Manual verification: complete GitHub login, reload the dashboard, sign out,
then revisit `/dashboard`. Also cancel GitHub consent and retry login.
Verify `/api/auth/session` never contains a GitHub access token.

## Phase 3 configuration

The dashboard includes repository and author details, dates, and an annual
commit slider (0–1,000, default 500). A pale-to-dark green gradient indicates
intensity without Low/Medium/High labels. Names are checked automatically after a
500 ms typing pause. Previous requests are cancelled and stale results ignored.
The backend independently validates every field. Preview updates are not persisted.
No repository or commits are created.

Defaults: `git-forge-history`, GitHub profile name/email when available, today
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

Below the calendar, **Generate & download project** sends the same settings,
seed and snapshot to authenticated, same-origin `POST /api/projects/generate`.
It returns a `.tar.gz` archive containing README.md and the complete `.git`
directory on branch `main`. Extract it to inspect with `git log`.

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

## Learning resources

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
