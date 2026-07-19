import { getAccountTransactions } from "@/lib/queries";
import { AccountsView } from "@/components/AccountsView";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; category?: string; page?: string }>;
}) {
  const params = await searchParams;
  const accountFilter = params.account || "all";
  const categoryFilter = params.category || "all";
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const {
    transactions,
    totalCount,
    pageSize,
    clearedCents,
    unclearedCents,
    pendingCount,
    accounts,
    categories,
    lastReconciliation,
  } = await getAccountTransactions({ accountId: accountFilter, categoryId: categoryFilter, page });

  return (
    <AccountsView
      transactions={transactions}
      totalCount={totalCount}
      page={page}
      pageSize={pageSize}
      clearedCents={clearedCents}
      unclearedCents={unclearedCents}
      pendingCount={pendingCount}
      accounts={accounts}
      categories={categories}
      accountFilter={accountFilter}
      categoryFilter={categoryFilter}
      lastReconciliation={lastReconciliation}
    />
  );
}
