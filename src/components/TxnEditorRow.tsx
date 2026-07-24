"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, X } from "lucide-react";
import { TXN_GRID } from "@/lib/format";
import { useToast } from "./toast/ToastContext";
import type { Account, Category } from "@/generated/prisma-postgres/client";
import type { TxnDraft } from "@/lib/types";
import styles from "./TxnEditorRow.module.css";

export function TxnEditorRow({
  accounts,
  categories,
  initial,
  allowTransfer = true,
  onSubmit,
  onClose,
}: {
  accounts: Account[];
  categories: Category[];
  initial: TxnDraft;
  allowTransfer?: boolean;
  onSubmit: (draft: TxnDraft) => Promise<boolean>;
  onClose: () => void;
}) {
  const [date, setDate] = useState(initial.date);
  const [payee, setPayee] = useState(initial.payee);
  // "income" | "" (uncategorized) | "transfer:<accountId>" | real category id
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [accountId, setAccountId] = useState(initial.accountId || accounts[0]?.id || "");
  const [amount, setAmount] = useState(initial.amount);
  const [memo, setMemo] = useState(initial.memo || "");
  const [err, setErr] = useState(false);

  const isIncome = categoryId === "income";
  const isTransfer = categoryId.startsWith("transfer:");

  const { showToast } = useToast();
  const rowRef = useRef<HTMLDivElement>(null);

  // Clicking anywhere outside the row closes it back to a static row, same as Escape —
  // it doesn't silently save a possibly-incomplete edit.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const submit = async () => {
    // Checked client-side (in addition to the server-side guard in addTransaction) so the
    // user gets an immediate, specific reason instead of a generic error border after a
    // round-trip — the destination account list includes the source account itself, since
    // "transfer to any other account" doesn't exclude the one currently selected.
    if (isTransfer && categoryId.slice(9) === accountId) {
      showToast("Can't transfer an account to itself — pick a different destination account.");
      setErr(true);
      setTimeout(() => setErr(false), 1200);
      return;
    }
    // A NORMAL transaction needs a category to be saved/approved — enforced server-side in
    // addTransaction/updateTransaction too; checked here so the user gets an immediate, specific
    // reason instead of a generic error border after a round-trip. Income and transfers are exempt.
    if (!isIncome && !isTransfer && categoryId === "") {
      showToast("Add a category before approving this transaction.");
      setErr(true);
      setTimeout(() => setErr(false), 1200);
      return;
    }
    const ok = await onSubmit({ date, payee, categoryId, accountId, amount, memo });
    if (ok) onClose();
    else {
      setErr(true);
      setTimeout(() => setErr(false), 1200);
    }
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === "Enter") submit();
    if (e.key === "Escape") onClose();
  };

  return (
    <div
      ref={rowRef}
      onKeyDown={key}
      className={`${styles.row} ${err ? styles.errored : ""}`}
      style={{ gridTemplateColumns: TXN_GRID }}
    >
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`num ${styles.input} ${styles.dateInput}`} />
      <input
        value={payee}
        onChange={(e) => setPayee(e.target.value)}
        placeholder={isTransfer ? "—" : isIncome ? "Payer" : "Payee"}
        disabled={isTransfer}
        autoFocus
        className={styles.input}
        style={{ opacity: isTransfer ? 0.5 : 1 }}
      />
      <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={styles.input}>
        <option value="income">Inflow: Ready to Assign</option>
        <option value="">Uncategorized</option>
        <optgroup label="Category">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
        {allowTransfer && (
          <optgroup label="Transfer to">
            {accounts.map((a) => (
              <option key={a.id} value={"transfer:" + a.id}>
                {a.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Memo" className={styles.input} />
      <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={styles.input}>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0.00"
        className={`num ${styles.input} ${styles.amount}`}
        style={{ color: isIncome ? "var(--posInk)" : "var(--ink)" }}
      />
      <div className={styles.actions}>
        <button onClick={submit} title="Save (Enter)" className={`${styles.iconBtn} ${styles.save}`}>
          <Check size={14} strokeWidth={3} />
        </button>
        <button onClick={onClose} title="Cancel (Esc)" className={`${styles.iconBtn} ${styles.cancel}`}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
