"use client";
import { useState } from "react";
import { signIn, signOut } from "next-auth/react";
export function AuthButton({ logout = false }: { logout?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function handleClick() {
    setPending(true);
    setError(false);
    try {
      if (logout) await signOut({ callbackUrl: "/login" });
      else await signIn("github", { callbackUrl: "/dashboard" });
    } catch {
      setError(true);
      setPending(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className="rounded-lg bg-zinc-900 px-5 py-3 font-medium text-white transition hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900 disabled:opacity-60"
      >
        {pending
          ? "Please wait…"
          : logout
            ? "Sign out"
            : "Continue with GitHub"}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          Something went wrong. Please try again.
        </p>
      )}
    </div>
  );
}
