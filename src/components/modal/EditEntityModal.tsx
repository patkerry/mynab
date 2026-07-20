"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ModalShell } from "./ModalShell";
import { useToast } from "../toast/ToastContext";
import type { ActionResult } from "@/app/(app)/budget/actions";

// Shared rename + delete dialog for a category or group. Rename via Save; delete via a destructive
// button with a two-step in-modal confirm. A blocked delete (block-if-in-use) shows the reason as a
// toast and keeps the modal open.
export function EditEntityModal({
  close,
  title,
  label,
  placeholder,
  initialName,
  deleteLabel,
  onRename,
  onDelete,
}: {
  close: () => void;
  title: string;
  label: string;
  placeholder: string;
  initialName: string;
  deleteLabel: string;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<ActionResult>;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState(initialName);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onRename(trimmed);
    close();
  };

  const del = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    const res = await onDelete();
    setBusy(false);
    if (!res.ok) {
      showToast(res.reason);
      setConfirming(false);
      return;
    }
    close();
  };

  return (
    <ModalShell title={title} close={close} onSave={save} saveLabel="Save">
      <div className="field">
        <label>{label}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} autoFocus />
      </div>
      <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
        <button
          className="btn btn-ghost"
          onClick={del}
          disabled={busy}
          style={{ color: "var(--negInk)", borderColor: confirming ? "var(--neg)" : undefined }}
        >
          <Trash2 size={15} /> {confirming ? "Confirm delete" : deleteLabel}
        </button>
      </div>
    </ModalShell>
  );
}
