"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Dialog({ title, onClose, children, className = "" }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      else document.querySelector<HTMLElement>("main h1[tabindex]")?.focus();
    };
  }, []);

  return (
    <dialog ref={dialogRef} className={`modal-card modal-dialog ${className}`} aria-labelledby={titleId} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <button className="icon-button modal-close" aria-label="Close dialog" onClick={onClose} autoFocus><X size={18} /></button>
      <h2 id={titleId}>{title}</h2>
      {children}
    </dialog>
  );
}
