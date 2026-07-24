# User guide

The user guide ships **inside the app** — the **Guide** link in the sidebar (`/help`).

Its single source of truth is [`src/app/(app)/help/page.tsx`](src/app/(app)/help/page.tsx); edit
the guide there. (It was briefly a full markdown document in this file; it moved in-app so users
actually see it, and keeping a second markdown copy in the repo would just drift.)

The guide's structure, for orientation:
- **Part 1 — The philosophy of zero-based budgeting**, framed as the four misconceptions people
  bring in (budget-as-forecast, budget-as-limit, savings-as-leftovers, balance-as-spendable) and
  why the goal state is "Ready to Assign: $0.00".
- **Part 2 — "How do I…?"**: a searchable, wiki-style list of ~19 task-shaped entries (record a
  paycheck, split a purchase, pay the credit card, fix wrong-looking numbers, …). Entries live in
  `src/app/(app)/help/recipes.tsx` — add new ones there (question + search keywords + steps).
