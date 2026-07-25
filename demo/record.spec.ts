import { test, expect, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { LINES, type LineKey } from "./lines";

// Records the "first steps" onboarding demo as a video (playwright.demo.config.ts turns
// recording on and slows actions to a watchable pace). Run via `npm run demo:video` (silent,
// captions only) or `npm run demo:narrated` (captions held for as long as Ava speaks each line,
// plus a caption-log.json of when each line appeared so mux.ts can lay the audio underneath).

const NARRATED = !!process.env.DEMO_NARRATED;
const DURATIONS: Record<string, number> = NARRATED && existsSync("demo/narration/durations.json")
  ? JSON.parse(readFileSync("demo/narration/durations.json", "utf8"))
  : {};

const CAPTION_STYLE = `
  position: fixed; left: 50%; bottom: 34px; transform: translateX(-50%);
  max-width: 720px; padding: 14px 26px; border-radius: 14px;
  background: rgba(73, 90, 65, 0.95); color: #fff;
  font: 600 19px/1.45 system-ui, sans-serif; text-align: center;
  box-shadow: 0 8px 30px rgba(40, 30, 20, 0.35); z-index: 99999;
  transition: opacity 0.25s; pointer-events: none;
`;

let t0 = 0;
const captionLog: { key: LineKey; atMs: number }[] = [];

async function showCard(page: Page, text: string) {
  await page.evaluate(
    ([t, style]) => {
      let el = document.getElementById("demo-caption");
      if (!el) {
        el = document.createElement("div");
        el.id = "demo-caption";
        el.setAttribute("style", style);
        document.body.appendChild(el);
      }
      el.style.opacity = "1";
      el.textContent = t;
    },
    [text, CAPTION_STYLE]
  );
}

// Show + narrate-log a line. Hold = the longer of the visual minimum and the spoken clip (+ a beat).
async function caption(page: Page, key: LineKey, holdMs = 2600) {
  await showCard(page, LINES[key]);
  captionLog.push({ key, atMs: Date.now() - t0 });
  const hold = NARRATED ? Math.max(holdMs, (DURATIONS[key] ?? 0) + 650) : holdMs;
  await page.waitForTimeout(hold);
}

// Re-display an already-spoken line after a navigation wiped the DOM — no log, no re-narration.
async function captionAgain(page: Page, key: LineKey, holdMs = 400) {
  await showCard(page, LINES[key]);
  await page.waitForTimeout(holdMs);
}

const pause = (page: Page, ms = 1200) => page.waitForTimeout(ms);

test("record: first steps", async ({ page }) => {
  test.setTimeout(300_000);
  execSync("npx tsx demo/demo-seed.ts", { stdio: "pipe" });
  t0 = Date.now();

  // ---- Opening: the empty budget ----
  await page.goto("/budget");
  await caption(page, "welcome", 3200);

  // ---- Step 1: first account ----
  await caption(page, "firstStep", 2000);
  await page.getByRole("button", { name: "Add account" }).click();
  const modal = page.locator(".modal");
  await modal.getByLabel("Account name").pressSequentially("Everyday Chequing", { delay: 55 });
  await modal.getByLabel("Current balance").pressSequentially("3200", { delay: 80 });
  await pause(page, 800);
  await modal.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByText("Everyday Chequing")).toBeVisible();
  await caption(page, "rtaLands", 3000);

  // ---- Step 2: the credit card ----
  await page.getByRole("button", { name: "Add account" }).click();
  await modal.getByLabel("Account name").pressSequentially("Visa", { delay: 70 });
  await modal.getByRole("button", { name: "Credit" }).click();
  await modal.getByLabel("Current balance").pressSequentially("450", { delay: 80 });
  await pause(page, 800);
  await modal.getByRole("button", { name: "Add account" }).click();
  await expect(page.locator("aside").getByText("Visa")).toBeVisible();
  await caption(page, "cardAuto", 3400);

  // ---- Step 3: assign to zero ----
  await caption(page, "assignIntro", 2800);
  const assign = async (cat: string, amount: string) => {
    const input = page.getByLabel(`Assigned to ${cat}`);
    await input.scrollIntoViewIfNeeded();
    await input.click();
    await input.pressSequentially(amount, { delay: 60 });
    await input.press("Enter");
    await pause(page, 700);
  };
  await assign("Rent/Mortgage", "1600");
  await assign("Groceries", "600");
  await assign("Transportation", "200");
  await assign("Dining Out", "200");
  await assign("Fun Money", "300");
  await assign("Vacation", "300");
  await expect(page.getByText("All Money Assigned").first()).toBeVisible({ timeout: 15_000 });
  await page.mouse.wheel(0, -2000); // back to the banner
  await caption(page, "zeroMeaning", 3200);

  // ---- Step 4: spend from the plan ----
  await caption(page, "dayToDay", 2200);
  await page.goto("/accounts?account=all&category=all");
  await captionAgain(page, "dayToDay");
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByLabel("Payee").pressSequentially("Loblaws", { delay: 60 });
  await page.getByLabel("Category").selectOption({ label: "Groceries" });
  await page.getByLabel("Amount").pressSequentially("82.45", { delay: 70 });
  await pause(page, 700);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator(".row-hover", { hasText: "Loblaws" })).toBeVisible();
  await caption(page, "spendPlan", 3000);

  // ---- Step 5: a split ----
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByLabel("Payee").pressSequentially("Costco", { delay: 60 });
  await page.getByLabel("Amount").pressSequentially("98.00", { delay: 70 });
  await page.getByRole("button", { name: "Split across categories" }).click();
  await caption(page, "splitIntro", 1800);
  await page.getByLabel("Split line 1 category").selectOption({ label: "Groceries" });
  await page.getByLabel("Split line 1 amount").pressSequentially("73.00", { delay: 60 });
  await page.getByLabel("Split line 2 category").selectOption({ label: "Fun Money" });
  await page.getByLabel("Split line 2 amount").pressSequentially("25.00", { delay: 60 });
  await pause(page, 900);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator(".row-hover", { hasText: "Costco" }).first()).toBeVisible();
  await caption(page, "splitDone", 3000);

  // ---- Closing ----
  await page.goto("/budget");
  await caption(page, "loop", 3400);
  await caption(page, "guide", 3400);

  mkdirSync("demo-results", { recursive: true });
  writeFileSync("demo-results/caption-log.json", JSON.stringify(captionLog, null, 2));
});
