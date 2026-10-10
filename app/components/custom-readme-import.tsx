"use client";

import { useState } from "react";
import {
  MAX_README_BYTES,
  readmeContentSchema,
} from "@/lib/profile-readme-schema";

const inputClass =
  "mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm";
const buttonClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium disabled:opacity-50";

export function CustomReadmeImport({
  owner,
  name,
  disabled,
  onImport,
}: {
  owner: string;
  name: string;
  disabled: boolean;
  onImport: (content: string) => void;
}) {
  const [source, setSource] = useState("");
  const [link, setLink] = useState("");
  const [oldUsername, setOldUsername] = useState("");
  const [oldName, setOldName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  // Literal, explicit replacements also update usernames inside widget URLs.
  const withUsername = oldUsername.trim()
    ? source.split(oldUsername.trim()).join(owner)
    : source;
  const personalized = oldName.trim()
    ? withUsername.split(oldName.trim()).join(name)
    : withUsername;
  const valid =
    personalized.trim().length > 0 &&
    readmeContentSchema.safeParse(personalized).success;
  function accept(text: string) {
    if (!readmeContentSchema.safeParse(text).success)
      throw new Error("README must be smaller than 100 KB.");
    if (!text.trim()) throw new Error("This README is empty.");
    setSource(text);
    setConfirmed(false);
    setError("");
  }
  async function importLink() {
    setError("");
    setLoading(true);
    try {
      const url = new URL(link.trim());
      const parts = url.pathname.split("/").filter(Boolean);
      if (
        url.protocol !== "https:" ||
        url.hostname !== "github.com" ||
        url.port ||
        url.username ||
        url.password ||
        parts.length < 1 ||
        parts.length > 2 ||
        !parts.every((part) => /^[\w.-]+$/.test(part))
      )
        throw new Error(
          "Use a GitHub profile or repository URL, such as https://github.com/username/username.",
        );
      const username = parts[0];
      const repo = (parts[1] ?? username).replace(/\.git$/, "");
      const response = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo)}/readme`,
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
            ? "No public README found. You can paste Markdown or choose a file instead."
            : "GitHub could not load this README. Try later or paste the Markdown.",
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
      setOldUsername(username);
      setOldName("");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not import this README.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <details className="mt-6 rounded-xl border border-zinc-200 p-4">
      <summary className="cursor-pointer font-semibold">
        Custom README · browse, copy or import
      </summary>
      <fieldset
        disabled={disabled || loading}
        className="mt-4 space-y-4 disabled:opacity-60"
      >
        <p className="text-sm text-zinc-600">
          <a
            className="underline"
            href="https://roypriyanshu02.github.io/awesome-github-profile-readme/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Browse README inspiration ↗
          </a>{" "}
          Then copy the profile/repository URL, copy its raw Markdown, or
          download its README file.
        </p>
        <label className="block text-sm">
          Public GitHub profile or repository URL
          <input
            type="url"
            value={link}
            className={inputClass}
            placeholder="https://github.com/username/username"
            onChange={(event) => setLink(event.target.value)}
          />
        </label>
        <button
          type="button"
          className={buttonClass}
          disabled={!link.trim()}
          onClick={importLink}
        >
          {loading ? "Importing…" : "Import public README"}
        </button>
        <label className="block text-sm">
          Or choose a Markdown file (up to 100 KB)
          <input
            type="file"
            accept=".md,.markdown,text/markdown,text/plain"
            className="mt-2 block w-full text-sm"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setLoading(true);
              try {
                if (file.size > MAX_README_BYTES)
                  throw new Error("README must be smaller than 100 KB.");
                accept(await file.text());
                setOldUsername("");
                setOldName("");
              } catch (failure) {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : "Could not read the file.",
                );
              } finally {
                setLoading(false);
              }
            }}
          />
        </label>
        <label className="block text-sm">
          Paste or edit template Markdown
          <textarea
            value={source}
            rows={10}
            maxLength={MAX_README_BYTES}
            className={`${inputClass} font-mono`}
            spellCheck={false}
            onChange={(event) => {
              setSource(event.target.value);
              setConfirmed(false);
              setError("");
            }}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Replace original username with {owner}
            <input
              value={oldUsername}
              maxLength={100}
              className={inputClass}
              placeholder="Optional original username"
              onChange={(event) => setOldUsername(event.target.value)}
            />
          </label>
          <label className="text-sm">
            Replace original name with {name}
            <input
              value={oldName}
              maxLength={100}
              className={inputClass}
              placeholder="Optional original name"
              onChange={(event) => setOldName(event.target.value)}
            />
          </label>
        </div>
        <p className="text-xs text-zinc-500">
          Replacements are case-sensitive and apply everywhere, including links.
          Review email, bio, projects and images in the editor. Relative asset
          paths may need updating. Keep any attribution required by the source.
        </p>
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          Replace my current editor draft with this custom README.
        </label>
        {!valid && source && (
          <p className="text-sm text-amber-800">
            Enter non-empty Markdown smaller than 100 KB.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="button"
          className={buttonClass}
          disabled={!valid || !confirmed}
          onClick={() => onImport(personalized)}
        >
          Use custom draft & preview
        </button>
        <p className="text-xs text-zinc-500">
          This creates your own editable draft. Review and publish separately to
          update GitHub.
        </p>
      </fieldset>
    </details>
  );
}
