"use client";

import { useEffect, useRef, useState } from "react";
import type { CalendarInput } from "@/lib/commit-calendar";
import type { PublishResult, PublishStep } from "@/lib/github-publish";
import { signIn } from "next-auth/react";
import { WorkspaceDialog } from "./workspace-dialog";

const storageKey = "git-forge-publish-v1";
type Operation = { receipt: string; fullName: string; count: number };
const steps: Record<PublishStep, string> = {
  checking: "Checking GitHub access and repository…",
  generating: "Generating and verifying the selected history…",
  creating: "Preparing the private repository…",
  uploading: "Uploading Git history…",
  verifying: "Verifying the uploaded commit…",
};

export function ActivityPublish({
  input,
  total,
  activeDays,
  available,
  owner,
  onBusy,
}: {
  input: CalendarInput | null;
  total: number;
  activeDays: number;
  available: boolean;
  owner: string;
  onBusy: (busy: boolean) => void;
}) {
  const [operation, setOperation] = useState<Operation | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [reconnect, setReconnect] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [review, setReview] = useState<{
    input: CalendarInput;
    total: number;
    activeDays: number;
  } | null>(null);
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

  async function publish(selected: CalendarInput | null = null) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    setResult(null);
    setReconnect(false);
    const request = new AbortController();
    controller.current = request;
    try {
      let current = operation;
      if (!current) {
        if (!selected) throw new Error("Wait for a valid calendar preview.");
        setStatus(steps.checking);
        const response = await fetch("/api/projects/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "prepare", input: selected }),
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
      if (!request.signal.aborted) {
        setBusy(false);
        onBusy(false);
        setReview(null);
      }
    }
  }

  function closeReview() {
    setReview(null);
    onBusy(false);
  }
  const canCreate =
    ready && !busy && !!input && available && total >= 1 && total <= 1000;
  return (
    <div className="activity-publish">
      {!operation && !result && (
        <>
          {input && total > 1000 && (
            <p className="ws-error" role="alert">
              This preview contains {total.toLocaleString()} commits. Reduce the
              date range or annual target to publish up to 1,000.
            </p>
          )}
          {input && total === 0 && (
            <p className="activity-muted">
              Increase the annual target or date range to generate at least one
              commit before creating a repository.
            </p>
          )}
          <div className="activity-create-row">
            <button
              type="button"
              className="ws-button ws-button-primary"
              disabled={!canCreate}
              onClick={() => {
                if (input) {
                  setReview({
                    input: structuredClone(input),
                    total,
                    activeDays,
                  });
                  onBusy(true);
                }
              }}
            >
              Review &amp; create private repository{" "}
              <span aria-hidden="true">→</span>
            </button>
            <div>
              <p>Review the author, dates, and commit total before creating.</p>
              <small>Generating a preview does not change GitHub.</small>
            </div>
          </div>
        </>
      )}
      {operation && !result && (
        <div className="activity-upload-recovery">
          <h3>{busy ? "Creating your activity project" : "Upload recovery"}</h3>
          <p>
            Selected upload: <strong>{operation.fullName}</strong> ·{" "}
            {operation.count} commits. Retries keep the original settings.
          </p>
          <button
            type="button"
            className="ws-button ws-button-primary"
            disabled={!ready || busy}
            onClick={() => void publish()}
          >
            {busy ? "Working…" : "Retry / verify this upload"}
          </button>
        </div>
      )}
      {status && (
        <p className="activity-upload-status" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="ws-error" role="alert">
          {error}
        </p>
      )}
      {reconnect && (
        <button
          className="ws-button"
          type="button"
          onClick={() =>
            void signIn("github", { callbackUrl: "/workspace/activity" })
          }
        >
          Reconnect GitHub
        </button>
      )}
      {result && (
        <div className="activity-upload-success" role="status">
          <h3>✓ Private repository created</h3>
          <p>{result.fullName}</p>
          <p>
            {result.count.toLocaleString()} generated commits uploaded and
            verified.
          </p>
          <a
            className="ws-button ws-button-primary"
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open repository ↗
          </a>
        </div>
      )}
      {operation && !busy && (
        <button
          type="button"
          className="ws-text-button"
          onClick={clearOperation}
        >
          {result
            ? "Start another project"
            : "Discard retry receipt (keeps any GitHub repository)"}
        </button>
      )}
      {review && (
        <WorkspaceDialog
          title="Review your activity project"
          busy={busy}
          onClose={closeReview}
        >
          <dl className="activity-review-details">
            {[
              ["Repository", `${owner}/${review.input.repositoryName}`],
              ["Visibility", "Private"],
              ["Author", review.input.authorName],
              ["Author email", review.input.authorEmail],
              [
                "Date range",
                `${review.input.startDate} → ${review.input.endDate}`,
              ],
              ["Timezone", review.input.timeZone],
              ["Annual target", review.input.annualCommits.toLocaleString()],
              ["Total commits", review.total.toLocaleString()],
              ["Active days", review.activeDays.toLocaleString()],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="activity-muted">
            This will create a new private repository and upload the schedule
            shown in your preview.
          </p>
          {busy && (
            <p role="status" className="activity-upload-status">
              {status || "Preparing your project…"}
            </p>
          )}
          <div className="ws-dialog-actions">
            <button
              type="button"
              className="ws-button"
              disabled={busy}
              onClick={closeReview}
            >
              Back to edit
            </button>
            <button
              type="button"
              className="ws-button ws-button-primary"
              disabled={busy}
              onClick={() => void publish(review.input)}
            >
              {busy ? "Creating…" : "Create private repository"}
            </button>
          </div>
        </WorkspaceDialog>
      )}
    </div>
  );
}
