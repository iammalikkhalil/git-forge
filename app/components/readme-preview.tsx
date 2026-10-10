"use client";
/* eslint-disable @next/next/no-img-element -- User-authored Markdown supports arbitrary external image sources. */

import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

export function ReadmePreview({
  content,
  owner,
  branch,
}: {
  content: string;
  owner: string;
  branch: string | null;
}) {
  return (
    <div className="readme-preview overflow-x-auto break-words">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        urlTransform={(url, key) => {
          const safe = defaultUrlTransform(url);
          if (!safe || safe.startsWith("#") || /^[a-z][a-z\d+.-]*:/i.test(safe))
            return safe;
          const base =
            key === "src"
              ? `https://raw.githubusercontent.com/${owner}/${owner}/${encodeURIComponent(branch ?? "main")}/`
              : `https://github.com/${owner}/${owner}/blob/${encodeURIComponent(branch ?? "main")}/`;
          try {
            return new URL(safe, base).href;
          } catch {
            return "";
          }
        }}
        components={{
          a: ({ children, href, title }) => (
            <a
              href={href}
              title={title}
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          img: ({ src, alt, title, width, height }) => (
            <img
              src={src}
              alt={alt ?? ""}
              title={title}
              width={width}
              height={height}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
