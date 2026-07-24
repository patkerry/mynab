"use client";

import { useState } from "react";
import Link from "next/link";
import { Target, Eye, EyeOff, Pencil, GripVertical } from "lucide-react";
import { fmt, parseMoney } from "@/lib/format";
import { goalProgress, type CatBreakdown } from "@/lib/budget";
import { setAssigned, setCategoryHidden } from "@/app/(app)/budget/actions";
import { useModal } from "./modal/ModalContext";
import { useRunAction } from "./useRunAction";
import type { Category } from "@/generated/prisma-postgres/client";
import type { CatMonth } from "@/lib/types";
import styles from "./CatRow.module.css";

export function CatRow({
  c,
  month,
  data,
  breakdown,
  onDragStart,
  onDrop,
}: {
  c: Category;
  month: string;
  // Plain server-computed numbers (see getBudgetPageModel) — no engine on the client.
  data: CatMonth;
  breakdown?: CatBreakdown;
  onDragStart?: () => void;
  onDrop?: () => void;
}) {
  const draggable = !!onDragStart;
  const { openModal } = useModal();
  const run = useRunAction();
  const { assigned, activity, avail, lastAssigned } = data;
  const [draft, setDraft] = useState(assigned ? (assigned / 100).toFixed(2) : "");
  // Re-sync the input when the underlying assignment (or the viewed month) changes — the
  // "adjust state during render" pattern, not an effect: no extra render cascade, and an
  // in-progress keystroke can't be clobbered by an unrelated refresh mid-type.
  const [synced, setSynced] = useState({ assigned, month });
  if (synced.assigned !== assigned || synced.month !== month) {
    setSynced({ assigned, month });
    setDraft(assigned ? (assigned / 100).toFixed(2) : "");
  }

  const goalInfo = goalProgress(c, assigned, avail);
  const goalLabel = goalInfo
    ? c.goalType === "MONTHLY"
      ? `${fmt(assigned)} of ${fmt(c.goalAmountCents)}/mo`
      : `${fmt(avail)} of ${fmt(c.goalAmountCents)} target`
    : null;
  // Overspending overrides goal state on the bar: a funded goal (green) next to a negative
  // Available reads as a contradiction — if the category needs money moved into it, the bar
  // must say so. Green = funded and not overspent, amber = underfunded, rust = overspent.
  const goalBarColor = avail < 0 ? "var(--neg)" : goalInfo?.met ? "var(--pos)" : "var(--warn)";
  const goalTextColor = avail < 0 ? "var(--negInk)" : goalInfo?.met ? "var(--posInk)" : "var(--warn)";

  const availColor =
    avail < 0
      ? { color: "var(--negInk)", background: "var(--negSoft)" }
      : avail === 0
        ? { color: "var(--ink3)", background: "var(--paper)" }
        : { color: "var(--posInk)", background: "var(--posSoft)" };

  const commit = async () => {
    await run(() => setAssigned(c.id, month, parseMoney(draft)));
  };

  // "Last month" reference: what was assigned to this category the previous month. Clicking it
  // copies that amount into this month's assignment (per-row "carry forward"). Reuses setAssigned.
  const fillFromLastMonth = async () => {
    if (lastAssigned <= 0) return;
    setDraft((lastAssigned / 100).toFixed(2));
    await run(() => setAssigned(c.id, month, lastAssigned));
  };

  return (
    <div
      className={`row-hover ${styles.row}`}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragOver={onDrop ? (e) => e.preventDefault() : undefined}
      onDrop={
        onDrop
          ? (e) => {
              e.preventDefault();
              onDrop();
            }
          : undefined
      }
      style={{ opacity: c.isHidden ? 0.6 : 1 }}
    >
      <div className={styles.nameCell}>
        <div className={styles.nameRow}>
          {draggable && (
            <span title="Drag to reorder" className={styles.grip}>
              <GripVertical size={14} />
            </span>
          )}
          <Link
            // Payment categories are never a transaction's own categoryId (see the
            // isPaymentCategory guard in accounts/actions.ts), so filtering the register by
            // this category's id would always show zero rows — link to the linked card's
            // register instead, which is what a user actually wants to inspect here.
            href={c.linkedAccountId ? `/accounts?account=${c.linkedAccountId}&category=all` : `/accounts?account=all&category=${c.id}`}
            title="View transactions"
            className={`cat-name ${styles.name}`}
          >
            {c.name}
          </Link>
          <button
            onClick={() => openModal({ type: "goal", cat: c })}
            title="Set goal"
            className={styles.iconBtn}
            style={{ color: c.goalType ? "var(--accent)" : undefined, opacity: c.goalType ? 1 : 0.55 }}
          >
            <Target size={13} />
          </button>
          {/* Payment categories keep their own always-visible section (see BudgetView) and
              are auto-managed — no hide, rename, or delete affordance. */}
          {!c.linkedAccountId && (
            <>
              <button
                onClick={() => run(() => setCategoryHidden(c.id, !c.isHidden))}
                title={c.isHidden ? "Unhide category" : "Hide category"}
                className={styles.iconBtn}
              >
                {c.isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button
                onClick={() => openModal({ type: "editCategory", cat: c })}
                title="Rename or delete category"
                className={styles.iconBtn}
              >
                <Pencil size={13} />
              </button>
            </>
          )}
        </div>
        {goalInfo && (
          <div className={styles.goalRow}>
            <div className={styles.goalTrack}>
              <div className={styles.goalFill} style={{ width: goalInfo.pct + "%", background: goalBarColor }} />
            </div>
            <span className={styles.goalLabel} style={{ color: goalTextColor }}>
              {goalLabel}
              {avail < 0 && " — overspent"}
            </span>
          </div>
        )}
        {breakdown && (breakdown.sources.length > 0 || breakdown.paymentsCount > 0) && (
          <div className={styles.breakdown}>
            {breakdown.sources.map((s) => `${s.name} ${fmt(s.amount)}`).join(", ")}
            {breakdown.sources.length > 0 && breakdown.paymentsCount > 0 && " · "}
            {breakdown.paymentsCount > 0 &&
              `${breakdown.paymentsCount} payment${breakdown.paymentsCount > 1 ? "s" : ""} ${fmt(breakdown.paymentsTotal)}`}
          </div>
        )}
      </div>
      <div className={styles.cellRight}>
        {lastAssigned > 0 ? (
          <button
            onClick={fillFromLastMonth}
            title={`Assign ${fmt(lastAssigned)} — same as last month`}
            className={`num ${styles.lastBtn}`}
          >
            {fmt(lastAssigned)}
          </button>
        ) : (
          <span className={`num ${styles.lastDash}`}>—</span>
        )}
      </div>
      <div className={styles.cellRight}>
        <input
          aria-label={`Assigned to ${c.name}`}
          className="assign-in num"
          value={draft}
          placeholder="0.00"
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            // Advance to the next category's assign field (all share class "assign-in", rendered in
            // budget order). Focusing the next input blurs this one, so the onBlur commit still fires;
            // on the last field just blur to commit.
            const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input.assign-in"));
            const next = inputs[inputs.indexOf(e.currentTarget) + 1];
            if (next) next.focus();
            else e.currentTarget.blur();
          }}
        />
      </div>
      <span className={`num ${styles.activity}`} style={{ color: activity ? "var(--ink)" : "var(--ink3)" }}>
        {fmt(activity)}
      </span>
      <div className={styles.cellRight}>
        <span className="pill num" style={availColor}>
          {fmt(avail)}
        </span>
      </div>
    </div>
  );
}
