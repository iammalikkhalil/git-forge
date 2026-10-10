import { Suspense } from "react";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { connection } from "next/server";
import { authOptions } from "@/lib/auth";
import { LandingConnect, GitHubMark } from "./components/landing-connect";
import { WorkspaceIcon } from "./workspace/workspace-shell";
import "./landing.css";
import { creator, CreatorLinks } from "./components/creator-links";

import { LandingMotion } from "./components/landing-motion";
import { WorkspaceExample } from "./components/landing-example";

async function AccountAction({ compact = false }: { compact?: boolean }) {
  await connection();
  const session = await getServerSession(authOptions);
  return session?.user ? (
    <Link
      className={`landing-button ${compact ? "landing-button-compact" : ""}`}
      href="/workspace"
    >
      Open workspace <span aria-hidden="true">→</span>
    </Link>
  ) : (
    <LandingConnect compact={compact} />
  );
}
function Connect({ compact = false }: { compact?: boolean }) {
  return (
    <Suspense fallback={<LandingConnect compact={compact} />}>
      <AccountAction compact={compact} />
    </Suspense>
  );
}
const features = [
  {
    icon: "profile",
    title: "Update your public details",
    text: "Edit your bio, links, and profile information.",
  },
  {
    icon: "readme",
    title: "Create your profile introduction",
    text: "Start with a template or import a README you like. Customize it with your skills, projects, and links.",
  },
  {
    icon: "activity",
    title: "Generate custom commit history",
    text: "Choose dates and activity preferences, inspect the schedule, and publish to a private repository.",
    note: "Generated history is synthetic. Contribution visibility depends on GitHub’s rules.",
  },
] as const;
const faqs = [
  [
    "What is a profile README?",
    "A profile README is the introduction displayed on your GitHub profile. It lives in a public repository with the same name as your username. GitHubKit helps you create, import, preview, and publish it.",
  ],
  [
    "Will connecting change my account immediately?",
    "No. Connecting authorizes GitHub access. You choose what to edit and review your changes before publishing. Previewing content does not publish it.",
  ],
  [
    "Will generated commits appear on my contribution graph?",
    "GitHubKit generates synthetic commit history. GitHub decides whether commits qualify as contributions, including requirements around the author email, branch, and repository. Private contribution visibility also depends on your GitHub settings.",
  ],
  [
    "Will my drafts survive a refresh?",
    "Profile and README drafts can be recovered in the same browser tab when browser storage is available. They are not a permanent backup. Activity settings reset on refresh; unfinished uploads retain a recovery receipt when browser storage is available.",
  ],
];

