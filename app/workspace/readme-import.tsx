"use client";

import { useRef, useState } from "react";
import {
  MAX_README_BYTES,
  readmeContentSchema,
} from "@/lib/profile-readme-schema";
import { ReadmePreview } from "@/app/components/readme-preview";
import { WorkspaceDialog } from "./workspace-dialog";

export function ReadmeImport({
  owner,
  name,
  onClose,
  onImport,
}: {
  owner: string;
  name: string;
  onClose: () => void;
  onImport: (text: string) => void;
}) {
  const [tab, setTab] = useState<"paste" | "file" | "url">("url");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [oldUsername, setOldUsername] = useState("");
  const [oldName, setOldName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const running = useRef(false);
  const personalized = oldName.trim()
    ? (oldUsername.trim() ? text.split(oldUsername.trim()).join(owner) : text)
        .split(oldName.trim())
        .join(name)
    : oldUsername.trim()
      ? text.split(oldUsername.trim()).join(owner)
      : text;
  const valid =
    !!personalized.trim() &&
    readmeContentSchema.safeParse(personalized).success;
  function accept(value: string) {
    if (!readmeContentSchema.safeParse(value).success)
      throw new Error("Use a README smaller than 100 KB.");
    if (!value.trim()) throw new Error("This README is empty.");
    setText(value);
    setReviewed(false);
    setError("");
  }
  async function load(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not import README.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function importUrl() {
    await load(async () => {
      const parsed = new URL(url.trim());
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (
        parsed.protocol !== "https:" ||
        parsed.hostname !== "github.com" ||
        parsed.username ||
        parsed.password ||
        parsed.port ||
        parts.length < 1 ||
        parts.length > 2 ||
        !parts.every((part) => /^[\w.-]+$/.test(part))
      )
        throw new Error(
          "Use a GitHub profile or repository URL, such as https://github.com/username/username.",
        );
      const repo = (parts[1] ?? parts[0]).replace(/\.git$/, "");
      const response = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(repo)}/readme`,
        {
          headers: { Accept: "application/vnd.github+json" },
          credentials: "omit",
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok)
        throw new Error(
          response.status === 404
            ? "No public README found. Try pasting Markdown or uploading a file."
            : "GitHub could not load this README. Try again later.",
        );
      const data = await response.json();
      if (
        data.encoding !== "base64" ||
        typeof data.content !== "string" ||
        data.size > MAX_README_BYTES ||
        data.content.length > 140000
      )
        throw new Error("Use a Markdown README smaller than 100 KB.");
      accept(
        new TextDecoder().decode(
          Uint8Array.from(atob(data.content.replace(/\s/g, "")), (character) =>
            character.charCodeAt(0),
          ),
        ),
      );
    });
  }
  return (
    <WorkspaceDialog title="Import README" wide busy={busy} onClose={onClose}>
      <p className="readme-muted">
        Import into a local draft, preview it, then publish when you’re ready.
      </p>
      <div className="readme-inspiration">
        <a
          className="ws-button"
          href="https://roypriyanshu02.github.io/awesome-github-profile-readme/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Browse README inspiration ↗
        </a>
        <p className="readme-muted">
          Find a profile you like, open it on GitHub, copy its profile URL, and
          paste it below. Load its README, then edit the imported draft with
          your own details.
        </p>
      </div>
      <div
        className="readme-import-tabs readme-segment"
        role="group"
        aria-label="Import source"
      >
        {(
          [
            ["url", "GitHub URL"],
            ["paste", "Paste Markdown"],
            ["file", "Upload .md"],
          ] as const
        ).map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-pressed={tab === id}
            disabled={busy}
            onClick={() => {
              setTab(id);
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <fieldset disabled={busy} className="readme-import-fields">
        <legend className="ws-sr-only">Import source</legend>
        {tab === "paste" && (
          <label className="ws-field">
            Markdown
            <textarea
              className="ws-input readme-import-source"
              spellCheck={false}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setReviewed(false);
              }}
              placeholder="# Your README"
            />
          </label>
        )}
        {tab === "file" && (
          <label className="ws-field">
            Choose a Markdown file
            <input
              className="ws-input"
              type="file"
              accept=".md,.markdown,text/markdown,text/plain"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file)
                  void load(async () => {
                    if (file.size > MAX_README_BYTES)
                      throw new Error("Use a README smaller than 100 KB.");
                    accept(await file.text());
                  });
              }}
            />
            <span className="readme-muted">
              Maximum 100 KB. File contents are previewed before use.
            </span>
          </label>
        )}
        {tab === "url" && (
          <div className="readme-import-url">
            <label className="ws-field">
              Public GitHub profile or repository URL
              <input
                type="url"
                className="ws-input"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://github.com/username/username"
              />
            </label>
            <button
              type="button"
              className="ws-button"
              disabled={!url.trim()}
              onClick={() => void importUrl()}
            >
              Load README
            </button>
          </div>
        )}
        <details className="readme-disclosure">
          <summary>
            Optional personalization <span aria-hidden="true">⌄</span>
          </summary>
          <div className="readme-disclosure-content">
            <p className="readme-muted">
              Literal replacements also change matching text in links and widget
              URLs. Review the result carefully.
            </p>
            <label className="ws-field">
              Original username
              <input
                className="ws-input"
                maxLength={100}
                value={oldUsername}
                onChange={(event) => {
                  setOldUsername(event.target.value);
                  setReviewed(false);
                }}
              />
            </label>
            <label className="ws-field">
              Original name
              <input
                className="ws-input"
                maxLength={100}
                value={oldName}
                onChange={(event) => {
                  setOldName(event.target.value);
                  setReviewed(false);
                }}
              />
            </label>
          </div>
        </details>
      </fieldset>
      {error && (
        <p role="alert" className="ws-error">
          {error}
        </p>
      )}
      {text && !valid && (
        <p className="ws-error" role="alert">
          Your imported README must be nonempty and smaller than 100 KB.
        </p>
      )}
      {valid && (
        <>
          <h3 className="readme-import-preview-title">
            Imported content preview
          </h3>
          <div className="readme-import-preview">
            <ReadmePreview content={personalized} owner={owner} branch="main" />
          </div>
          <label className="readme-checkbox">
            <input
              type="checkbox"
              disabled={busy}
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            I reviewed the content and have permission to use it.
          </label>
        </>
      )}
      <div className="ws-dialog-actions">
        <button
          type="button"
          className="ws-button"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="ws-button ws-button-primary"
          disabled={busy || !valid || !reviewed}
          onClick={() => onImport(personalized)}
        >
          {busy ? "Loading…" : "Use imported draft"}
        </button>
      </div>
    </WorkspaceDialog>
  );
}
