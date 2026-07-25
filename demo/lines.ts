// The demo's narration script — single source for BOTH the on-screen caption cards
// (record.spec.ts) and the synthesized voice-over (gen-narration.ts), so they can't drift.
export const LINES = {
  welcome: "This is Assign — a zero-based budget. Every dollar you have gets a job.",
  firstStep: "First step: add your accounts.",
  rtaLands: "Your balance lands in Ready to Assign — real money, waiting for jobs.",
  cardAuto: "Credit cards get a payment category automatically — money to pay the bill gets set aside as you spend.",
  assignIntro: "Now the whole method: assign every dollar until Ready to Assign reads zero.",
  zeroMeaning: "Zero doesn't mean broke — it means every dollar is decided.",
  dayToDay: "Day to day, you just record what happens.",
  spendPlan: "Spend from the plan, not the balance — Groceries just went down by $82.45.",
  splitIntro: "One cart, two categories? Split it.",
  splitDone: "The register shows every piece — and each category only felt its share.",
  loop: "That's the loop: money in → give it a job → spend the job, not the account.",
  guide: 'Stuck? The Guide in the sidebar answers "how do I…" — happy budgeting.',
} as const;

export type LineKey = keyof typeof LINES;
