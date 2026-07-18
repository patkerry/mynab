import { uid, curYM } from "../src/lib/format";
import { PAYMENT_GROUP_ID, PAYMENT_GROUP_NAME, buildPaymentCategoryDraft } from "../src/lib/budget";
import type { PrismaClient } from "../src/generated/prisma-postgres/client";

// Ports seed() from the original single-file app (ynab-clone.jsx lines 48-92) into the
// relational schema: the "income" categoryId sentinel becomes kind: "INCOME" with
// categoryId: null, and goals move from a nested object onto the Category row directly.
export function buildSeedData() {
  const ym = curYM();
  const d = (day: number) => `${ym}-${String(day).padStart(2, "0")}`;

  const accounts = [
    { id: "a_check", name: "Everyday Checking", type: "CHECKING" as const, onBudget: true },
    { id: "a_save", name: "Savings", type: "SAVINGS" as const, onBudget: true },
    { id: "a_cc", name: "Visa Credit Card", type: "CREDIT" as const, onBudget: true },
  ];

  const groups = [
    { id: "g1", name: "Immediate Obligations", isHidden: false },
    { id: "g2", name: "True Expenses", isHidden: false },
    { id: "g3", name: "Quality of Life", isHidden: false },
    // Matches the payment_categories migration's backfill convention (same fixed id/name),
    // so "Reset demo data" doesn't wipe out the credit-card payment category feature — it
    // recreates the same singleton hidden group + linked category the migration/addAccount do.
    { id: PAYMENT_GROUP_ID, name: PAYMENT_GROUP_NAME, isHidden: true },
  ];

  const visaPaymentDraft = buildPaymentCategoryDraft({ id: "a_cc", name: "Visa Credit Card" });

  const categories = [
    { id: "c_rent", groupId: "g1", name: "Rent", goalType: "MONTHLY" as const, goalAmountCents: 120000 },
    { id: "c_elec", groupId: "g1", name: "Electric", goalType: "MONTHLY" as const, goalAmountCents: 8000 },
    { id: "c_net", groupId: "g1", name: "Internet", goalType: "MONTHLY" as const, goalAmountCents: 6000 },
    { id: "c_groc", groupId: "g1", name: "Groceries", goalType: "MONTHLY" as const, goalAmountCents: 45000 },
    { id: "c_trans", groupId: "g1", name: "Transportation", goalType: "MONTHLY" as const, goalAmountCents: 15000 },
    { id: "c_auto", groupId: "g2", name: "Auto Maintenance", goalType: "TARGET" as const, goalAmountCents: 60000 },
    { id: "c_med", groupId: "g2", name: "Medical", goalType: "MONTHLY" as const, goalAmountCents: 5000 },
    { id: "c_ins", groupId: "g2", name: "Renter's Insurance", goalType: null, goalAmountCents: null },
    { id: "c_dine", groupId: "g3", name: "Dining Out", goalType: "MONTHLY" as const, goalAmountCents: 20000 },
    { id: "c_fun", groupId: "g3", name: "Fun Money", goalType: "MONTHLY" as const, goalAmountCents: 10000 },
    { id: "c_vac", groupId: "g3", name: "Vacation", goalType: "TARGET" as const, goalAmountCents: 200000 },
    { id: "catpay_a_cc", groupId: PAYMENT_GROUP_ID, name: visaPaymentDraft.name, linkedAccountId: visaPaymentDraft.linkedAccountId },
  ];

  const transactions = [
    { id: uid("t"), accountId: "a_check", date: d(1), payee: "Starting Balance", kind: "INCOME" as const, categoryId: null, amountCents: 320000, cleared: true, memo: "" },
    { id: uid("t"), accountId: "a_save", date: d(1), payee: "Starting Balance", kind: "INCOME" as const, categoryId: null, amountCents: 500000, cleared: true, memo: "" },
    { id: uid("t"), accountId: "a_cc", date: d(1), payee: "Starting Balance", kind: "NORMAL" as const, categoryId: null, amountCents: -45000, cleared: true, memo: "" },
    { id: uid("t"), accountId: "a_check", date: d(2), payee: "Employer Payroll", kind: "INCOME" as const, categoryId: null, amountCents: 230000, cleared: true, memo: "Paycheck" },
    { id: uid("t"), accountId: "a_check", date: d(3), payee: "Skyline Property Mgmt", kind: "NORMAL" as const, categoryId: "c_rent", amountCents: -120000, cleared: true, memo: "" },
    { id: uid("t"), accountId: "a_check", date: d(5), payee: "Trader Joe's", kind: "NORMAL" as const, categoryId: "c_groc", amountCents: -8500, cleared: true, memo: "" },
    { id: uid("t"), accountId: "a_check", date: d(9), payee: "Safeway", kind: "NORMAL" as const, categoryId: "c_groc", amountCents: -6200, cleared: false, memo: "" },
    { id: uid("t"), accountId: "a_check", date: d(6), payee: "City Power & Light", kind: "NORMAL" as const, categoryId: "c_elec", amountCents: -7300, cleared: true, memo: "" },
    { id: uid("t"), accountId: "a_cc", date: d(7), payee: "Bangkok Kitchen", kind: "NORMAL" as const, categoryId: "c_dine", amountCents: -4200, cleared: false, memo: "Dinner" },
    { id: uid("t"), accountId: "a_check", date: d(8), payee: "Shell", kind: "NORMAL" as const, categoryId: "c_trans", amountCents: -5500, cleared: true, memo: "" },
  ];

  const budgetEntries = [
    { categoryId: "c_rent", yearMonth: ym, amountCents: 120000 },
    { categoryId: "c_elec", yearMonth: ym, amountCents: 8000 },
    { categoryId: "c_net", yearMonth: ym, amountCents: 6000 },
    { categoryId: "c_groc", yearMonth: ym, amountCents: 45000 },
    { categoryId: "c_trans", yearMonth: ym, amountCents: 15000 },
    { categoryId: "c_dine", yearMonth: ym, amountCents: 20000 },
    { categoryId: "c_fun", yearMonth: ym, amountCents: 10000 },
  ];

  return { accounts, groups, categories, transactions, budgetEntries };
}

// Shared by prisma/seed.ts and the resetDemoData Server Action — order matters for FK
// dependencies (Restrict prevents deleting a referenced parent, so children go first/last).
export async function resetDatabase(prisma: PrismaClient) {
  const data = buildSeedData();
  await prisma.$transaction([
    prisma.transaction.deleteMany(),
    prisma.budgetEntry.deleteMany(),
    prisma.category.deleteMany(),
    prisma.categoryGroup.deleteMany(),
    prisma.account.deleteMany(),
  ]);
  await prisma.$transaction([
    prisma.account.createMany({ data: data.accounts }),
    prisma.categoryGroup.createMany({ data: data.groups }),
    prisma.category.createMany({ data: data.categories }),
    prisma.transaction.createMany({ data: data.transactions }),
    prisma.budgetEntry.createMany({ data: data.budgetEntries }),
  ]);
}
