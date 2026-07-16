"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Sparkles, Plus, Check } from "lucide-react";
import { computeDerived, computePaymentCategoryBreakdown, type CatBreakdown } from "@/lib/budget";
import { fmt, addMonths, monthLabel, curYM } from "@/lib/format";
import { useModal } from "./modal/ModalContext";
import { autoAssignGoals } from "@/app/budget/actions";
import { CatRow } from "./CatRow";
import type { Account, BudgetEntry, Category, CategoryGroup, Transaction } from "@/generated/prisma/client";

function resolveBreakdown(categoryId: string, categories: Category[], transactions: Transaction[], budgetEntries: BudgetEntry[], accounts: Account[], month: string): CatBreakdown {
  const raw = computePaymentCategoryBreakdown({ accounts, categories, transactions, budgetEntries }, categoryId, month);
  if (!raw) return { sources: [], paymentsTotal: 0, paymentsCount: 0 };
  return {
    sources: raw.breakdown.map((b) => ({
      name: categories.find((c) => c.id === b.sourceCategoryId)?.name || "?",
      amount: b.amount,
    })),
    paymentsTotal: raw.payments.reduce((s, p) => s + p.amount, 0),
    paymentsCount: raw.payments.length,
  };
}

export function BudgetView({
  month,
  groups,
  categories,
  accounts,
  transactions,
  budgetEntries,
}: {
  month: string;
  groups: CategoryGroup[];
  categories: Category[];
  accounts: Account[];
  transactions: Transaction[];
  budgetEntries: BudgetEntry[];
}) {
  const { openModal } = useModal();
  const derived = useMemo(
    () => computeDerived({ accounts, categories, transactions, budgetEntries }, month),
    [accounts, categories, transactions, budgetEntries, month]
  );

  const rta = derived.readyToAssign;
  const rtaState = rta > 0 ? "pos" : rta < 0 ? "neg" : "zero";
  const banner = {
    pos: { label: "Ready to Assign", sub: "Give every dollar a job" },
    neg: { label: "Over-Assigned", sub: "You've assigned more than you have" },
    zero: { label: "All Money Assigned", sub: "Every dollar has a job" },
  }[rtaState];
  const bannerColor = rtaState === "pos" ? "var(--pos)" : rtaState === "neg" ? "var(--neg)" : "var(--accent)";

  // Payment categories live in a hidden CategoryGroup (excluded from `groups`) so they don't
  // get a manageable, renameable group header — but they still need a place for users to
  // assign to them directly (per spec) and to see the transparency breakdown, so they get a
  // dedicated, always-visible section below the normal groups instead of vanishing entirely.
  const paymentCategories = categories.filter((c) => c.linkedAccountId);
  const pcAssigned = paymentCategories.reduce((s, c) => s + derived.assignedIn(c.id, month), 0);
  const pcActivity = paymentCategories.reduce((s, c) => s + derived.activityIn(c.id, month), 0);
  const pcAvail = paymentCategories.reduce((s, c) => s + derived.available(c.id, month), 0);

  return (
    <>
      <div style={{ padding: "18px 26px 0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href={`/budget?month=${addMonths(month, -1)}`} className="btn btn-ghost" style={{ padding: 8 }}>
            <ChevronLeft size={16} />
          </Link>
          <div style={{ fontWeight: 700, fontSize: 17, minWidth: 168, textAlign: "center", letterSpacing: "-0.01em" }}>
            {monthLabel(month)}
          </div>
          <Link href={`/budget?month=${addMonths(month, 1)}`} className="btn btn-ghost" style={{ padding: 8 }}>
            <ChevronRight size={16} />
          </Link>
          {month !== curYM() && (
            <Link href="/budget" className="btn btn-ghost">
              Today
            </Link>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => autoAssignGoals(month)}>
            <Sparkles size={15} /> Auto-assign goals
          </button>
          <button className="btn btn-ghost" onClick={() => openModal({ type: "group" })}>
            <Plus size={15} /> Group
          </button>
        </div>
      </div>

      <div style={{ padding: "16px 26px 0" }}>
        <div
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 24px",
            borderColor: bannerColor,
            background: rtaState === "pos" ? "var(--posSoft)" : rtaState === "neg" ? "var(--negSoft)" : "var(--accentSoft)",
          }}
        >
          <div>
            <div className="eyebrow" style={{ color: bannerColor }}>
              {banner.label}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink2)", marginTop: 2 }}>{banner.sub}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {rtaState === "zero" && (
              <div style={{ width: 34, height: 34, borderRadius: 999, background: "var(--accent)", display: "grid", placeItems: "center" }}>
                <Check size={20} color="#fff" strokeWidth={3} />
              </div>
            )}
            <div className="num" style={{ fontSize: 40, fontWeight: 800, color: bannerColor, letterSpacing: "-0.03em", lineHeight: 1 }}>
              {fmt(rta)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "18px 26px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 132px 120px 120px", gap: 8, padding: "0 14px 8px" }}>
          <span className="eyebrow">Category</span>
          <span className="eyebrow" style={{ textAlign: "right" }}>
            Assigned
          </span>
          <span className="eyebrow" style={{ textAlign: "right" }}>
            Activity
          </span>
          <span className="eyebrow" style={{ textAlign: "right" }}>
            Available
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 40 }}>
          {groups.map((g) => {
            const cats = categories.filter((c) => c.groupId === g.id);
            const grpAssigned = cats.reduce((s, c) => s + derived.assignedIn(c.id, month), 0);
            const grpActivity = cats.reduce((s, c) => s + derived.activityIn(c.id, month), 0);
            const grpAvail = cats.reduce((s, c) => s + derived.available(c.id, month), 0);
            return (
              <div key={g.id} className="card" style={{ overflow: "hidden" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 132px 120px 120px",
                    gap: 8,
                    padding: "12px 14px",
                    background: "var(--paper)",
                    alignItems: "center",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{g.name}</span>
                    <button
                      onClick={() => openModal({ type: "category", groupId: g.id })}
                      title="Add category"
                      style={{ color: "var(--ink3)", display: "grid", placeItems: "center" }}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                  <span className="num" style={{ textAlign: "right", fontWeight: 600, fontSize: 13, color: "var(--ink2)" }}>
                    {fmt(grpAssigned)}
                  </span>
                  <span className="num" style={{ textAlign: "right", fontWeight: 600, fontSize: 13, color: "var(--ink2)" }}>
                    {fmt(grpActivity)}
                  </span>
                  <span className="num" style={{ textAlign: "right", fontWeight: 700, fontSize: 13, color: grpAvail < 0 ? "var(--neg)" : "var(--ink)" }}>
                    {fmt(grpAvail)}
                  </span>
                </div>
                {cats.map((c) => (
                  <CatRow key={c.id} c={c} month={month} derived={derived} />
                ))}
              </div>
            );
          })}

          {paymentCategories.length > 0 && (
            <div className="card" style={{ overflow: "hidden" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 132px 120px 120px",
                  gap: 8,
                  padding: "12px 14px",
                  background: "var(--paper)",
                  alignItems: "center",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>Credit Card Payments</span>
                <span className="num" style={{ textAlign: "right", fontWeight: 600, fontSize: 13, color: "var(--ink2)" }}>
                  {fmt(pcAssigned)}
                </span>
                <span className="num" style={{ textAlign: "right", fontWeight: 600, fontSize: 13, color: "var(--ink2)" }}>
                  {fmt(pcActivity)}
                </span>
                <span className="num" style={{ textAlign: "right", fontWeight: 700, fontSize: 13, color: pcAvail < 0 ? "var(--neg)" : "var(--ink)" }}>
                  {fmt(pcAvail)}
                </span>
              </div>
              {paymentCategories.map((c) => (
                <CatRow
                  key={c.id}
                  c={c}
                  month={month}
                  derived={derived}
                  breakdown={resolveBreakdown(c.id, categories, transactions, budgetEntries, accounts, month)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
