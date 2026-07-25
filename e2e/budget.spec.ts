import { test, expect, type Page } from "@playwright/test";
import { execSync } from "node:child_process";

// Money-critical flows through the REAL stack: browser → Server Actions → Prisma → SQLite →
// engine → RSC re-render. These are the paths the unit suite can't touch (it's pure functions
// only — see the coverage-status section in ARCHITECTURE.md).
//
// DB resets go through a tsx child process (reset-cli.ts): Playwright's spec loader can't parse
// the generated Prisma client, so specs never import it directly.
const resetLedger = () => execSync("npx tsx e2e/reset-cli.ts", { stdio: "pipe" });

test.beforeEach(() => {
  resetLedger();
});

// The sidebar RTA card (Link to /budget, label + amount) — the sidebar computes RTA with a
// DUPLICATED formula (getSidebarData), so agreeing with the budget page's banner is a real
// regression check, not a tautology.
const sidebarRta = (page: Page) => page.locator("aside a", { hasText: "Ready to Assign" }).locator(".num");
const bannerRta = (page: Page) => page.locator(".card", { hasText: "all months" }).locator(".num");

test("sidebar Ready-to-Assign equals the budget banner (duplicated formula stays in sync)", async ({ page }) => {
  await page.goto("/budget");
  await expect(bannerRta(page)).toHaveText("$8,260.00"); // seeded: income 8,260 − assigned 0... (income 3200+5000+2300 −2240 assigned = wait, read it)
  const banner = await bannerRta(page).textContent();
  await expect(sidebarRta(page)).toHaveText(banner!);
});

test("assigning money moves RTA down and the category's Available up, in both header and sidebar", async ({ page }) => {
  await page.goto("/budget");
  const before = await bannerRta(page).textContent();

  // Assign an extra $100 to Internet (currently assigned 60.00 in the seed).
  const internetRow = page.locator(".row-hover", { hasText: "Internet" });
  const assign = internetRow.locator("input.assign-in");
  await assign.fill("160.00");
  await assign.press("Enter"); // advances focus → blur commits
  await expect(bannerRta(page)).not.toHaveText(before!, { timeout: 10_000 });

  // RTA dropped by exactly the $100 delta, and the sidebar agrees with the banner.
  const parse = (s: string | null) => Math.round(parseFloat(s!.replace(/[^0-9.-]/g, "")) * 100);
  const after = await bannerRta(page).textContent();
  expect(parse(after)).toBe(parse(before) - 10000);
  await expect(sidebarRta(page)).toHaveText(after!);
});

test("adding a categorized outflow in the register updates the account balance and budget activity", async ({ page }) => {
  await page.goto("/accounts?account=all&category=all");
  const balance = page.locator("text=Balance").locator(".num").first();
  const before = await balance.textContent();

  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByLabel("Payee").fill("E2E Grocer");
  await page.getByLabel("Category").selectOption({ label: "Groceries" });
  await page.getByLabel("Amount").fill("25.00");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.locator(".row-hover", { hasText: "E2E Grocer" })).toBeVisible();
  const parse = (s: string | null) => Math.round(parseFloat(s!.replace(/[^0-9.-]/g, "")) * 100);
  await expect(balance).not.toHaveText(before!);
  expect(parse(await balance.textContent())).toBe(parse(before) - 2500);
});

test("the seeded split renders as indented sub-rows and its lines land in both categories' activity", async ({ page }) => {
  await page.goto("/accounts?account=all&category=all");
  const costco = page.locator(".row-hover", { hasText: "Costco" }).first();
  await expect(costco).toContainText("Split (2)");
  await expect(page.getByText("↳ Groceries")).toBeVisible();
  await expect(page.getByText("↳ Fun Money")).toBeVisible();

  // Budget page shows the split's per-line activity: Groceries seeded activity includes the
  // -73.00 split line; Fun Money's is exactly the -25.00 line.
  await page.goto("/budget");
  const funMoney = page.locator(".row-hover", { hasText: "Fun Money" });
  await expect(funMoney).toContainText("-$25.00");
});

test("creating a split via the editor enforces exact-sum before Save enables", async ({ page }) => {
  await page.goto("/accounts?account=all&category=all");
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByLabel("Payee").fill("E2E Split");
  await page.getByLabel("Amount").fill("90.00");
  await page.getByRole("button", { name: "Split across categories" }).click();

  const addBtn = page.getByRole("button", { name: "Add", exact: true });
  await page.getByLabel("Split line 1 category").selectOption({ label: "Groceries" });
  await page.getByLabel("Split line 1 amount").fill("60.00");
  await page.getByLabel("Split line 2 category").selectOption({ label: "Dining Out" });
  await page.getByLabel("Split line 2 amount").fill("20.00");
  // 60 + 20 ≠ 90 → remainder shown, Save disabled.
  await expect(page.getByText("left to allocate")).toBeVisible();
  await expect(addBtn).toBeDisabled();

  await page.getByLabel("Split line 2 amount").fill("30.00");
  await expect(page.getByText("fully allocated")).toBeVisible();
  await expect(addBtn).toBeEnabled();
  await addBtn.click();

  const row = page.locator(".row-hover", { hasText: "E2E Split" }).first();
  await expect(row).toContainText("Split (2)");
});

