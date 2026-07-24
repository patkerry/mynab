# User guide

The user guide ships **inside the app** — the **Guide** link in the sidebar (`/help`).

Its single source of truth is [`src/app/(app)/help/page.tsx`](src/app/(app)/help/page.tsx); edit
the guide there. (It was briefly a full markdown document in this file; it moved in-app so users
actually see it, and keeping a second markdown copy in the repo would just drift.)

The guide's structure, for orientation:
- **Part 1 — The philosophy of zero-based budgeting**, framed as the four misconceptions people
  bring in (budget-as-forecast, budget-as-limit, savings-as-leftovers, balance-as-spendable) and
  why the goal state is "Ready to Assign: $0.00".
- **Part 2 — Using the app**: getting started, the sidebar, the Budget page, the transaction
  register's review model, bank imports, credit-card payment categories, "Adjust balance",
  Reports, and a "when the numbers look wrong" troubleshooting list.
