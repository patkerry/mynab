"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./modal.module.css";

export function ModalShell({
  title,
  children,
  onSave,
  close,
  saveLabel = "Save",
}: {
  title: string;
  children: ReactNode;
  onSave?: () => void | Promise<void>;
  close: () => void;
  saveLabel?: string;
}) {
  // In-flight guard for EVERY modal's save: on a slow server (Render free-tier cold start) an
  // action can take seconds, and repeated clicks fired it repeatedly — a real user triple-added
  // an account this way. Disable + swallow re-clicks until the handler settles.
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy || !onSave) return;
    setBusy(true);
    try {
      await onSave();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={styles.head}>
        <h3 className={styles.title}>{title}</h3>
        <button onClick={close} className={styles.close}>
          <X size={19} />
        </button>
      </div>
      <div className={styles.body}>{children}</div>
      <div className={styles.footer}>
        <button className="btn btn-ghost" onClick={close}>
          Cancel
        </button>
        {onSave && (
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : saveLabel}
          </button>
        )}
      </div>
    </>
  );
}
