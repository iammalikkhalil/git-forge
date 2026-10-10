"use client";

import Image from "next/image";
import { creator, CreatorLinks } from "../components/creator-links";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

type IconName = "forge" | "profile" | "readme" | "activity";
export function WorkspaceIcon({ name }: { name: IconName }) {
  if (name === "forge")
    return (
      <Image
        src="/brand/githubkit-logo.svg"
        alt=""
        width={24}
        height={24}
        aria-hidden="true"
      />
    );
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "profile" && (
        <>
          <circle cx="12" cy="7" r="4" />
          <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
        </>
      )}
      {name === "readme" && (
        <>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M8 13h8M8 17h6" />
        </>
      )}
      {name === "activity" && (
        <>
          <path d="M4 20v-6M9 20V9M14 20V4M19 20V11" />
        </>
      )}
    </svg>
  );
}

const tabs = [
  { href: "/workspace", label: "My Profile", icon: "profile" },
  { href: "/workspace/readme", label: "My README", icon: "readme" },
  {
    href: "/workspace/activity",
    label: "Generate Activity",
    icon: "activity",
  },
] as const;

export function WorkspaceShell({
  name,
  image,
  children,
}: {
  name: string;
  image?: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [username, setUsername] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const account = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/github-profile", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (
          !controller.signal.aborted &&
          typeof data?.profile?.username === "string"
        )
          setUsername(data.profile.username);
      })
      .catch(() => {
        /* The session name remains available if the profile service is unavailable. */
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!account.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  async function logout() {
    setPending(true);
    setError("");
    try {
      await signOut({ callbackUrl: "/" });
    } catch {
      setError("Could not sign out. Please try again.");
      setPending(false);
    }
  }
  const identity = username ? `@${username}` : name;
  return (
    <div className="workspace">
      <a className="workspace-skip" href="#workspace-content">
        Skip to content
      </a>
      <header className="workspace-header">
        <div className="workspace-container workspace-header-inner">
          <Link
            href="/workspace"
            className="workspace-brand"
            aria-label="GitHubKit workspace"
          >
            <WorkspaceIcon name="forge" />
            <span>GitHubKit</span>
          </Link>
          <div className="workspace-header-account">
            <span className="workspace-connection">
              <span className="workspace-status-dot" />
              <span className="workspace-connection-label">
                Connected to GitHub
              </span>
            </span>
            <div
              ref={account}
              className="workspace-account"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                  setOpen(false);
              }}
            >
              <button
                ref={trigger}
                type="button"
                aria-label={`Account options for ${identity}`}
                className="workspace-account-trigger"
                aria-expanded={open}
                aria-controls="workspace-account-panel"
                onClick={() => setOpen(!open)}
              >
                {image?.startsWith("https://avatars.githubusercontent.com/") ? (
                  <Image
                    src={image}
                    alt=""
                    width={36}
                    height={36}
                    className="workspace-avatar"
                  />
                ) : (
                  <span className="workspace-avatar workspace-avatar-fallback">
                    {name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="workspace-account-name">{identity}</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path d="m4 6 4 4 4-4" />
                </svg>
              </button>
              {open && (
                <div
                  id="workspace-account-panel"
                  className="workspace-account-panel"
                >
                  <p>
                    Signed in as <strong>{identity}</strong>
                  </p>
                  <button
                    className="workspace-menu-action"
                    type="button"
                    disabled={pending}
                    onClick={logout}
                  >
                    {pending ? "Signing out…" : "Sign out"}
                  </button>
                  {error && (
                    <p className="workspace-error" role="alert">
                      {error}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <nav className="workspace-navigation" aria-label="Workspace sections">
        <div className="workspace-container workspace-tabs">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="workspace-tab"
              aria-current={pathname === tab.href ? "page" : undefined}
            >
              <WorkspaceIcon name={tab.icon} />
              <span>{tab.label}</span>
            </Link>
          ))}
        </div>
      </nav>
      <main
        id="workspace-content"
        className="workspace-container workspace-main"
        tabIndex={-1}
      >
        {children}
      </main>
      <footer className="workspace-container workspace-footer">
        <span className="workspace-footer-identity">
          <WorkspaceIcon name="forge" />
          Connected as {identity}
        </span>
        <span>Changes publish only when you confirm.</span>
        <div className="workspace-creator">
          <a href={creator.portfolio} target="_blank" rel="noopener noreferrer">
            Built by {creator.name}
          </a>
          <CreatorLinks />
        </div>
      </footer>
    </div>
  );
}
