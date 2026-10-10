"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ProfileReadmeBuilder } from "@/app/components/profile-readme-builder";
import { GitHubProfileSetup } from "@/app/components/github-profile-setup";
import type { GitHubProfile } from "@/lib/github-profile-schema";

export function DashboardTools({ children }: { children: ReactNode }) {
  const [active, setActive] = useState("profile");
  const [readmeVisited, setReadmeVisited] = useState(false);
  const [handoff, setHandoff] = useState<{
    profile: GitHubProfile;
    skills: string;
  } | null>(null);
  const [readmeVersion, setReadmeVersion] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      const tab = window.location.hash.slice(1);
      if (["profile", "readme", "activity"].includes(tab)) setActive(tab);
      if (tab === "readme") setReadmeVisited(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <>
      <nav
        aria-label="Dashboard tools"
        className="mt-8 flex flex-wrap gap-2 border-b border-zinc-200 pb-3"
      >
        {[
          ["profile", "GitHub Profile"],
          ["readme", "Profile README"],
          ["activity", "Activity Generator"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={active === id}
            onClick={() => {
              setActive(id);
              if (id === "readme") setReadmeVisited(true);
              window.history.replaceState(null, "", `#${id}`);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${active === id ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      <div hidden={active !== "profile"}>
        <GitHubProfileSetup
          onContinue={(profile, skills) => {
            setHandoff({ profile, skills });
            setReadmeVersion((version) => version + 1);
            setReadmeVisited(true);
            setActive("readme");
            window.history.replaceState(null, "", "#readme");
          }}
        />
      </div>
      <div hidden={active !== "activity"} className="mx-auto max-w-xl">
        {children}
      </div>
      <div hidden={active !== "readme"}>
        {readmeVisited && (
          <ProfileReadmeBuilder key={readmeVersion} handoff={handoff} />
        )}
      </div>
    </>
  );
}
