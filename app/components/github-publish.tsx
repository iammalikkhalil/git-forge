"use client";

import { useEffect, useRef, useState } from "react";
import type { CalendarInput } from "@/lib/commit-calendar";
import type { PublishResult, PublishStep } from "@/lib/github-publish";
import { AuthButton } from "@/app/components/auth-button";

const storageKey = "git-forge-publish-v1";
type Operation = { receipt: string; fullName: string; count: number };
const steps: Record<PublishStep, string> = {
  checking: "Checking GitHub access and repository…",
  generating: "Generating and verifying the selected history…",
  creating: "Preparing the private repository…",
  uploading: "Uploading Git history…",
  verifying: "Verifying the uploaded commit…",
};

export function GitHubPublish({
  input,
  total,
}: {
  input: CalendarInput | null;
  total: number;
}) {
  const [operation, setOperation] = useState<Operation | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [reconnect, setReconnect] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const check = new AbortController();
    const timer = setTimeout(async () => {
      let saved: Operation | null = null;
      try {
        const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
        if (
          stored &&
          typeof stored.receipt === "string" &&
          stored.receipt.length <= 16000 &&
          typeof stored.fullName === "string" &&
          typeof stored.count === "number"
        )
          saved = stored;
      } catch {
        /* Storage is optional; the receipt remains in React state. */
      }
      if (saved) {
        setStatus("Checking your previous upload…");
        try {
          const response = await fetch("/api/projects/publish", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "status", receipt: saved.receipt }),
            signal: check.signal,
          });
          const data = await response.json();
          if (check.signal.aborted) return;
          if (
            (response.ok && data.state === "missing") ||
            data.code === "EXPIRED" ||
            data.code === "INVALID_RECEIPT"
          ) {
            try {
              sessionStorage.removeItem(storageKey);
            } catch {
              /* Optional storage. */
            }
          } else {
            setOperation(saved);
            if (!response.ok) {
              setError(
                data.message ??
                  "Could not check your previous upload. Retry to verify it.",
              );
              setReconnect(
                data.code === "SIGN_IN" || data.code === "REAUTHORIZE",
              );
            }
          }
        } catch {
          if (!check.signal.aborted) {
            setOperation(saved);
            setError(
              "Could not check your previous upload. Retry to verify it.",
            );
          }
        }
      }
      if (!check.signal.aborted) {
        setStatus("");
        setReady(true);
      }
    }, 0);
    return () => {
      clearTimeout(timer);
      check.abort();
      controller.current?.abort();
    };
  }, []);

  function clearOperation() {
    setOperation(null);
    setResult(null);
    setError("");
    setStatus("");
    setReconnect(false);
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* Optional storage. */
    }
  }

  async function publish() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setResult(null);
    setReconnect(false);
    const request = new AbortController();
    controller.current = request;
    try {
      let current = operation;
      if (!current) {
        if (!input) throw new Error("Wait for a valid calendar preview.");
        setStatus(steps.checking);
        const response = await fetch("/api/projects/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "prepare", input }),
          signal: request.signal,
        });
        const data = await response.json();
        if (!response.ok) {
          setReconnect(data.code === "SIGN_IN" || data.code === "REAUTHORIZE");
          throw new Error(data.message ?? "Unable to prepare upload.");
        }
        current = {
          receipt: data.receipt,
          fullName: data.fullName,
          count: data.count,
        };
        // Persist before external writes, including for a lost response or page reload.
        setOperation(current);
        try {
          sessionStorage.setItem(storageKey, JSON.stringify(current));
        } catch {
          /* Optional storage. */
        }
      }
      setStatus(steps.checking);
      const response = await fetch("/api/projects/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", receipt: current.receipt }),
        signal: request.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        setReconnect(data.code === "SIGN_IN" || data.code === "REAUTHORIZE");
        throw new Error(data.message ?? "Unable to upload project.");
      }
      const reader = response.body?.getReader();
      if (!reader)
        throw new Error(
          "Upload response was interrupted. Retry the same upload.",
        );
      const decoder = new TextDecoder();
      let pending = "";
      let complete = false;
      function handle(line: string) {
        if (!line.trim()) return;
        const event = JSON.parse(line);
        if (event.type === "progress" && Object.hasOwn(steps, event.step))
          setStatus(steps[event.step as PublishStep]);
        if (event.type === "error") {
          setReconnect(
            event.code === "SIGN_IN" || event.code === "REAUTHORIZE",
          );
          throw new Error(event.message);
        }
        if (event.type === "success") {
          complete = true;
          // Only unfinished uploads need a receipt across reloads.
          try {
            sessionStorage.removeItem(storageKey);
          } catch {
            /* Optional storage. */
          }
          setResult(event.result);
          setStatus("Private repository uploaded and verified.");
        }
      }
      try {
        while (true) {
          const { done, value } = await reader.read();
          pending += decoder.decode(value, { stream: !done });
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          for (const line of lines) handle(line);
          if (done) {
            handle(pending);
            break;
          }
        }
        if (!complete)
          throw new Error(
            "Upload response was interrupted. Retry the same upload.",
          );
      } finally {
        reader.releaseLock();
      }
    } catch (failure) {
      if (!request.signal.aborted) {
        setStatus("");
        setError(
          failure instanceof Error
            ? failure.message
            : "Upload failed. Retry the same upload.",
        );
      }
    } finally {
      running.current = false;
      controller.current = null;
      if (!request.signal.aborted) setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-zinc-200 p-5">
      <h3 className="font-semibold">Create on GitHub</h3>
      <p className="mt-2 text-sm text-zinc-600">
        Create a private repository and upload the history from your preview.
      </p>
      {operation && (
        <p className="mt-2 text-sm">
          Selected upload: <strong>{operation.fullName}</strong> ·{" "}
          {operation.count} commits. Retries keep these original settings.
        </p>
      )}
      {!result && (
        <button
          type="button"
          onClick={publish}
          disabled={
            !ready ||
            busy ||
            (!operation && (!input || total < 1 || total > 1000))
          }
          className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy
            ? "Working…"
            : operation
              ? "Retry / verify this upload"
              : "Create private repository"}
        </button>
      )}
      {status && (
        <p role="status" className="mt-3 text-sm text-zinc-600">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {reconnect && (
        <div className="mt-3">
          <AuthButton />
        </div>
      )}
      {result && (
        <p className="mt-3 text-sm">
          <a
            className="font-medium underline underline-offset-4"
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open {result.fullName}
          </a>{" "}
          · {result.count} commits verified.
        </p>
      )}
      {operation && !busy && (
        <button
          type="button"
          onClick={clearOperation}
          className="mt-3 block text-sm underline underline-offset-4"
        >
          {result
            ? "Start another project"
            : "Discard retry receipt (keeps any GitHub repository)"}
        </button>
      )}
    </div>
  );
}
