"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { reconcileAccount } from "@/app/accounts/actions";
import { fmt, parseMoney } from "@/lib/format";
import { useToast } from "../toast/ToastContext";

export function ReconcileModal({
  close,
  accountId,
  accountName,
  currentBalanceCents,
}: {
  close: () => void;
  accountId: string;
  accountName: string;
  currentBalanceCents: number;
}) {
  const [actual, setActual] = useState((currentBalanceCents / 100).toFixed(2));
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const diffCents = parseMoney(actual) - currentBalanceCents;

  const save = async () => {
    setSaving(true);
    const result = await reconcileAccount(accountId, actual);
    setSaving(false);
    if (!result.ok) {
      // Re-checked server-side in case something changed (a transaction added/uncleared in
      // another tab) between opening this modal and hitting Reconcile — still refuses rather
      // than partially reconciling.
      showToast(result.reason);
      return;
    }
    showToast(result.adjustmentCents === 0 ? "Reconciled — no adjustment needed." : `Reconciled — added a ${fmt(result.adjustmentCents)} adjustment.`);
    close();
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
        <h3 style={{ fontWeight: 700, fontSize: 16 }}>Reconcile · {accountName}</h3>
        <button onClick={close} style={{ color: "var(--ink3)" }}>
          <X size={19} />
        </button>
      </div>
      <div style={{ padding: "18px 20px" }}>
        <div className="field">
          <label>Tracked balance</label>
          <div className="num" style={{ fontWeight: 700, fontSize: 15, padding: "6px 0" }}>
            {fmt(currentBalanceCents)}
          </div>
        </div>
        <div className="field">
          <label>Actual statement balance</label>
          <input value={actual} onChange={(e) => setActual(e.target.value)} placeholder="0.00" className="num" autoFocus />
        </div>
        <p style={{ fontSize: 12, color: "var(--ink3)", margin: 0 }}>
          {diffCents === 0
            ? "Matches — reconciling will just confirm the account, no adjustment needed."
            : `A ${fmt(Math.abs(diffCents))} adjustment transaction will be added to cover the difference.`}
        </p>
      </div>
      <div style={{ display: "flex", gap: 10, padding: "0 20px 18px", justifyContent: "flex-end" }}>
        <button className="btn btn-ghost" onClick={close}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Reconciling…" : "Reconcile"}
        </button>
      </div>
    </>
  );
}
