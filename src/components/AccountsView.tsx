"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Check, Trash2, ScrollText, Upload, ChevronLeft, ChevronRight } from "lucide-react";
import { fmt, dateLabel, TXN_GRID } from "@/lib/format";
import { toggleCleared, deleteTransaction, addTransaction, updateTransaction, getReconcileInfo, findPossibleDuplicate } from "@/app/accounts/actions";
import { TxnEditorRow } from "./TxnEditorRow";
import { useModal } from "./modal/ModalContext";
import { useToast } from "./toast/ToastContext";
import type { Account, Category, Reconciliation, Transaction } from "@/generated/prisma-postgres/client";
import type { TxnDraft } from "@/lib/types";

export function AccountsView({
  transactions,
  totalCount,
  page,
  pageSize,
  clearedCents,
  unclearedCents,
  pendingCount,
  accounts,
  categories,
  accountFilter,
  categoryFilter,
  lastReconciliation,
}: {
  transactions: Transaction[];
  totalCount: number;
  page: number;
  pageSize: number;
  clearedCents: number;
  unclearedCents: number;
  pendingCount: number;
  accounts: Account[];
  categories: Category[];
  accountFilter: string;
  categoryFilter: string;
  lastReconciliation: Reconciliation | null;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { openModal } = useModal();
  const { showToast } = useToast();

  // "—" covers both uncategorized outflows and transfer legs, matching the original app's
  // catName (ynab-clone.jsx line 542), where both cases carried categoryId: null.
  const catName = (t: Transaction) =>
    t.kind === "INCOME" ? "Ready to Assign" : t.categoryId === null ? "—" : categories.find((c) => c.id === t.categoryId)?.name || "—";
  const acctName = (id: string) => accounts.find((a) => a.id === id)?.name || "?";

  const setFilters = (next: { account?: string; category?: string }) => {
    const account = next.account ?? accountFilter;
    const category = next.category ?? categoryFilter;
    // A page number carried over from a wider filter could be out of range for a narrower one —
    // any filter change resets back to page 1.
    router.push(`/accounts?account=${account}&category=${category}&page=1`);
  };
  const goToPage = (p: number) => router.push(`/accounts?account=${accountFilter}&category=${categoryFilter}&page=${p}`);

  const txnToDraft = (t: Transaction): TxnDraft => ({
    date: t.date,
    payee: t.payee,
    categoryId: t.kind === "INCOME" ? "income" : t.categoryId || "",
    accountId: t.accountId,
    amount: (Math.abs(t.amountCents) / 100).toFixed(2),
    memo: t.memo || "",
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Never auto-clears and never partially reconciles — getReconcileInfo re-checks (ignoring
  // the current category filter, since `transactions` above may be a filtered subset) whether
  // every transaction on the account is cleared, and refuses with a specific reason if not.
  const handleReconcile = async () => {
    const account = accounts.find((a) => a.id === accountFilter);
    if (!account) return;
    const info = await getReconcileInfo(accountFilter);
    if (!info.ok) {
      showToast(info.reason);
      return;
    }
    openModal({ type: "reconcile", accountId: accountFilter, accountName: account.name, currentBalanceCents: info.currentBalanceCents });
  };

  // Advisory-only: warns and lets the user confirm rather than silently blocking, since a
  // second real transaction can legitimately look identical to an earlier one (see
  // findPossibleDuplicate in accounts/actions.ts).
  const handleAdd = async (draft: TxnDraft): Promise<boolean> => {
    const dupe = await findPossibleDuplicate(draft);
    if (dupe) {
      const proceed = window.confirm(
        `This looks like a duplicate of an existing transaction: "${dupe.payee}" on ${dateLabel(dupe.date)} for ${fmt(dupe.amountCents)}.\n\nAdd it anyway?`
      );
      if (!proceed) return false;
    }
    const ok = await addTransaction(draft);
    // A newly-added transaction is almost always recent, so with the newest-first sort it would
    // otherwise be invisible if the user is deep in an older page.
    if (ok && page !== 1) goToPage(1);
    return ok;
  };

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
              Balance <b className="num" style={{ color: clearedCents + unclearedCents < 0 ? "var(--neg)" : "var(--ink)" }}>{fmt(clearedCents + unclearedCents)}</b>
            </span>
            <span style={{ color: "var(--ink2)" }}>
              Cleared <b className="num" style={{ color: "var(--ink)" }}>{fmt(clearedCents)}</b>
            </span>
            <span style={{ color: "var(--ink2)" }}>
              Uncleared <b className="num" style={{ color: "var(--ink)" }}>{fmt(unclearedCents)}</b>
            </span>
            {pendingCount > 0 && (
              <span style={{ color: "var(--warn)", fontWeight: 600 }}>
                {pendingCount} pending — needs approval
              </span>
            )}
            {accountFilter !== "all" && (
              <span style={{ color: "var(--ink3)" }}>{lastReconciliation ? `Last reconciled ${dateLabel(lastReconciliation.date)}` : "Never reconciled"}</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {accountFilter !== "all" && (
            <button className="btn btn-ghost" onClick={handleReconcile}>
              <ScrollText size={15} /> Reconcile
            </button>
          )}
          <button
            className="btn btn-ghost"
            onClick={() => openModal({ type: "import", accountId: accountFilter !== "all" ? accountFilter : accounts[0]?.id || "", accounts })}
          >
            <Upload size={15} /> Import CSV
          </button>
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
            onSubmit={handleAdd}
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
              <span className="num" style={{ color: "var(--ink)", fontWeight: 700, whiteSpace: "nowrap" }}>
                {dateLabel(t.date)}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.payee}</span>
                {t.pending && (
                  <span className="pill num" style={{ color: "var(--warn)", background: "var(--warnSoft)", fontSize: 10, flexShrink: 0 }} title="Imported, not yet approved — click to review">
                    Pending
                  </span>
                )}
              </span>
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
                  onClick={async (e) => {
                    e.stopPropagation();
                    const result = await toggleCleared(t.id);
                    if (!result.ok) showToast(result.reason);
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

      {totalCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, fontSize: 13 }}>
          <span style={{ color: "var(--ink3)" }}>
            Showing {Math.min((page - 1) * pageSize + 1, totalCount)}-{Math.min(page * pageSize, totalCount)} of {totalCount}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={() => goToPage(page - 1)} disabled={page <= 1}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ color: "var(--ink2)" }}>
              Page {page} of {totalPages}
            </span>
            <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
