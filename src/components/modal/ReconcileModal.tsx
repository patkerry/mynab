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
      // Re-checked server-side in case something changed (e.g. a pending row) between opening this
      // dialog and submitting — refuses rather than adjusting against a half-reviewed account.
      showToast(result.reason);
      return;
    }
    showToast(
      result.adjustmentCents === 0
        ? "Balance already matches — nothing to adjust."
        : `Added a ${fmt(result.adjustmentCents)} adjustment so this account matches your bank.`,
      "success"
    );
    close();
  };

  return (
    <>
      <div className={m.head}>
        <h3 className={m.title}>Adjust balance · {accountName}</h3>
        <button onClick={close} className={m.close}>
          <X size={19} />
        </button>
      </div>
      <div className={m.body}>
        <div className="field">
          <label>Balance in the app</label>
          <div className={`num ${styles.balanceValue}`}>{fmt(currentBalanceCents)}</div>
        </div>
        <div className="field">
          <label htmlFor="f-your-actual-bank-balance">Your actual bank balance</label>
          <input id="f-your-actual-bank-balance" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="0.00" className="num" autoFocus />
        </div>
        <p className="hint">
          {diffCents === 0
            ? "These match — nothing to adjust."
            : `Off by ${fmt(Math.abs(diffCents))}. We'll add an adjustment transaction so the app matches your bank.`}
        </p>
      </div>
      <div className={m.footer}>
        <button className="btn btn-ghost" onClick={close}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Adjusting…" : "Adjust balance"}
        </button>
      </div>
    </>
  );
}
