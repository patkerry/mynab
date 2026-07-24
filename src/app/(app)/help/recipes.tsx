import type { ReactNode } from "react";
import styles from "./help.module.css";

// The "How do I…?" entries. One object per task; `keywords` widens what the search box matches
// beyond the question text. Steps reference the REAL on-screen labels via <UI>. Voice rule: plain
// sentences, like a person explaining — not documentation-ese.
const UI = ({ children }: { children: ReactNode }) => <span className={styles.ui}>{children}</span>;

export type Recipe = { q: string; keywords: string; steps: ReactNode[] };

export const RECIPES: Recipe[] = [
  {
    q: "How do I get started?",
    keywords: "start new setup first accounts begin onboarding",
    steps: [
      <>Add your accounts (sidebar → <UI>Add account</UI>) with their current balances. Whatever you enter shows up as Ready to Assign.</>,
      <>Your first budgeting session is just assigning all of it on the <UI>Budget</UI> page until that number reads $0.00.</>,
      <>The starter categories (Immediate Obligations, True Expenses, Quality of Life) are a suggestion — rename, add, or hide them on the <UI>Categories</UI> page until they match your life.</>,
    ],
  },
  {
    q: "How do I record a paycheck?",
    keywords: "income salary pay deposit money in payroll",
    steps: [
      <>Go to <UI>Transactions</UI> and click <UI>Add transaction</UI>.</>,
      <>In the category dropdown pick <em>Inflow: Ready to Assign</em>, put the employer in the payer field, enter the amount, save.</>,
      <>The money lands in Ready to Assign. Head to the <UI>Budget</UI> page and assign it until the banner reads $0.00 — that&rsquo;s the whole method.</>,
    ],
  },
  {
    q: "How do I add an everyday expense?",
    keywords: "add spend purchase transaction outflow record buy",
    steps: [
      <>On <UI>Transactions</UI>, click <UI>Add transaction</UI>.</>,
      <>Fill in the payee, pick a category, enter the amount (outflows are just the plain amount — no minus sign needed), save.</>,
      <>If it was on the credit card, set the account to the card. The budget handles the rest (see the credit card entry below).</>,
    ],
  },
  {
    q: "How do I move money between categories?",
    keywords: "cover overspending reassign transfer budget red negative move",
    steps: [
      <>On the <UI>Budget</UI> page, click the Assigned amount of the category you&rsquo;re taking money FROM and lower it.</>,
      <>That money returns to Ready to Assign. Now raise the Assigned amount of the category that needs it.</>,
      <>That&rsquo;s not cheating — deciding where the money comes from is the whole exercise. Don&rsquo;t leave a category red.</>,
    ],
  },
  {
    q: "How do I split one purchase across categories?",
    keywords: "split costco multiple categories divide allocate",
    steps: [
      <>Add or edit the transaction, then click the split button next to the category dropdown (or pick <em>Split across categories…</em> in the dropdown).</>,
      <>Give each line a category and an amount. The editor shows what&rsquo;s left to allocate; Save stays off until the lines add up exactly.</>,
      <>Need more than two lines? <UI>Add line</UI>. The register shows the split as indented rows under the transaction.</>,
    ],
  },
  {
    q: "How do I record a deposit that's part paycheck, part reimbursement?",
    keywords: "split income refund reimbursement deposit inflow mixed",
    steps: [
      <>Enter the deposit, click the split button, and flip the toggle to <UI>Inflow</UI>.</>,
      <>Point the paycheck part at <em>Inflow: Ready to Assign</em> and the reimbursement part back at the category you originally spent from.</>,
      <>One catch: on a credit card account every line needs a real category — no Ready to Assign lines there.</>,
    ],
  },
  {
    q: "How do I import transactions from my bank?",
    keywords: "import csv qfx ofx bank download statement upload",
    steps: [
      <>Download the transactions from your bank — QFX/OFX, or a CSV with Date, Payee, Amount, Memo columns.</>,
      <>On <UI>Transactions</UI>, click <UI>Import</UI>, pick the account, and drop the file in (or paste its contents).</>,
      <>Re-importing an overlapping export is safe — rows you already have get skipped automatically.</>,
    ],
  },
  {
    q: "How do I review and approve imported transactions?",
    keywords: "pending tan approve review needs review imported rows",
    steps: [
      <>Imported rows arrive tan with a &ldquo;Needs review&rdquo; pill. They count against the account balance but don&rsquo;t touch any category until you approve them.</>,
      <>The app guesses categories from how you&rsquo;ve categorized each merchant before. If a guess is right, click <UI>Approve</UI> on the row — or tick several and use <UI>Approve selected</UI>.</>,
      <>If a guess is wrong, click the row, fix the category, and save. Saving is the approval.</>,
    ],
  },
  {
    q: "How do I undo an import?",
    keywords: "undo import mistake wrong file remove batch",
    steps: [
      <>Click <UI>Undo import</UI> in the Transactions toolbar. It removes the un-reviewed rows the most recent import added.</>,
      <>Rows you already approved stay — you reviewed those on purpose. The button disappears once the whole batch is dealt with.</>,
    ],
  },
  {
    q: "How do I set up a credit card?",
    keywords: "credit card visa mastercard new setup payment category",
    steps: [
      <>Sidebar → <UI>Add account</UI>, type <em>Credit</em>, and enter the current balance as what you owe.</>,
      <>The app creates a payment category for the card automatically (&ldquo;money set aside to pay this card&rdquo;).</>,
      <>From then on, recording a card purchase moves the budgeted money from the spending category into the payment category — so the cash to pay the bill is already reserved.</>,
    ],
  },
  {
    q: "How do I pay my credit card?",
    keywords: "pay credit card bill payment transfer visa",
    steps: [
      <>Add a transaction FROM your checking account, and in the category dropdown pick the card under <em>Transfer to</em>.</>,
      <>That&rsquo;s it — paying the card is a transfer, not spending. The spending already happened at the store.</>,
      <>The card&rsquo;s payment category on the Budget page goes down by the payment, and its breakdown shows exactly which purchases fed it.</>,
    ],
  },
  {
    q: "How do I check an account against my bank?",
    keywords: "reconcile adjust balance bank statement match verify",
    steps: [
      <>Filter <UI>Transactions</UI> to the account, then click <UI>Adjust balance</UI>.</>,
      <>Type the balance your bank shows. If they match, done — the app records a clean check. If they&rsquo;re off, it adds one adjustment transaction so they agree.</>,
      <>You&rsquo;ll be asked to deal with any un-reviewed imports first; comparing against the bank with unreviewed rows in the pile would give a meaningless answer.</>,
    ],
  },
  {
    q: "How do I set a savings goal?",
    keywords: "goal target save vacation emergency fund monthly",
    steps: [
      <>On the <UI>Budget</UI> page, click the target icon next to the category name.</>,
      <>Pick <em>Assign each month</em> for a rhythm (say $450 for groceries) or <em>Total to save</em> for a pot you&rsquo;re building up (a $2,000 vacation).</>,
      <>The bar under the category shows progress. <UI>Auto-assign goals</UI> fills every goal from Ready to Assign in one click.</>,
    ],
  },
  {
    q: "How do I budget quickly at the start of the month?",
    keywords: "payday monthly routine quick budget auto assign fill",
    steps: [
      <>After your paycheck lands, open the <UI>Budget</UI> page.</>,
      <>Click <UI>Quick budget</UI> to fill every empty category from its own three-month average, or <UI>Auto-assign goals</UI> to fund goals top to bottom.</>,
      <>Per category, the <em>Last mo</em> amount is clickable — one click copies last month&rsquo;s assignment.</>,
      <>Then tune by hand until Ready to Assign reads $0.00.</>,
    ],
  },
  {
    q: "How do I handle a refund or return?",
    keywords: "refund return money back store credit",
    steps: [
      <>Add a transaction on the account the money came back to, pick the category you originally spent from, and enter the amount as a positive inflow (income-style with the category set).</>,
      <>The category&rsquo;s Available goes back up — the refund undoes the spending, it isn&rsquo;t new income.</>,
    ],
  },
  {
    q: "How do I hide a category I don't use?",
    keywords: "hide unhide archive category unused clean up",
    steps: [
      <>Hover the category on the <UI>Budget</UI> page and click the eye icon (or manage everything on the <UI>Categories</UI> page).</>,
      <>Hidden categories keep their history and money — they&rsquo;re tucked behind a &ldquo;hidden&rdquo; toggle in the group, not deleted.</>,
    ],
  },
  {
    q: "How do I track my mortgage or investments?",
    keywords: "tracking account investment loan rrsp 401k mortgage net worth",
    steps: [
      <>Sidebar → <UI>Add account</UI> and pick <em>Investment</em> or <em>Loan</em>.</>,
      <>These are tracking accounts: they count toward net worth, but their transactions never touch your categories or Ready to Assign. Your retirement account is wealth, not this month&rsquo;s grocery money.</>,
    ],
  },
  {
    q: "What do Assigned, Activity, and Available mean?",
    keywords: "columns numbers budget page meaning read rollover",
    steps: [
      <><em>Assigned</em> — what you gave the category this month. Click and type to change it.</>,
      <><em>Activity</em> — what actually happened this month; spending shows negative.</>,
      <><em>Available</em> — everything ever assigned minus everything ever spent. Leftovers roll forward on their own. This is the only number to check in a store.</>,
    ],
  },
  {
    q: "Why is a transaction tan?",
    keywords: "tan white pending color row state cleared review",
    steps: [
      <>The register has one rule: white rows are done, tan rows need your review.</>,
      <>Tan means the row came from an import and you haven&rsquo;t accepted it into the plan yet. Open it, check the category, save — it turns white.</>,
    ],
  },
  {
    q: "Why don't my numbers look right?",
    keywords: "wrong numbers mismatch broken off drift negative troubleshoot",
    steps: [
      <>It&rsquo;s almost always one of four things. Uncategorized spending: filter the register by <em>Uncategorized</em> and give those rows categories.</>,
      <>Un-reviewed imports: tan rows count against accounts but not categories, so the two disagree until you review them.</>,
      <>A transfer recorded as income or spending: moving your own money between accounts should always be a Transfer.</>,
      <>Ready to Assign is negative: you assigned money you don&rsquo;t have — lower something.</>,
      <>One thing that never fixes a mismatch: shuffling assignments. If totals disagree with reality, the problem is a transaction that&rsquo;s missing, uncategorized, or recorded wrong.</>,
    ],
  },
];
