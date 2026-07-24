"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, Plus, Split as SplitIcon, X } from "lucide-react";
import { TXN_GRID, fmt, parseMoney } from "@/lib/format";
import { validateSplitDraft, type SplitLineDraft } from "@/lib/splits";
import { useToast } from "./toast/ToastContext";
import type { Account, Category } from "@/generated/prisma-postgres/client";
import type { TxnDraft } from "@/lib/types";
import styles from "./TxnEditorRow.module.css";

const blankLine = (): SplitLineDraft => ({ categoryId: "", amount: "", memo: "" });

export function TxnEditorRow({
  accounts,
  categories,
  initial,
  allowTransfer = true,
  saveLabel = "Save",
  onSubmit,
  onClose,
}: {
  accounts: Account[];
  categories: Category[];
  initial: TxnDraft;
  allowTransfer?: boolean;
  // Label for the confirm button — e.g. "Approve" when saving approves a pending imported row.
  saveLabel?: string;
  onSubmit: (draft: TxnDraft) => Promise<boolean>;
  onClose: () => void;
}) {
  const [date, setDate] = useState(initial.date);
  const [payee, setPayee] = useState(initial.payee);
  // "income" | "" (uncategorized) | "transfer:<accountId>" | "split" | real category id
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [accountId, setAccountId] = useState(initial.accountId || accounts[0]?.id || "");
  const [amount, setAmount] = useState(initial.amount);
  const [memo, setMemo] = useState(initial.memo || "");
  const [err, setErr] = useState(false);
  // In-flight guard: a fast double-click on Save must not fire the action twice (a transfer
  // add would create two leg pairs — there's no server-side idempotency token).
  const [busy, setBusy] = useState(false);
  // Split-mode state: unsigned per-line drafts + one direction toggle that signs them all
  // (mixed-sign splits are out of scope — one bank movement has one direction).
  const [lines, setLines] = useState<SplitLineDraft[]>(initial.splits?.length ? initial.splits : [blankLine(), blankLine()]);
  const [direction, setDirection] = useState<"inflow" | "outflow">(initial.splitDirection ?? "outflow");

  const isIncome = categoryId === "income";
  const isTransfer = categoryId.startsWith("transfer:");
  const isSplit = categoryId === "split";
  const accountType = accounts.find((a) => a.id === accountId)?.type;
  // RTA (income) split lines are forbidden on credit cards — see validateSplitDraft.
  const allowRtaLine = accountType !== "CREDIT";

  // Left to allocate across lines; Save stays disabled until it's exactly zero.
  const remainderCents = isSplit ? parseMoney(amount) - lines.reduce((s, l) => s + parseMoney(l.amount), 0) : 0;

  const { showToast } = useToast();
  const rowRef = useRef<HTMLDivElement>(null);

  // Clicking anywhere outside the editor closes it back to a static row, same as Escape —
  // it doesn't silently save a possibly-incomplete edit.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const setLine = (i: number, patch: Partial<SplitLineDraft>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((prev) => (prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev));

  const fail = (reason: string) => {
    showToast(reason);
    setErr(true);
    setTimeout(() => setErr(false), 1200);
  };

  const submit = async () => {
    // Checked client-side (in addition to the server-side guard in addTransaction) so the
    // user gets an immediate, specific reason instead of a generic error border after a
    // round-trip — the destination account list includes the source account itself, since
    // "transfer to any other account" doesn't exclude the one currently selected.
    if (isTransfer && categoryId.slice(9) === accountId) {
      return fail("Can't transfer an account to itself — pick a different destination account.");
    }
    // A NORMAL transaction needs a category to be saved/approved — enforced server-side in
    // addTransaction/updateTransaction too; checked here so the user gets an immediate, specific
    // reason instead of a generic error border after a round-trip. Income and transfers are exempt.
    if (!isIncome && !isTransfer && !isSplit && categoryId === "") {
      return fail("Add a category before approving this transaction.");
    }
    if (isSplit) {
      // The exact validator the server runs (resolveSplitValidation) — same rules, immediate reason.
      // `categories` is already payment-category-free (the picker never offers them), so the
      // payment set here is empty; the server still checks against the real set.
      const v = validateSplitDraft({
        lines,
        direction,
        parentAmount: amount,
        accountType: accountType ?? "CHECKING",
        paymentCategoryIds: new Set(),
        validCategoryIds: new Set(categories.map((c) => c.id)),
      });
      if (!v.ok) return fail(v.reason);
    }
    if (busy) return;
    setBusy(true);
    try {
      const ok = await onSubmit({ date, payee, categoryId, accountId, amount, memo, splits: isSplit ? lines : undefined, splitDirection: isSplit ? direction : undefined });
      if (ok) {
        onClose();
        return;
      }
      setErr(true);
      setTimeout(() => setErr(false), 1200);
    } catch {
      // A thrown action (network drop, suspended session) previously became an unhandled
      // rejection with a dead-looking button; surface it instead.
      showToast("Couldn't save — check your connection and try again.");
      setErr(true);
      setTimeout(() => setErr(false), 1200);
    } finally {
      setBusy(false);
    }
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === "Enter") submit();
    if (e.key === "Escape") onClose();
  };

  return (
    <div ref={rowRef} onKeyDown={key} className={`${styles.wrap} ${err ? styles.errored : ""}`}>
      <div className={styles.row} style={{ gridTemplateColumns: TXN_GRID }}>
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
        <div className={styles.catCell}>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={styles.input}>
            <option value="income">Inflow: Ready to Assign</option>
            <option value="">Uncategorized</option>
            <option value="split">Split across categories…</option>
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
          {/* The obvious affordance — same state as the dropdown's "Split…" option, just visible.
              Toggling off returns to Uncategorized so the user re-picks a single category. */}
          <button
            type="button"
            onClick={() => setCategoryId(isSplit ? "" : "split")}
            title={isSplit ? "Un-split — back to a single category" : "Split across categories"}
            className={isSplit ? `${styles.splitToggle} ${styles.splitToggleActive}` : styles.splitToggle}
          >
            <SplitIcon size={14} strokeWidth={2.4} />
          </button>
        </div>
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
          style={{ color: isIncome || (isSplit && direction === "inflow") ? "var(--posInk)" : "var(--ink)" }}
        />
        <div className={styles.actions}>
          <button onClick={submit} disabled={busy || (isSplit && remainderCents !== 0)} title={`${saveLabel} (Enter)`} className={styles.saveBtn}>
            <Check size={15} strokeWidth={3} /> {saveLabel}
          </button>
          <button onClick={onClose} title="Cancel (Esc)" className={`${styles.iconBtn} ${styles.cancel}`}>
            <X size={17} />
          </button>
        </div>
      </div>

      {isSplit && (
        <div className={styles.splitBlock}>
          {lines.map((l, i) => (
            <div key={i} className={styles.splitLine}>
              <select value={l.categoryId} onChange={(e) => setLine(i, { categoryId: e.target.value })} className={styles.input}>
                <option value="">Pick a category…</option>
                {allowRtaLine && <option value="income">Inflow: Ready to Assign</option>}
                <optgroup label="Category">
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              </select>
              <input value={l.memo || ""} onChange={(e) => setLine(i, { memo: e.target.value })} placeholder="Memo" className={styles.input} />
              <input
                value={l.amount}
                onChange={(e) => setLine(i, { amount: e.target.value })}
                placeholder="0.00"
                className={`num ${styles.input} ${styles.amount}`}
              />
              <button
                onClick={() => removeLine(i)}
                disabled={lines.length <= 2}
                title={lines.length <= 2 ? "A split needs at least two lines" : "Remove line"}
                className={`${styles.iconBtn} ${styles.lineRemove}`}
              >
                <X size={15} />
              </button>
            </div>
          ))}
          <div className={styles.splitFooter}>
            <button onClick={() => setLines((prev) => [...prev, blankLine()])} className={styles.addLineBtn}>
              <Plus size={14} /> Add line
            </button>
            <div className={styles.directionToggle}>
              <button onClick={() => setDirection("outflow")} className={direction === "outflow" ? styles.dirActive : styles.dirBtn}>
                Outflow
              </button>
              <button onClick={() => setDirection("inflow")} className={direction === "inflow" ? styles.dirActive : styles.dirBtn}>
                Inflow
              </button>
            </div>
            <span className={`num ${styles.remainder}`} style={{ color: remainderCents === 0 ? "var(--pos)" : "var(--neg)" }}>
              {remainderCents === 0 ? "✓ fully allocated" : `${fmt(Math.abs(remainderCents))} ${remainderCents > 0 ? "left to allocate" : "over-allocated"}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
