import { uid, curYM } from "../src/lib/format";
import { PAYMENT_GROUP_ID, PAYMENT_GROUP_NAME, buildPaymentCategoryDraft } from "../src/lib/budget";
import type { PrismaClient } from "../src/generated/prisma-postgres/client";

// Ports seed() from the original single-file app (ynab-clone.jsx lines 48-92) into the
// relational schema: the "income" categoryId sentinel becomes kind: "INCOME" with
// categoryId: null, and goals move from a nested object onto the Category row directly.
//
// Everything is stamped with `budgetId` and its fixed primary keys are prefixed with the budget id,
// so demo data can be (re)seeded per budget without the global-unique PKs colliding across budgets.
export function buildSeedData(budgetId: string) {
  const ym = curYM();
  const d = (day: number) => `${ym}-${String(day).padStart(2, "0")}`;
  // Prefix the human-readable fixed ids with the budget so two budgets can each hold demo data.
  const p = (id: string) => `${budgetId}__${id}`;

  const accounts = [
    { id: p("a_check"), budgetId, name: "Everyday Checking", type: "CHECKING" as const, onBudget: true },
    { id: p("a_save"), budgetId, name: "Savings", type: "SAVINGS" as const, onBudget: true },
    { id: p("a_cc"), budgetId, name: "Visa Credit Card", type: "CREDIT" as const, onBudget: true },
  ];

  const groups = [
    { id: p("g1"), budgetId, name: "Immediate Obligations", isHidden: false },
    { id: p("g2"), budgetId, name: "True Expenses", isHidden: false },
    { id: p("g3"), budgetId, name: "Quality of Life", isHidden: false },
    // The hidden "Credit Card Payments" group. Prefixed by budget (the old fixed PAYMENT_GROUP_ID
    // couldn't be shared across budgets); addAccount finds this budget's group by its marker
    // (isHidden + name), so recreating it here keeps the credit-card payment category feature intact.
    { id: p(PAYMENT_GROUP_ID), budgetId, name: PAYMENT_GROUP_NAME, isHidden: true },
  ];

  const visaPaymentDraft = buildPaymentCategoryDraft({ id: p("a_cc"), name: "Visa Credit Card" });

  const categories = [
    { id: p("c_rent"), budgetId, groupId: p("g1"), name: "Rent", goalType: "MONTHLY" as const, goalAmountCents: 120000 },
    { id: p("c_elec"), budgetId, groupId: p("g1"), name: "Electric", goalType: "MONTHLY" as const, goalAmountCents: 8000 },
    { id: p("c_net"), budgetId, groupId: p("g1"), name: "Internet", goalType: "MONTHLY" as const, goalAmountCents: 6000 },
    { id: p("c_groc"), budgetId, groupId: p("g1"), name: "Groceries", goalType: "MONTHLY" as const, goalAmountCents: 45000 },
    { id: p("c_trans"), budgetId, groupId: p("g1"), name: "Transportation", goalType: "MONTHLY" as const, goalAmountCents: 15000 },
    { id: p("c_auto"), budgetId, groupId: p("g2"), name: "Auto Maintenance", goalType: "TARGET" as const, goalAmountCents: 60000 },
    { id: p("c_med"), budgetId, groupId: p("g2"), name: "Medical", goalType: "MONTHLY" as const, goalAmountCents: 5000 },
    { id: p("c_ins"), budgetId, groupId: p("g2"), name: "Renter's Insurance", goalType: null, goalAmountCents: null },
    { id: p("c_dine"), budgetId, groupId: p("g3"), name: "Dining Out", goalType: "MONTHLY" as const, goalAmountCents: 20000 },
    { id: p("c_fun"), budgetId, groupId: p("g3"), name: "Fun Money", goalType: "MONTHLY" as const, goalAmountCents: 10000 },
    { id: p("c_vac"), budgetId, groupId: p("g3"), name: "Vacation", goalType: "TARGET" as const, goalAmountCents: 200000 },
    { id: p("catpay_a_cc"), budgetId, groupId: p(PAYMENT_GROUP_ID), name: visaPaymentDraft.name, linkedAccountId: visaPaymentDraft.linkedAccountId },
  ];

  const transactions = [
    { id: uid("t"), budgetId, accountId: p("a_check"), date: d(1), payee: "Starting Balance", kind: "INCOME" as const, categoryId: null, amountCents: 320000, cleared: true, memo: "" },
    { id: uid("t"), budgetId, accountId: p("a_save"), date: d(1), payee: "Starting Balance", kind: "INCOME" as const, categoryId: null, amountCents: 500000, cleared: true, memo: "" },
    { id: uid("t"), budgetId, accountId: p("a_cc"), date: d(1), payee: "Starting Balance", kind: "NORMAL" as const, categoryId: null, amountCents: -45000, cleared: true, memo: "" },
    { id: uid("t"), budgetId, accountId: p("a_check"), date: d(2), payee: "Employer Payroll", kind: "INCOME" as const, categoryId: null, amountCents: 230000, cleared: true, memo: "Paycheck" },
    { id: uid("t"), budgetId, accountId: p("a_check"), date: d(3), payee: "Skyline Property Mgmt", kind: "NORMAL" as const, categoryId: p("c_rent"), amountCents: -120000, cleared: true, memo: "" },
    { id: uid("t"), budgetId, accountId: p("a_check"), date: d(5), payee: "Trader Joe's", kind: "NORMAL" as const, categoryId: p("c_groc"), amountCents: -8500, cleared: true, memo: "" },
    { id: uid("t"), budgetId, accountId: p("a_check"), date: d(9), payee: "Safeway", kind: "NORMAL" as const, categoryId: p("c_groc"), amountCents: -6200, cleared: false, memo: "" },
    { id: uid("t"), budgetId, accountId: p("a_check"), date: d(6), payee: "City Power & Light", kind: "NORMAL" as const, categoryId: p("c_elec"), amountCents: -7300, cleared: true, memo: "" },
    { id: uid("t"), budgetId, accountId: p("a_cc"), date: d(7), payee: "Bangkok Kitchen", kind: "NORMAL" as const, categoryId: p("c_dine"), amountCents: -4200, cleared: false, memo: "Dinner" },
    { id: uid("t"), budgetId, accountId: p("a_check"), date: d(8), payee: "Shell", kind: "NORMAL" as const, categoryId: p("c_trans"), amountCents: -5500, cleared: true, memo: "" },
  ];

  const budgetEntries = [
    { budgetId, categoryId: p("c_rent"), yearMonth: ym, amountCents: 120000 },
    { budgetId, categoryId: p("c_elec"), yearMonth: ym, amountCents: 8000 },
    { budgetId, categoryId: p("c_net"), yearMonth: ym, amountCents: 6000 },
    { budgetId, categoryId: p("c_groc"), yearMonth: ym, amountCents: 45000 },
    { budgetId, categoryId: p("c_trans"), yearMonth: ym, amountCents: 15000 },
    { budgetId, categoryId: p("c_dine"), yearMonth: ym, amountCents: 20000 },
    { budgetId, categoryId: p("c_fun"), yearMonth: ym, amountCents: 10000 },
  ];

  return { accounts, groups, categories, transactions, budgetEntries };
}

// Shared by prisma/seed.ts and the resetDemoData Server Action — order matters for FK
// dependencies (Restrict prevents deleting a referenced parent, so children go first/last).
// Scoped to a single budget: only that budget's rows are wiped and reseeded, and the budget row
// itself is ensured to exist first (so a fresh Postgres/SQLite DB can be seeded from empty).
export async function resetDatabase(prisma: PrismaClient, budgetId: string) {
  const data = buildSeedData(budgetId);
  await prisma.budget.upsert({
    where: { id: budgetId },
    update: {},
    create: { id: budgetId, name: "My Budget" },
  });
  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { budgetId } }),
    prisma.budgetEntry.deleteMany({ where: { budgetId } }),
    prisma.category.deleteMany({ where: { budgetId } }),
    prisma.categoryGroup.deleteMany({ where: { budgetId } }),
    prisma.account.deleteMany({ where: { budgetId } }),
  ]);
  await prisma.$transaction([
    prisma.account.createMany({ data: data.accounts }),
    prisma.categoryGroup.createMany({ data: data.groups }),
    prisma.category.createMany({ data: data.categories }),
    prisma.transaction.createMany({ data: data.transactions }),
    prisma.budgetEntry.createMany({ data: data.budgetEntries }),
  ]);
}
