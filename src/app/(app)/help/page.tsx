import styles from "./help.module.css";

// The in-app user guide. Static prose — no data fetching. The philosophy preamble comes first on
// purpose: zero-based budgeting contradicts what most people mean by "budgeting," and users who
// skip the reframe read correct numbers as bugs. Source of truth for the guide's content is THIS
// file; USER_GUIDE.md in the repo root is just a pointer here.
export default function HelpPage() {
  const UI = ({ children }: { children: React.ReactNode }) => <span className={styles.ui}>{children}</span>;

  return (
    <div className={styles.page}>
      <div>
        <h2 className={styles.h2}>How to use Assign</h2>
        <div className={styles.desc}>The philosophy first — the buttons make sense after it.</div>
      </div>

      <div className={styles.prose}>
        <p>
          Assign is a <strong>zero-based budgeting</strong> app. Before the buttons and screens, read the next
          section — zero-based budgeting is simple, but it is <strong>not</strong> what most people mean by
          &ldquo;budgeting,&rdquo; and if you use the app with the ordinary meaning in your head, the numbers will
          feel wrong even when they&rsquo;re right.
        </p>

        <h3 className={styles.part}>Part 1 — The philosophy</h3>

        <div className={styles.thesis}>
          You don&rsquo;t plan what you <em>will</em> spend out of money you <em>expect</em> — you decide, right
          now, what every dollar you <em>already have</em> is for.
        </div>

        <p>
          That&rsquo;s the whole idea. Everything else follows from it. But it quietly contradicts four beliefs
          almost everyone carries in, so let&rsquo;s knock those down one at a time.
        </p>

        <h4 className={styles.section}>Misconception 1: &ldquo;A budget is a forecast&rdquo;</h4>
        <p>
          Most &ldquo;budgets&rdquo; are predictions: <em>I&rsquo;ll earn $4,000 next month, so I&rsquo;ll spend
          $500 on groceries.</em> Then reality differs from the prediction, the spreadsheet is wrong by week two,
          and you quit.
        </p>
        <p>
          A zero-based budget contains <strong>no predictions at all</strong>. You only ever assign dollars that
          are sitting in your accounts today. When a paycheck lands, <em>then</em> you assign it. If it never
          lands, your budget was never wrong — it never claimed that money existed. The budget is a statement
          about the <strong>present</strong>, not a guess about the future, which is why it can&rsquo;t drift out
          of date the way a forecast does.
        </p>

        <h4 className={styles.section}>Misconception 2: &ldquo;A budget is a limit, and going over is failing&rdquo;</h4>
        <p>
          People treat budget categories like electric fences: touch one and you&rsquo;ve <em>failed</em>, so why
          bother. In zero-based budgeting, overspending a category isn&rsquo;t failure — it&rsquo;s{" "}
          <strong>new information</strong>. Groceries cost $60 more than you decided? Fine: move $60 from a
          category you care less about (Dining Out, say) to cover it. The plan changed because life changed. What
          you&rsquo;re <em>not</em> allowed to do is pretend — the total across all categories always equals the
          money you actually have, so covering groceries genuinely costs you $60 of dining out. That trade-off,
          made consciously, <strong>is</strong> the budgeting. Moving money isn&rsquo;t cheating the system;
          it&rsquo;s the system working.
        </p>

        <h4 className={styles.section}>Misconception 3: &ldquo;Savings is whatever&rsquo;s left over&rdquo;</h4>
        <p>
          If saving means &ldquo;what remains at month-end,&rdquo; the answer is usually nothing — leftover money
          gets absorbed. Zero-based budgeting inverts this: <strong>saving is a job you assign dollars to</strong>,
          exactly like rent. A vacation fund, an emergency fund, &ldquo;new tires eventually&rdquo; — each is a
          category, and dollars assigned there are <em>spoken for</em>, just spent later than grocery dollars.
        </p>
        <p>
          This is also how the method handles irregular expenses, and it&rsquo;s the part that changes lives: your
          car repair, your annual insurance bill, Christmas — these are not emergencies. They are{" "}
          <strong>slow-motion monthly expenses</strong>. Assign $50 every month to Auto Maintenance and the $600
          repair in November is a non-event: the money is sitting there, already assigned to exactly this. Assign
          nothing, and the same repair lands on a credit card as a &ldquo;crisis.&rdquo; Same car, same repair —
          the only difference is whether past-you gave those dollars a job.
        </p>

        <h4 className={styles.section}>Misconception 4: &ldquo;My account balance tells me what I can spend&rdquo;</h4>
        <p>
          This is the deadliest one. Your checking account says $2,300, so the $400 jacket feels fine. But $1,200
          of that is next week&rsquo;s rent, $300 is the insurance bill due in twenty days, and $250 is set aside
          for the credit-card balance you already ran up. Your <em>balance</em> is $2,300; the amount that&rsquo;s
          genuinely undecided is a lot smaller.
        </p>
        <p>
          In a zero-based budget you <strong>never make a spending decision by looking at an account balance.</strong>{" "}
          You look at the category. &ldquo;Can I afford this jacket?&rdquo; becomes &ldquo;what&rsquo;s{" "}
          <em>Available</em> in Fun Money?&rdquo; — a number that already accounts for rent, the insurance bill,
          and the credit card, because those dollars were assigned elsewhere. One glance, honest answer.
        </p>

        <h4 className={styles.section}>So why &ldquo;zero&rdquo;?</h4>
        <p>
          The goal state is <strong>Ready to Assign: $0.00</strong> — not because you&rsquo;re broke, but because
          zero means <strong>every dollar has been decided</strong>. Unassigned money isn&rsquo;t safety;
          it&rsquo;s money with no opinion, which in practice means it evaporates. Note what zero is <em>not</em>:
          it is not &ldquo;spend everything.&rdquo; Dollars assigned to Vacation or Emergency Fund count as
          assigned. Zero just means no dollar is sitting around undecided.
        </p>
        <p>The discipline in day-to-day life is exactly two habits:</p>
        <ol>
          <li>
            <strong>When money arrives, assign all of it</strong> — drive Ready to Assign to zero.
          </li>
          <li>
            <strong>When a category runs dry, move money into it from another category</strong> — consciously,
            feeling the trade-off — instead of &ldquo;just this once&rdquo; spending past it.
          </li>
        </ol>
        <p>Do those two things and the app takes care of the arithmetic.</p>

        <h3 className={styles.part}>Part 2 — Using the app</h3>

        <h4 className={styles.section}>Getting started</h4>
        <p>
          Your budget starts with a sensible set of category groups — <strong>Immediate Obligations</strong>{" "}
          (rent, utilities, groceries…), <strong>True Expenses</strong> (car maintenance, insurance,
          subscriptions…), and <strong>Quality of Life</strong> (dining out, fun money, vacation…). Rename, add,
          or hide categories freely on the <UI>Categories</UI> page; the starter set is a suggestion, not a rule.
        </p>
        <p>
          Add your accounts (sidebar → <UI>Add account</UI>) and enter each one&rsquo;s current balance. That
          balance immediately shows up as <strong>Ready to Assign</strong> — real dollars, waiting for jobs. Your
          first budgeting session is simply: assign all of it until Ready to Assign reads $0.00.
        </p>

        <h4 className={styles.section}>The sidebar</h4>
        <ul>
          <li>
            <strong>Ready to Assign</strong> sits at the top. Green means you have unassigned money (go assign
            it!), red <strong>Over-Assigned</strong> means you&rsquo;ve assigned dollars you don&rsquo;t have
            (take some back), and <strong>All Money Assigned</strong> means you&rsquo;re done. Click it to jump to
            the Budget page.
          </li>
          <li>
            <strong>All accounts</strong> shows net worth — every account&rsquo;s balance combined, including
            tracking accounts.
          </li>
          <li>
            Each account shows its live balance. Remember Misconception 4: these numbers are for checking against
            your bank, <strong>not</strong> for making spending decisions.
          </li>
        </ul>

        <h4 className={styles.section}>The Budget page</h4>
        <p>One row per category, three numbers each:</p>
        <ul>
          <li>
            <strong>Assigned</strong> — what you&rsquo;ve given this category this month. Click and type to change
            it.
          </li>
          <li>
            <strong>Activity</strong> — what actually happened this month (spending shows negative).
          </li>
          <li>
            <strong>Available</strong> — the only number that matters when you&rsquo;re standing in a store.
            It&rsquo;s everything ever assigned minus everything ever spent, so{" "}
            <strong>money left over rolls forward to next month automatically</strong>. An Available of $180 in
            Groceries means $180, full stop, regardless of which month it was assigned in.
          </li>
        </ul>
        <p>
          A negative (red) Available is an overspent category. Fix it the honest way: assign more to it (which
          pulls from Ready to Assign), or lower another category&rsquo;s Assigned and raise this one. Don&rsquo;t
          let red linger — an overspent category is a dollar spent that some other category thinks it still has.
        </p>
        <p>Helpers, once you have some history:</p>
        <ul>
          <li>
            <UI>Set goal</UI> on a category: either <em>Assign each month</em> (e.g. $450 for groceries, a monthly
            rhythm) or <em>Total to save</em> (e.g. a $2,000 vacation target you chip away at).
          </li>
          <li>
            <UI>Auto-assign goals</UI> — fills categories to their goals from Ready to Assign, top to bottom,
            until the money runs out.
          </li>
          <li>
            <UI>Quick budget</UI> — fills each not-yet-budgeted category from its own 3-month average. Great for
            the &ldquo;it&rsquo;s the 1st, paycheck landed&rdquo; ritual.
          </li>
        </ul>
        <p>
          Use the arrows next to the month name to look at past or future months; <UI>Today</UI> brings you back.
        </p>

        <h4 className={styles.section}>Accounts &amp; the transaction register</h4>
        <p>
          The <UI>Transactions</UI> page is your register. It has one deliberate rule:{" "}
          <strong>
            every transaction is either <em>done</em> (white) or <em>needs your review</em> (tan).
          </strong>{" "}
          There&rsquo;s no separate &ldquo;cleared&rdquo; checkbox to fiddle with — reviewing is the work, and
          saving a row is what marks it reviewed.
        </p>
        <ul>
          <li>
            <strong>Adding by hand:</strong> click into the entry row, pick a payee, category, and amount.
            Outflows are spending; a positive amount with a payer records income. Categorize everything — an
            uncategorized transaction is invisible to your budget (the money leaves your account but no category
            feels it, which is how budgets drift from reality).
          </li>
          <li>
            <strong>Transfers:</strong> pick <UI>Transfer to</UI> and the other account. Transfers move money
            between your own accounts, so they&rsquo;re never income and never spending — no category involved
            (paying a credit card is a transfer; see below).
          </li>
          <li>
            <strong>Account types:</strong> Checking, Savings, and Credit are <em>on-budget</em> — their money is
            what you budget. <strong>Investment and Loan accounts are tracking accounts</strong>: they count
            toward net worth, but their transactions never touch your categories or Ready to Assign. Your
            retirement account is part of your wealth, not part of this month&rsquo;s grocery decision.
          </li>
        </ul>

        <h4 className={styles.section}>Importing from your bank</h4>
        <p>
          Download transactions from your bank (QFX/OFX, or a CSV with Date, Payee, Amount, Memo columns) and use{" "}
          <UI>Import transactions</UI> on the account. Then:
        </p>
        <ul>
          <li>
            Imported rows arrive <strong>tan — needs review</strong>. They already count against the account
            balance (the money really did leave), but they do <strong>not</strong> touch any category until you
            approve them. Pending rows are facts you haven&rsquo;t accepted into the plan yet.
          </li>
          <li>
            The app <strong>guesses a category</strong> for each imported row based on how <em>you</em>{" "}
            categorized that merchant before. The guess is a suggestion — review it, fix it if it&rsquo;s wrong,
            then <UI>Approve</UI>. Every approval teaches the next import.
          </li>
          <li>
            Approve one row by saving it, or tick several and <UI>Approve selected</UI>. A transaction needs a
            category before it can be approved.
          </li>
          <li>
            Re-importing an overlapping export is safe — rows you already have are skipped automatically. Imported
            a file by mistake? <UI>Undo import</UI> removes the not-yet-reviewed rows it added.
          </li>
        </ul>

        <h4 className={styles.section}>Credit cards (the clever part)</h4>
        <p>
          When you buy $50 of groceries on your Visa, no money leaves your bank — so what stops you from spending
          that $50 twice? The moment you record the purchase, $50 moves from <em>Groceries</em> to a special{" "}
          <strong>payment category</strong> for that card (&ldquo;Visa Payment&rdquo;). Your budget now says:
          groceries down $50, and $50 sitting in &ldquo;money set aside to pay Visa.&rdquo;
        </p>
        <p>
          When you actually pay the card, record it as a <strong>transfer</strong> from checking to the Visa
          account. The payment category goes back down. Nothing about paying the bill is &ldquo;spending&rdquo; —
          the spending happened at the grocery store; the payment just moves already-assigned dollars.
        </p>
        <p>
          The payment category row shows a breakdown of exactly which purchases fed it, so the number is never
          mysterious. If a card&rsquo;s payment category Available doesn&rsquo;t cover the whole card balance,
          that&rsquo;s the app telling you some card debt isn&rsquo;t budgeted for yet — assign money to the
          payment category directly to chip away at it.
        </p>

        <h4 className={styles.section}>Checking your balance (&ldquo;Adjust balance&rdquo;)</h4>
        <p>
          Every so often, make the app agree with your bank. On an account, click <UI>Adjust balance</UI> and type
          your actual bank balance:
        </p>
        <ul>
          <li>If they match — great, the app records that the account checked out clean.</li>
          <li>If they&rsquo;re off, the app adds a single adjustment transaction so they match again.</li>
        </ul>
        <p>
          You&rsquo;ll be asked to review (approve) any pending imported rows first — comparing against your bank
          while unreviewed transactions are in the pile would produce a bogus adjustment. The account header shows
          when the balance was last checked.
        </p>

        <h4 className={styles.section}>Reports</h4>
        <p>
          The <UI>Reports</UI> page reads from the same data as everything else: income vs. spending, spending by
          category, net worth over time, category trends, top merchants, and budget vs. actual — switchable
          between 1/3/6/12-month and year-to-date windows.
        </p>

        <h4 className={styles.section}>When the numbers look wrong</h4>
        <p>Ninety-nine times out of a hundred, a &ldquo;wrong&rdquo; number is one of these:</p>
        <ol>
          <li>
            <strong>Uncategorized spending</strong> — money left an account but no category recorded it. Filter
            the register by <em>Uncategorized</em> and give those transactions jobs.
          </li>
          <li>
            <strong>Unreviewed imports</strong> — tan rows count against account balances but not against
            categories, so the register and the budget will disagree until you review them. That gap <em>is</em>{" "}
            the feature: it&rsquo;s your to-do pile.
          </li>
          <li>
            <strong>A transfer recorded as income or spending</strong> — moving your own money between accounts
            should always be a Transfer. Recorded any other way, it inflates income or spending.
          </li>
          <li>
            <strong>Ready to Assign is negative</strong> — you assigned money you don&rsquo;t have. Reduce
            Assigned somewhere until it&rsquo;s back to zero.
          </li>
        </ol>
        <p>
          And one thing that is <em>never</em> the fix: shuffling assignments can&rsquo;t repair a mismatch
          between the app and reality. Assigning moves dollars between &ldquo;undecided&rdquo; and a category — it
          can&rsquo;t create, destroy, or recount them. If the totals are off, the error is always in a{" "}
          <em>transaction</em> (missing, uncategorized, or mis-recorded), never in the assignments.
        </p>
      </div>
    </div>
  );
}
