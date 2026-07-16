"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Check, Trash2 } from "lucide-react";
import { fmt, TXN_GRID } from "@/lib/format";
import { toggleCleared, deleteTransaction, addTransaction, updateTransaction } from "@/app/accounts/actions";
import { TxnEditorRow } from "./TxnEditorRow";
import type { Account, Category, Transaction } from "@/generated/prisma/client";
import type { TxnDraft } from "@/lib/types";

export function AccountsView({
  transactions,
  accounts,
  categories,
  accountFilter,
  categoryFilter,
}: {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  accountFilter: string;
  categoryFilter: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // "—" covers both uncategorized outflows and transfer legs, matching the original app's
  // catName (ynab-clone.jsx line 542), where both cases carried categoryId: null.
  const catName = (t: Transaction) =>
    t.kind === "INCOME" ? "Ready to Assign" : t.categoryId === null ? "—" : categories.find((c) => c.id === t.categoryId)?.name || "—";
  const acctName = (id: string) => accounts.find((a) => a.id === id)?.name || "?";

  const setFilters = (next: { account?: string; category?: string }) => {
    const account = next.account ?? accountFilter;
    const category = next.category ?? categoryFilter;
    router.push(`/accounts?account=${account}&category=${category}`);
  };

  const txnToDraft = (t: Transaction): TxnDraft => ({
    date: t.date,
    payee: t.payee,
    categoryId: t.kind === "INCOME" ? "income" : t.categoryId || "",
    accountId: t.accountId,
    amount: (Math.abs(t.amountCents) / 100).toFixed(2),
    memo: t.memo || "",
  });

  const cleared = transactions.filter((t) => t.cleared).reduce((s, t) => s + t.amountCents, 0);
  const uncleared = transactions.filter((t) => !t.cleared).reduce((s, t) => s + t.amountCents, 0);

  return (
    <div style={{ padding: "18px 26px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <select
            value={accountFilter}
            onChange={(e) => setFilters({ account: e.target.value })}
            style={{ padding: "9px 12px", borderRadius: 9, border: `1px solid ${accountFilter !== "all" ? "var(--accent)" : "var(--line)"}`, background: "#fff", fontWeight: 600 }}
          >
            <option value="all">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setFilters({ category: e.target.value })}
            style={{ padding: "9px 12px", borderRadius: 9, border: `1px solid ${categoryFilter !== "all" ? "var(--accent)" : "var(--line)"}`, background: "#fff", fontWeight: 600 }}
          >
            <option value="all">All categories</option>
            <option value="income">Ready to Assign</option>
            <option value="none">Uncategorized</option>
            <optgroup label="Category">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          </select>
          {(accountFilter !== "all" || categoryFilter !== "all") && (
            <button className="btn btn-ghost" style={{ padding: "8px 11px" }} onClick={() => setFilters({ account: "all", category: "all" })}>
              <X size={14} /> Clear
            </button>
          )}
          <div style={{ display: "flex", gap: 16, fontSize: 12.5 }}>
            <span style={{ color: "var(--ink2)" }}>
              Balance <b className="num" style={{ color: cleared + uncleared < 0 ? "var(--neg)" : "var(--ink)" }}>{fmt(cleared + uncleared)}</b>
            </span>
            <span style={{ color: "var(--ink2)" }}>
              Cleared <b className="num" style={{ color: "var(--ink)" }}>{fmt(cleared)}</b>
            </span>
            <span style={{ color: "var(--ink2)" }}>
              Uncleared <b className="num" style={{ color: "var(--ink)" }}>{fmt(uncleared)}</b>
            </span>
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setAdding(true);
            setEditingId(null);
          }}
          disabled={adding}
          style={{ opacity: adding ? 0.5 : 1 }}
        >
          <Plus size={15} /> Add transaction
        </button>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: TXN_GRID, gap: 8, padding: "10px 16px", borderBottom: "1px solid var(--line)", background: "var(--paper)" }}>
          {["Date", "Payee", "Category", "Memo", "Account", "Amount", ""].map((h, i) => (
            <span key={i} className="eyebrow" style={{ textAlign: i === 5 ? "right" : "left" }}>
              {h}
            </span>
          ))}
        </div>
        {adding && (
          <TxnEditorRow
            accounts={accounts}
            categories={categories}
            allowTransfer
            initial={{
              date: new Date().toISOString().slice(0, 10),
              payee: "",
              categoryId: "",
              accountId: accountFilter !== "all" ? accountFilter : accounts[0]?.id || "",
              amount: "",
              memo: "",
            }}
            onSubmit={addTransaction}
            onClose={() => setAdding(false)}
          />
        )}
        {transactions.length === 0 && !adding && (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--ink3)", fontSize: 14 }}>
            {accountFilter !== "all" || categoryFilter !== "all" ? "No transactions match this filter." : "No transactions yet. Add one to get started."}
          </div>
        )}
        {transactions.map((t) => {
          if (t.id === editingId) {
            return (
              <TxnEditorRow
                key={t.id}
                accounts={accounts}
                categories={categories}
                allowTransfer={false}
                initial={txnToDraft(t)}
                onSubmit={(draft) => updateTransaction(t.id, draft)}
                onClose={() => setEditingId(null)}
              />
            );
          }
          const transfer = t.kind === "TRANSFER";
          return (
            <div
              key={t.id}
              className="row-hover"
              onClick={() => {
                if (!transfer) {
                  setEditingId(t.id);
                  setAdding(false);
                }
              }}
              title={transfer ? "Transfers can't be edited inline — delete to remove both legs" : "Click to edit"}
              style={{
                display: "grid",
                gridTemplateColumns: TXN_GRID,
                gap: 8,
                padding: "11px 16px",
                alignItems: "center",
                borderBottom: "1px solid var(--line)",
                fontSize: 13.5,
                cursor: transfer ? "default" : "pointer",
              }}
            >
              <span className="num" style={{ color: "var(--ink2)" }}>
                {t.date.slice(5)}
              </span>
              <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.payee}</span>
              <span style={{ color: "var(--ink2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{catName(t)}</span>
              <span style={{ color: "var(--ink3)", fontSize: 12.5, fontStyle: t.memo ? "italic" : "normal", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t.memo || "—"}
              </span>
              <span style={{ color: "var(--ink2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{acctName(t.accountId)}</span>
              <span className="num" style={{ textAlign: "right", fontWeight: 600, color: t.amountCents < 0 ? "var(--ink)" : "var(--posInk)" }}>
                {fmt(t.amountCents)}
              </span>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button
                  title={t.cleared ? "Cleared" : "Uncleared"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCleared(t.id);
                  }}
                  style={{ width: 22, height: 22, borderRadius: 999, display: "grid", placeItems: "center", background: t.cleared ? "var(--pos)" : "var(--line)", color: "#fff" }}
                >
                  <Check size={13} strokeWidth={3} />
                </button>
                <button
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteTransaction(t.id);
                  }}
                  style={{ color: "var(--ink3)", display: "grid", placeItems: "center" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
