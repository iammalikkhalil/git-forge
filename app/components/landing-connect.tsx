"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";

export function GitHubMark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2.08c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.64-1.25-1.64-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.71 2.63 1.22 3.27.93.1-.72.39-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.57 0-1.23.44-2.24 1.16-3.03-.12-.29-.5-1.43.11-2.97 0 0 .95-.3 3.08 1.15a10.7 10.7 0 0 1 5.61 0c2.14-1.45 3.08-1.15 3.08-1.15.61 1.54.23 2.68.11 2.97.72.79 1.16 1.8 1.16 3.03 0 4.33-2.63 5.28-5.14 5.56.4.35.76 1.03.76 2.08v3.08c0 .3.2.65.77.54A11.2 11.2 0 0 0 12 .8Z" />
    </svg>
  );
}
export function LandingConnect({ compact = false }: { compact?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div className="landing-connect">
      <button
        type="button"
        className={`landing-button ${compact ? "landing-button-compact" : ""}`}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(false);
          try {
            await signIn("github", { callbackUrl: "/workspace" });
          } catch {
            setPending(false);
            setError(true);
          }
        }}
      >
        <GitHubMark />
        {pending ? "Connecting…" : "Connect GitHub"}
      </button>
      {error && (
        <p role="alert" className="landing-connect-error">
          Could not connect. Please try again.
        </p>
      )}
    </div>
  );
}
