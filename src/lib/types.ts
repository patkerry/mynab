import type { Transaction, TransactionSplit } from "@/generated/prisma-postgres/client";
import type { SplitLineDraft } from "./splits";

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