test("import → pending rows land tan; income imports feed RTA on approve", async ({ page }) => {
  const rta = () => page.locator("aside a", { hasText: /Ready to Assign|Money Assigned|Over-Assigned/ }).locator(".num");
  await page.goto("/accounts?account=all&category=all");
  const rtaBefore = await rta().textContent();

  await page.getByRole("button", { name: "Import", exact: true }).click();
  const modal = page.locator(".modal"); // scope EVERYTHING to the modal (ARCHITECTURE.md lesson)
  const csv = "Date,Payee,Amount,Memo\n2026-07-20,E2E IMPORT ONE,-12.34,\n2026-07-21,E2E IMPORT TWO,-8.66,\n2026-07-22,E2E PAYCHECK,1000.00,";
  await modal.locator("textarea").fill(csv);
  await modal.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.locator(".row-hover", { hasText: "E2E IMPORT ONE" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("3 pending — needs approval")).toBeVisible();

  // A positive imported amount lands as pending INCOME — shown as Ready to Assign, but it must
  // NOT count toward RTA until approved.
  await expect(page.locator(".row-hover", { hasText: "E2E PAYCHECK" })).toContainText("Ready to Assign");
  await expect(rta()).toHaveText(rtaBefore!);

  // One-click approve the paycheck (income needs no category) → RTA rises by exactly $1,000.
  const paycheckRow = page.locator(".row-hover", { hasText: "E2E PAYCHECK" });
  await paycheckRow.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("2 pending — needs approval")).toBeVisible();
  const parse = (t: string | null) => Math.round(parseFloat(t!.replace(/[^0-9.-]/g, "")) * 100);
  await expect
    .poll(async () => parse(await rta().textContent()))
    .toBe(parse(rtaBefore) + 100000);

  // Categorize + approve an outflow via the editor (saving IS the approval).
  await page.locator(".row-hover", { hasText: "E2E IMPORT ONE" }).click();
  await page.getByLabel("Category").selectOption({ label: "Groceries" });
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("1 pending — needs approval")).toBeVisible();
});

test("a transfer to the credit card reduces card debt without touching Ready to Assign", async ({ page }) => {
  await page.goto("/budget");
  const rtaBefore = await bannerRta(page).textContent();

  await page.goto("/accounts?account=all&category=all");
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByLabel("Category").selectOption({ label: "Visa Credit Card" }); // under "Transfer to"
  await page.getByLabel("Amount").fill("100.00");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Transfer to Visa Credit Card").first()).toBeVisible();

  await page.goto("/budget");
  await expect(bannerRta(page)).toHaveText(rtaBefore!); // transfers are never income/spending
});

test("dirty editor asks before discarding on click-outside", async ({ page }) => {
  await page.goto("/accounts?account=all&category=all");
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByLabel("Payee").fill("Half-typed");

  let confirmSeen = false;
  page.once("dialog", (d) => {
    confirmSeen = true;
    void d.dismiss(); // keep editing
  });
  // Raw coordinate click on the INERT sidebar brand block: the editor's confirm() fires
  // synchronously during mousedown, which wedges locator-based clicks ("element not visible"),
  // and clicking the table would open a second editor. (140, 28) = the brand title area.
  await page.mouse.click(140, 28);
  await expect.poll(() => confirmSeen).toBe(true);
  await expect(page.getByLabel("Payee")).toHaveValue("Half-typed"); // dismiss kept the draft
});

test("adjust balance: a mismatched bank balance creates a visible adjustment transaction", async ({ page }) => {
  await page.goto("/accounts?account=all&category=all");
  // Pick the checking account from the account filter, then reconcile. But first the seeded
  // pending-free precondition: the demo seed has NO pending rows, so reconcile is allowed.
  await page.locator("select").first().selectOption({ label: "Everyday Checking" });
  await page.getByRole("button", { name: "Adjust balance", exact: true }).click();
  const modal = page.locator(".modal");
  await modal.getByLabel("Your actual bank balance").fill("99999.00");
  await expect(modal.getByText(/Off by/)).toBeVisible();
  await modal.getByRole("button", { name: "Adjust balance", exact: true }).click();
  await expect(page.locator(".row-hover", { hasText: "Reconciliation Adjustment" })).toBeVisible({ timeout: 10_000 });
});

