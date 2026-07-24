"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, CheckCheck, Trash2, ScrollText, Upload, Undo2, ChevronLeft, ChevronRight } from "lucide-react";
import { fmt, dateLabel, TXN_GRID } from "@/lib/format";
import { transferLabel } from "@/lib/budget";
import { deleteTransaction, addTransaction, updateTransaction, approvePending, getReconcileInfo, findPossibleDuplicate, undoImport } from "@/app/(app)/accounts/actions";
import { TxnEditorRow } from "./TxnEditorRow";
import { useModal } from "./modal/ModalContext";
import { useToast } from "./toast/ToastContext";
import type { Account, Category, Reconciliation, Transaction } from "@/generated/prisma-postgres/client";
import type { TxnDraft } from "@/lib/types";
import styles from "./AccountsView.module.css";

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
  lastImportBatch,
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
  lastImportBatch: { id: string; count: number } | null;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { openModal } = useModal();
  const { showToast } = useToast();

  // A pending imported row is bulk-approvable once it has a category (accepting the auto-guess).
  const approvable = (t: Transaction) => t.pending && t.categoryId !== null && t.kind === "NORMAL";
  const approvableIds = transactions.filter(approvable).map((t) => t.id);
  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const allSelected = approvableIds.length > 0 && approvableIds.every((id) => selected.has(id));
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(approvableIds));
  const approveSelected = async () => {
    const ids = [...selected];
    const { approved } = await approvePending(ids);
    setSelected(new Set());
    showToast(approved > 0 ? `Approved ${approved} transaction${approved > 1 ? "s" : ""}` : "Nothing to approve", approved > 0 ? "success" : "error");
    router.refresh();
  };
  // One-click approve for a single pending row (accepts its guessed category).
  const approveRow = async (id: string) => {
    const { approved } = await approvePending([id]);
    showToast(approved > 0 ? "Approved 1 transaction" : "Nothing to approve", approved > 0 ? "success" : "error");
    router.refresh();
  };

  // Undo the most recent import — removes the un-reviewed rows it added (see undoImport).
  const undoLastImport = async () => {
    if (!lastImportBatch) return;
    const n = lastImportBatch.count;
    if (!window.confirm(`Undo the last import? This permanently removes the ${n} un-reviewed transaction${n === 1 ? "" : "s"} it added.`)) return;
    const { removed } = await undoImport(lastImportBatch.id);
    showToast(removed > 0 ? `Removed ${removed} imported transaction${removed === 1 ? "" : "s"}` : "Nothing to undo", removed > 0 ? "success" : "error");
    router.refresh();
  };

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
    else if (ok) router.refresh();
    return ok;
  };

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <select
            value={accountFilter}
            onChange={(e) => setFilters({ account: e.target.value })}
            className={`${styles.select} ${accountFilter !== "all" ? styles.selectActive : ""}`}
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
            className={`${styles.select} ${categoryFilter !== "all" ? styles.selectActive : ""}`}
          >
            <option value="all">All categories</option>
            <option value="income">Ready to Assign</option>
            <option value="none">Uncategorized</option>
            <option value="pending">Needs review</option>
            <optgroup label="Category">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          </select>
          {(accountFilter !== "all" || categoryFilter !== "all") && (
            <button className={`btn btn-ghost ${styles.clearBtn}`} onClick={() => setFilters({ account: "all", category: "all" })}>
              <X size={14} /> Clear
            </button>
          )}
          <div className={styles.stats}>
            <span className={styles.statLabel}>
              Balance <b className="num" style={{ color: clearedCents + unclearedCents < 0 ? "var(--neg)" : "var(--ink)" }}>{fmt(clearedCents + unclearedCents)}</b>
            </span>
            {pendingCount > 0 && <span className={styles.pendingNote}>{pendingCount} pending — needs approval</span>}
            {accountFilter !== "all" && (
              <span className={styles.muted3}>{lastReconciliation ? `Last reconciled ${dateLabel(lastReconciliation.date)}` : "Never reconciled"}</span>
            )}
          </div>
        </div>
        <div className={styles.actions}>
          {selected.size > 0 && (
            <button className="btn btn-primary" onClick={approveSelected}>
              <CheckCheck size={15} /> Approve selected ({selected.size})
            </button>
          )}
          {accountFilter !== "all" && (
            <button className="btn btn-ghost" onClick={handleReconcile}>
              <ScrollText size={15} /> Reconcile
            </button>
          )}
          {lastImportBatch && (
            <button className="btn btn-ghost" onClick={undoLastImport} title="Remove the un-reviewed transactions added by the most recent import">
              <Undo2 size={15} /> Undo import ({lastImportBatch.count})
            </button>
          )}
          <button
            className="btn btn-ghost"
            onClick={() => openModal({ type: "import", accountId: accountFilter !== "all" ? accountFilter : accounts[0]?.id || "", accounts })}
          >
            <Upload size={15} /> Import
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

      <div className={`card ${styles.tableCard}`}>
        <div className={styles.headerRow} style={{ gridTemplateColumns: TXN_GRID }}>
          <span className={`eyebrow ${styles.dateHead}`}>
            {approvableIds.length > 0 && (
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} title="Select all reviewable" className={styles.checkbox} />
            )}
            Date
          </span>
          {["Payee", "Category", "Memo", "Account", "Amount", ""].map((h) => (
            <span key={h || "actions"} className={`eyebrow ${h === "Amount" ? styles.right : ""}`}>
              {h}
            </span>
          ))}
        </div>
        {adding && (
          <TxnEditorRow
            accounts={accounts}
            categories={categories}
            allowTransfer
            saveLabel="Add"
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
          <div className={styles.empty}>
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
                allowTransfer
                saveLabel={t.pending ? "Approve" : "Save"}
                initial={txnToDraft(t)}
                onSubmit={async (draft) => {
                  const ok = await updateTransaction(t.id, draft);
                  if (ok) router.refresh();
                  return ok;
                }}
                onClose={() => setEditingId(null)}
              />
            );
          }
          const transfer = t.kind === "TRANSFER";
          return (
            <div
              key={t.id}
              className={t.pending ? `row-hover txn-pending ${styles.txnRow}` : `row-hover ${styles.txnRow} ${styles.approved}`}
              onClick={() => {
                if (!transfer) {
                  setEditingId(t.id);
                  setAdding(false);
                }
              }}
              title={transfer ? "Transfers can't be edited inline — delete to remove both legs" : "Click to edit"}
              style={{ gridTemplateColumns: TXN_GRID, cursor: transfer ? "default" : "pointer" }}
            >
              <span className={`num ${styles.dateCell}`}>
                {approvable(t) && (
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSel(t.id)}
                    title="Select for approval"
                    className={styles.checkbox}
                  />
                )}
                {dateLabel(t.date)}
              </span>
              <span className={styles.payeeCell}>
                <span className={styles.payeeText}>{transfer ? transferLabel(t, accounts) : t.payee}</span>
                {t.pending && (
                  <span className={`pill ${styles.reviewPill}`} title="Imported, not yet approved — click to review, add a category, and save to approve">
                    Needs review
                  </span>
                )}
              </span>
              <span className={styles.cellMuted2}>{catName(t)}</span>
              <span className={styles.memoCell} style={{ fontStyle: t.memo ? "italic" : "normal" }}>
                {t.memo || "—"}
              </span>
              <span className={styles.cellMuted2}>{acctName(t.accountId)}</span>
              <span className={`num ${styles.amountCell}`} style={{ color: t.amountCents < 0 ? "var(--ink)" : "var(--posInk)" }}>
                {fmt(t.amountCents)}
              </span>
              <div className={styles.rowActions}>
                {approvable(t) && (
                  <button
                    title="Approve — accept the category and mark reviewed"
                    onClick={(e) => {
                      e.stopPropagation();
                      approveRow(t.id);
                    }}
                    className={styles.approveBtn}
                  >
                    Approve
                  </button>
                )}
                <button
                  title="Delete"
                  onClick={async (e) => {
                    e.stopPropagation();
                    await deleteTransaction(t.id);
                    router.refresh();
                  }}
                  className={styles.iconBtn}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {totalCount > 0 && (
        <div className={styles.pagination}>
          <span className={styles.muted3}>
            Showing {Math.min((page - 1) * pageSize + 1, totalCount)}-{Math.min(page * pageSize, totalCount)} of {totalCount}
          </span>
          <div className={styles.pageNav}>
            <button className={`btn btn-ghost ${styles.pageBtn}`} onClick={() => goToPage(page - 1)} disabled={page <= 1}>
              <ChevronLeft size={14} />
            </button>
            <span className={styles.muted2}>
              Page {page} of {totalPages}
            </span>
            <button className={`btn btn-ghost ${styles.pageBtn}`} onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
