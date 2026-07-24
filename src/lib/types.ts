import type { Transaction, TransactionSplit } from "@/generated/prisma-postgres/client";
import type { CatBreakdown } from "./budget";
import type { SplitLineDraft } from "./splits";

// Per-category numbers for one selected month, computed SERVER-side (see getBudgetPageModel in
// queries.ts) so /budget ships O(categories) numbers instead of every transaction ever — the
// engine's all-time-rows design must not leak into the client payload.
export type CatMonth = { assigned: number; activity: number; avail: number; lastAssigned: number };

export type BudgetPageModel = {
  rta: number;
  rows: Record<string, CatMonth>; // categoryId -> numbers for the selected month
  breakdowns: Record<string, CatBreakdown>; // payment categoryId -> resolved transparency breakdown
};

export type AccountFilter = "all" | string;
export type CategoryFilter = "all" | "income" | "none" | "pending" | string;

// A register row with its split lines (empty array = ordinary unsplit transaction). What
// getAccountTransactions returns and AccountsView renders.
export type TransactionWithSplits = Transaction & { splits: TransactionSplit[] };

// Shape produced/consumed by TxnEditorRow; categoryId is one of:
// "income" (inflow), "" (uncategorized), "transfer:<accountId>", "split", or a real category id.
export type TxnDraft = {
  date: string;
  payee: string;
  categoryId: string;
  accountId: string;
  amount: string; // dollars, as typed by the user
  memo: string;
  // Present iff categoryId === "split". Lines are unsigned; splitDirection signs them all
  // (validateSplitDraft in src/lib/splits.ts is the single validation authority).
  splits?: SplitLineDraft[];
  splitDirection?: "inflow" | "outflow";
};

export type ImportResult =
  | { ok: true; imported: number; duplicates: number; skipped: number; guessed: number }
  | { ok: false; reason: string };
