"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <h3 style={{ fontWeight: 700, fontSize: 16 }}>{title}</h3>
        <button onClick={close} style={{ color: "var(--ink3)" }}>
          <X size={19} />
        </button>
      </div>
      <div style={{ padding: "18px 20px" }}>{children}</div>
      <div style={{ display: "flex", gap: 10, padding: "0 20px 18px", justifyContent: "flex-end" }}>
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