test("double-clicking Add account creates exactly ONE account (in-flight guard)", async ({ page }) => {
  await page.goto("/budget");
  await page.getByRole("button", { name: "Add account" }).click();
  const modal = page.locator(".modal");
  await modal.getByLabel("Account name").fill("Dupe Test");
  await modal.getByLabel("Current balance").fill("100");
  // A real user on a slow server hammered this button and got three accounts. The ModalShell
  // in-flight guard must swallow everything after the first click.
  await modal.getByRole("button", { name: "Add account" }).click({ clickCount: 3, delay: 60 });
  await expect(page.locator("aside").getByText("Dupe Test")).toHaveCount(1, { timeout: 10_000 });

  // And the new account-edit affordance can clean a dupe up: delete it entirely.
  const row = page.locator("aside div", { hasText: "Dupe Test" }).last();
  await row.hover();
  await page.getByLabel("Rename or delete Dupe Test").click();
  await modal.getByRole("button", { name: /Delete account/ }).click(); // step 1: arm
  await modal.getByRole("button", { name: "Confirm delete" }).click(); // step 2: confirm
  await expect(page.locator("aside").getByText("Dupe Test")).toHaveCount(0, { timeout: 10_000 });
});

test("an uncategorized system row (starting balance) can be edited and re-saved", async ({ page }) => {
  // The seeded Visa "Starting Balance" is kind NORMAL with NO category — by design. The
  // needs-a-category save rule used to make such rows permanently uneditable (a real user
  // couldn't fix a starting balance entered with the wrong sign).
  await page.goto("/accounts?account=all&category=all");
  const row = page.locator(".row-hover", { hasText: "Starting Balance" }).filter({ hasText: "Visa" }).first();
  await row.click();
  // Change the amount and save WITHOUT picking a category — must succeed and stay uncategorized.
  await page.getByLabel("Amount").fill("500.00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".row-hover", { hasText: "Starting Balance" }).filter({ hasText: "-$500.00" }).first()).toBeVisible({ timeout: 10_000 });
});

test("income can't be recorded on a credit card (the double-count foot-gun)", async ({ page }) => {
  await page.goto("/accounts?account=all&category=all");
  await page.getByRole("button", { name: "Add transaction" }).click();
  // On the default (checking) account the income option exists…
  await expect(page.getByLabel("Category").locator('option[value="income"]')).toHaveCount(1);
  // …switch the account to the credit card and it disappears.
  await page.getByLabel("Account").selectOption({ label: "Visa Credit Card" });
  await expect(page.getByLabel("Category").locator('option[value="income"]')).toHaveCount(0);
});

test("the −/+ toggle records a refund, and re-saving it keeps it an inflow", async ({ page }) => {
  await page.goto("/accounts?account=all&category=all");
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByLabel("Payee").fill("E2E Refund");
  await page.getByLabel("Category").selectOption({ label: "Groceries" });
  await page.getByRole("button", { name: "Direction: money out" }).click(); // − → +
  await page.getByLabel("Amount").fill("15.00");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const row = page.locator(".row-hover", { hasText: "E2E Refund" }).first();
  await expect(row).toContainText("$15.00"); // positive — money came back

  // Re-editing and saving unchanged must NOT flip it into spending (the old bug).
  await row.click();
  await expect(page.getByRole("button", { name: "Direction: money in" })).toBeVisible(); // sign preserved
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".row-hover", { hasText: "E2E Refund" }).first()).toContainText("$15.00");
});

test("converting an imported row to a transfer LINKS the other account's matching row (no doubling)", async ({ page }) => {
  await page.goto("/accounts?account=all&category=all");

  // Import the checking side of a card payment (−$200)…
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const modal = page.locator(".modal");
  await modal.locator("textarea").fill("Date,Payee,Amount,Memo\n2026-07-20,ONLINE TRANSFER OUT,-200.00,");
  await modal.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.locator(".row-hover", { hasText: "ONLINE TRANSFER OUT" })).toBeVisible({ timeout: 15_000 });

  // …and the card side (+$200) — positive on a CREDIT account stays a NORMAL pending row.
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await modal.locator("select").selectOption({ label: "Visa Credit Card" });
  await modal.locator("textarea").fill("Date,Payee,Amount,Memo\n2026-07-21,PAYMENT RECEIVED THANK YOU,200.00,");
  await modal.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.locator(".row-hover", { hasText: "PAYMENT RECEIVED" })).toBeVisible({ timeout: 15_000 });

  // Convert the checking row into a transfer to the Visa (importing switched the register to the
  // Visa filter — go back to all accounts first).
  await page.goto("/accounts?account=all&category=all");
  await page.locator(".row-hover", { hasText: "ONLINE TRANSFER OUT" }).click();
  await page.getByLabel("Category").selectOption({ label: "Visa Credit Card" });
  await page.getByRole("button", { name: "Approve", exact: true }).click();

  // The imported card row was LINKED into the transfer — not duplicated: exactly one
  // "Transfer to/from" pair, the PAYMENT RECEIVED payee is gone, and no pending remains.
  await expect(page.getByText("Transfer to Visa Credit Card").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".row-hover", { hasText: "PAYMENT RECEIVED" })).toHaveCount(0);
  await expect(page.getByText("Transfer from Everyday Checking")).toHaveCount(1);
  await expect(page.getByText("pending — needs approval")).toHaveCount(0);
});
