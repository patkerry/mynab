export type AccountFilter = "all" | string;
export type CategoryFilter = "all" | "income" | "none" | string;

// Shape produced/consumed by TxnEditorRow; categoryId is one of:
// "income" (inflow), "" (uncategorized), "transfer:<accountId>", or a real category id.
export type TxnDraft = {
  date: string;
  payee: string;
  categoryId: string;
  accountId: string;
  amount: string; // dollars, as typed by the user
  memo: string;
};
