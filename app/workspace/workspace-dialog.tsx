"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

let openDialogs = 0;
let previousOverflow = "";

export function WorkspaceDialog({
  title,
  children,
  busy = false,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  busy?: boolean;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const element = dialog.current;
    const focus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    element?.showModal();
    if (openDialogs === 0) previousOverflow = document.body.style.overflow;
    openDialogs += 1;
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      openDialogs -= 1;
      if (openDialogs === 0) document.body.style.overflow = previousOverflow;
      if (focus?.isConnected) focus.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`ws-dialog ${wide ? "ws-dialog-wide" : ""}`}
      aria-labelledby={heading}
      onClick={(event) => {
        if (busy || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="ws-dialog-heading">
        <h2 id={heading}>{title}</h2>
        <button
          type="button"
          className="ws-button"
          aria-label={`Close ${title}`}
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
