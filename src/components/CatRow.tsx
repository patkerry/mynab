"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Target } from "lucide-react";
import { fmt, parseMoney } from "@/lib/format";
import { goalProgress, type Derived, type CatBreakdown } from "@/lib/budget";
import { setAssigned } from "@/app/budget/actions";
import { useModal } from "./modal/ModalContext";
import type { Category } from "@/generated/prisma/client";

export function CatRow({
  c,
  month,
  derived,
  breakdown,
}: {
  c: Category;
  month: string;
  derived: Derived;
  breakdown?: CatBreakdown;
}) {
  const { openModal } = useModal();
  const assigned = derived.assignedIn(c.id, month);
  const activity = derived.activityIn(c.id, month);
  const avail = derived.available(c.id, month);
  const [draft, setDraft] = useState((assigned / 100).toFixed(2));

  useEffect(() => {
    setDraft(assigned ? (assigned / 100).toFixed(2) : "");
  }, [assigned, month]);

  const goalInfo = goalProgress(c, assigned, avail);
  const goalLabel = goalInfo
    ? c.goalType === "MONTHLY"
      ? `${fmt(assigned)} of ${fmt(c.goalAmountCents)}/mo`
      : `${fmt(avail)} of ${fmt(c.goalAmountCents)} target`
    : null;

  const availColor =
    avail < 0
      ? { color: "var(--negInk)", background: "var(--negSoft)" }
      : avail === 0
        ? { color: "var(--ink3)", background: "var(--paper)" }
        : { color: "var(--posInk)", background: "var(--posSoft)" };

  const commit = () => {
    setAssigned(c.id, month, parseMoney(draft));
  };

  return (
    <div
      className="row-hover"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 132px 120px 120px",
        gap: 8,
        padding: "10px 14px",
        alignItems: "center",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link
            // Payment categories are never a transaction's own categoryId (see the
            // isPaymentCategory guard in accounts/actions.ts), so filtering the register by
            // this category's id would always show zero rows — link to the linked card's
            // register instead, which is what a user actually wants to inspect here.
            href={c.linkedAccountId ? `/accounts?account=${c.linkedAccountId}&category=all` : `/accounts?account=all&category=${c.id}`}
            title="View transactions"
            className="cat-name"
            style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", padding: 0, textAlign: "left" }}
          >
            {c.name}
          </Link>
          <button
            onClick={() => openModal({ type: "goal", cat: c })}
            title="Set goal"
            style={{ display: "grid", placeItems: "center", color: c.goalType ? "var(--accent)" : "var(--ink3)", opacity: c.goalType ? 1 : 0.55 }}
          >
            <Target size={13} />
          </button>
        </div>
        {goalInfo && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
            <div style={{ flex: 1, maxWidth: 150, height: 4, borderRadius: 999, background: "var(--line)", overflow: "hidden" }}>
              <div style={{ width: goalInfo.pct + "%", height: "100%", background: goalInfo.met ? "var(--pos)" : "var(--warn)" }} />
            </div>
            <span style={{ fontSize: 10.5, color: goalInfo.met ? "var(--posInk)" : "var(--warn)", fontWeight: 600, whiteSpace: "nowrap" }}>
              {goalLabel}
            </span>
          </div>
        )}
        {breakdown && (breakdown.sources.length > 0 || breakdown.paymentsCount > 0) && (
          <div style={{ fontSize: 10.5, color: "var(--ink3)", marginTop: 4 }}>
            {breakdown.sources.map((s) => `${s.name} ${fmt(s.amount)}`).join(", ")}
            {breakdown.sources.length > 0 && breakdown.paymentsCount > 0 && " · "}
            {breakdown.paymentsCount > 0 &&
              `${breakdown.paymentsCount} payment${breakdown.paymentsCount > 1 ? "s" : ""} ${fmt(breakdown.paymentsTotal)}`}
          </div>
        )}
      </div>
      <div style={{ textAlign: "right" }}>
        <input
          className="assign-in num"
          value={draft}
          placeholder="0.00"
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      </div>
      <span className="num" style={{ textAlign: "right", fontSize: 13.5, color: activity ? "var(--ink)" : "var(--ink3)" }}>
        {fmt(activity)}
      </span>
      <div style={{ textAlign: "right" }}>
        <span className="pill num" style={availColor}>
          {fmt(avail)}
        </span>
      </div>
    </div>
  );
}
