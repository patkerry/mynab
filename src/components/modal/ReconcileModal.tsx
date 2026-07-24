"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { reconcileAccount } from "@/app/(app)/accounts/actions";
import { fmt, parseMoney } from "@/lib/format";
import { useToast } from "../toast/ToastContext";
import m from "./modal.module.css";
import styles from "./ReconcileModal.module.css";

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
      <div className={m.head}>
        <h3 className={m.title}>Reconcile · {accountName}</h3>
        <button onClick={close} className={m.close}>
          <X size={19} />
        </button>
      </div>
      <div className={m.body}>
        <div className="field">
          <label>Tracked balance</label>
          <div className={`num ${styles.balanceValue}`}>{fmt(currentBalanceCents)}</div>
        </div>
        <div className="field">
          <label>Actual statement balance</label>
          <input value={actual} onChange={(e) => setActual(e.target.value)} placeholder="0.00" className="num" autoFocus />
        </div>
        <p className="hint">
          {diffCents === 0
            ? "Matches — reconciling will just confirm the account, no adjustment needed."
            : `A ${fmt(Math.abs(diffCents))} adjustment transaction will be added to cover the difference.`}
        </p>
      </div>
      <div className={m.footer}>
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
