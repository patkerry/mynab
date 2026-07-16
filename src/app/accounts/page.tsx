import { getAccountTransactions } from "@/lib/queries";
import { AccountsView } from "@/components/AccountsView";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; category?: string }>;
}) {
  const params = await searchParams;
  const accountFilter = params.account || "all";
  const categoryFilter = params.category || "all";
  const { transactions, accounts, categories } = await getAccountTransactions({
    accountId: accountFilter,
    categoryId: categoryFilter,
  });

  return (
    <AccountsView
      transactions={transactions}
      accounts={accounts}
      categories={categories}
      accountFilter={accountFilter}
      categoryFilter={categoryFilter}
    />
  );
}