export default function Home() {
  return (
    <LandingMotion>
      <a className="landing-skip" href="#landing-content">
        Skip to content
      </a>
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <Link href="/" className="landing-brand" aria-label="GitHubKit home">
            <WorkspaceIcon name="forge" />
            GitHubKit
          </Link>
          <nav aria-label="Main navigation">
            <a href="#features">What you can do</a>
            <a href="#github-access">GitHub access</a>
            <Connect compact />
          </nav>
        </div>
      </header>
      <main id="landing-content">
        <section className="landing-hero" aria-labelledby="hero-title">
          <div className="landing-container">
            <p className="landing-eyebrow">Your GitHub. Your identity.</p>
            <h1 id="hero-title">
              Make your GitHub profile
              <br className="landing-desktop-break" /> your own.
            </h1>
            <p className="landing-hero-description">
              Update your profile, build a personalized README, and generate
              <br className="landing-desktop-break" /> custom commit history
              from one workspace.
            </p>
            <div className="landing-hero-action">
              <Connect />
              <p>You’ll review changes before publishing them.</p>
            </div>
            <div className="landing-preview-stage">
              <WorkspaceExample />
            </div>
            <p className="landing-example-caption">
              One workspace. Choose what you want to work on.
            </p>
          </div>
        </section>
        <div className="landing-container">
          <section
            className="landing-features"
            id="features"
            aria-labelledby="features-title"
          >
            <h2 id="features-title">Bring your GitHub profile together.</h2>
            <div className="landing-feature-grid">
              {features.map((feature) => (
                <article key={feature.icon}>
                  <WorkspaceIcon name={feature.icon} />
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                  {"note" in feature && <small>{feature.note}</small>}
                </article>
              ))}
            </div>
          </section>
          <section className="landing-steps" aria-labelledby="steps-title">
            <h2 id="steps-title">From your first edit to your next publish.</h2>
            <ol>
              {[
                [
                  "Connect your account",
                  "Authorize GitHub access to get started.",
                ],
                [
                  "Customize your content",
                  "Work on the parts of your profile you choose.",
                ],
                [
                  "Review and publish",
                  "Check the changes before sending them to GitHub.",
                ],
              ].map(([title, text], index) => (
                <li key={title}>
                  <span className="landing-step-number">0{index + 1}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section
            className="landing-access"
            id="github-access"
            aria-labelledby="access-title"
          >
            <h2 id="access-title">Know what you’re connecting.</h2>
            <div className="landing-access-grid">
              <div className="landing-access-list">
                <AccessItem kind="profile" title="Profile access">
                  GitHubKit requests permission to update your profile.
                </AccessItem>
                <AccessItem kind="repository" title="Repository access">
                  The requested repository permission includes public and
                  private repositories.
                </AccessItem>
                <AccessItem kind="eye" title="Clear visibility">
                  Profile READMEs use a public repository. Generated activity
                  uses a new private repository.
                </AccessItem>
                <AccessItem kind="file" title="You choose when to publish">
                  Connecting does not automatically publish changes.
                </AccessItem>
              </div>
              <AccessDiagram />
            </div>
            <p className="landing-access-note">
              <span aria-hidden="true">ⓘ</span>Generated commits are synthetic.
              GitHub determines contribution eligibility.
            </p>
          </section>
          <section
            className="landing-faq"
            id="help"
            aria-labelledby="faq-title"
          >
            <h2 id="faq-title">A few things to know.</h2>
            <div className="landing-faq-list">
              {faqs.map(([question, answer]) => (
                <details key={question}>
                  <summary>
                    {question}
                    <span aria-hidden="true" />
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </section>
          <section className="landing-final" aria-labelledby="final-title">
            <h2 id="final-title">Your GitHub. Your identity.</h2>
            <Connect />
            <p>Review your changes before publishing.</p>
          </section>
          <section className="landing-creator" aria-labelledby="creator-title">
            <div>
              <h2 id="creator-title">
                Built by{" "}
                <a
                  href={creator.portfolio}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {creator.name}
                </a>
              </h2>
              <p>
                Have a project in mind? Explore my work and connect with me.
              </p>
            </div>
            <CreatorLinks />
          </section>
        </div>
      </main>
      <footer className="landing-footer">
        <div className="landing-container">
          <Link href="/" className="landing-brand">
            <WorkspaceIcon name="forge" />
            GitHubKit
          </Link>
          <nav aria-label="Footer">
            <a href="#github-access">GitHub access &amp; privacy</a>
            <a href="#help">Help</a>
            <span>Independent of GitHub.</span>
          </nav>
        </div>
      </footer>
    </LandingMotion>
  );
}

function AccessItem({
  kind,
  title,
  children,
}: {
  kind: "profile" | "repository" | "eye" | "file";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="landing-access-item">
      <AccessIcon kind={kind} />
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </div>
  );
}
function AccessIcon({
  kind,
}: {
  kind: "profile" | "repository" | "eye" | "file";
}) {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "profile" && (
        <>
          <circle cx="12" cy="6" r="4" />
          <path d="M4 22v-3a8 8 0 0 1 16 0v3" />
        </>
      )}
      {kind === "repository" && (
        <>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" />
        </>
      )}
      {kind === "eye" && (
        <>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
      {kind === "file" && (
        <>
          <path d="M14 2H5v20h14V7Z M14 2v5h5" />
        </>
      )}
    </svg>
  );
}
function AccessDiagram() {
  return (
    <div
      className="landing-access-diagram"
      role="img"
      aria-label="GitHub access connects profile information and repositories to a public README repository and a private generated activity repository."
    >
      <svg
        className="landing-diagram-lines"
        viewBox="0 0 400 280"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M90 54v34q0 12 12 12h98M310 54v34q0 12-12 12H200M200 180H102q-12 0-12 12v34M200 180h98q12 0 12 12v34"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
      <div className="landing-diagram-node">
        <AccessIcon kind="profile" />
        <span>
          Your profile
          <br />
          information
        </span>
      </div>
      <div className="landing-diagram-node">
        <AccessIcon kind="repository" />
        <span>
          Your repositories
          <br />
          (including private)
        </span>
      </div>
      <div className="landing-diagram-lock">
        <svg
          width="74"
          height="70"
          viewBox="0 0 74 70"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M16 34V23a21 21 0 0 1 42 0v11"
            stroke="currentColor"
            strokeWidth="8"
          />
        </svg>
        <div>
          <GitHubMark />
        </div>
      </div>
      <div className="landing-diagram-node">
        <AccessIcon kind="eye" />
        <span>
          Public README
          <br />
          repository
        </span>
      </div>
      <div className="landing-diagram-node">
        <WorkspaceIcon name="forge" />
        <span>
          Generated activity
          <br />
          (private repository)
        </span>
      </div>
    </div>
  );
}
