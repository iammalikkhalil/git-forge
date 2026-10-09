"use client";

import { useEffect, useRef, useState } from "react";
import type { CalendarInput } from "@/lib/commit-calendar";

export function LocalProjectDownload({
  input,
  total,
}: {
  input: CalendarInput;
  total: number;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function generate() {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/projects/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: request.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message ?? "Could not generate the project.");
      }
      const blob = await response.blob();
      if (request.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${input.repositoryName}.tar.gz`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage(
        `${response.headers.get("X-Commit-Count")} commits verified. Download ready (${(Number(response.headers.get("X-Generation-Ms")) / 1000).toFixed(1)}s).`,
      );
    } catch (error) {
      if (!request.signal.aborted)
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not generate the project.",
        );
    } finally {
      controller.current = null;
      if (!request.signal.aborted) setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-zinc-200 p-5">
      <h3 className="font-semibold">Generate project</h3>
      <p className="mt-2 text-sm text-zinc-600">
        Download your README and Git history as a .tar.gz archive. Includes the
        same {total} commits as this preview. Nothing is uploaded to GitHub.
      </p>
      <button
        type="button"
        onClick={generate}
        disabled={busy || total > 1000}
        className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Generating and verifying…" : "Generate & download project"}
      </button>
      {total > 1000 && (
        <p className="mt-2 text-sm text-amber-800">
          Reduce the date range or volume to at most 1,000 total commits.
        </p>
      )}
      <p role="status" className="mt-3 text-sm text-zinc-600">
        {message}
      </p>
    </div>
  );
}
