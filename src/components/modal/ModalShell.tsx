"use client";

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
  onSave?: () => void;
  close: () => void;
  saveLabel?: string;
}) {
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
          <button className="btn btn-primary" onClick={onSave}>
            {saveLabel}
          </button>
        )}
      </div>
    </>
  );
}
