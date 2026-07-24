import styles from "./help.module.css";

// The in-app user guide. Static prose — no data fetching. The philosophy part comes first on
// purpose: zero-based budgeting isn't what most people mean by "budgeting," and users who skip
// the reframe tend to read correct numbers as bugs. Source of truth for the guide's content is
// THIS file; USER_GUIDE.md in the repo root is just a pointer here.
export default function HelpPage() {
  const UI = ({ children }: { children: React.ReactNode }) => <span className={styles.ui}>{children}</span>;

  return (
    <div className={styles.page}>
      <div>
        <h2 className={styles.h2}>How to use Assign</h2>
        <div className={styles.desc}>Five minutes on the idea behind it, then the actual screens.</div>
      </div>

      <div className={styles.prose}>
        <p>
          Assign is a zero-based budgeting app. The method is simple, but it isn&rsquo;t what most people mean
          when they say &ldquo;budget,&rdquo; and if you come in with the usual meaning the numbers will seem
          wrong even when they aren&rsquo;t. So it&rsquo;s worth a few minutes before you start clicking around.
        </p>

        <h3 className={styles.part}>Part 1 — The idea</h3>

        <div className={styles.thesis}>
          You don&rsquo;t plan future spending out of money you expect. You decide what the money you already
          have is for.
        </div>

        <p>
          Most of what follows is just that sentence applied over and over. The catch is that it goes against a
          few things nearly everyone believes about budgeting, so here they are, one at a time.
        </p>

        <h4 className={styles.section}>&ldquo;A budget is a forecast&rdquo;</h4>
        <p>
          The usual kind of budget is a prediction. I&rsquo;ll make $4,000 next month, so groceries get $500.
          Then the month goes differently, the plan stops matching reality, and by week two nobody&rsquo;s
          looking at it anymore.
        </p>
        <p>
          Here you never budget money you don&rsquo;t have yet. When a paycheck lands, you assign it. Until
          then it isn&rsquo;t in the budget at all. There&rsquo;s nothing to predict, so there&rsquo;s nothing
          to be wrong about, which is most of the reason this method sticks where forecasts don&rsquo;t.
        </p>

        <h4 className={styles.section}>&ldquo;Going over budget means I failed&rdquo;</h4>
        <p>
          With a normal budget, blowing a category feels like failure, and after enough failures people quit.
          In this system overspending just means the plan needs updating. Groceries ran $60 over? Take $60 from
          a category you care less about and move on. The rule was never &ldquo;don&rsquo;t overspend.&rdquo;
          The rule is that the categories always add up to the money you actually have, so covering groceries
          has to come from somewhere real, and you have to pick where. Picking is the whole exercise. Moving
          money between categories isn&rsquo;t cheating; it&rsquo;s what the tool is for.
        </p>

        <h4 className={styles.section}>&ldquo;Savings is what&rsquo;s left over&rdquo;</h4>
        <p>
          If you save whatever&rsquo;s left at the end of the month, there&rsquo;s usually nothing left. In a
          zero-based budget, saving is a category like any other. Vacation, emergency fund, new tires. You put
          dollars there on purpose, and they&rsquo;re spoken for the same way rent is. They just get spent
          later.
        </p>
        <p>
          The same trick handles irregular bills, and honestly it&rsquo;s the most useful part of the whole
          method. A car repair isn&rsquo;t really an emergency. Cars break on a schedule; you just don&rsquo;t
          know the dates. Put $50 a month into Auto Maintenance and the $600 repair in November is annoying
          instead of a crisis, because the money is already sitting there. Skip it and the same repair goes on
          a credit card. Same car, same repair. The only difference is whether the money was set aside first.
        </p>

        <h4 className={styles.section}>&ldquo;My account balance tells me what I can spend&rdquo;</h4>
        <p>
          This one does the most damage. Checking says $2,300, so a $400 jacket feels fine. Except $1,200 of
          that is rent, $300 is the insurance bill due in three weeks, and $250 needs to go to the credit card.
          The balance is real, but most of it is already claimed.
        </p>
        <p>
          So in this app you never decide a purchase by looking at an account. You look at the category. If Fun
          Money shows $120 Available, the jacket is a no. That number already accounts for rent and the
          insurance bill, because those dollars are assigned somewhere else.
        </p>

        <h4 className={styles.section}>Why &ldquo;zero&rdquo;</h4>
        <p>
          The target is <strong>Ready to Assign: $0.00</strong>. Zero doesn&rsquo;t mean broke. It means every
          dollar has an assignment. Money you put in Vacation still counts; you just haven&rsquo;t spent it
          yet. The reason to chase zero is that unassigned money tends to disappear without a decision ever
          getting made, and preventing exactly that is the point of the method.
        </p>
        <p>
          Day to day it comes down to two habits. When money comes in, assign all of it. When a category runs
          dry, move money from another category instead of quietly spending past it. The app handles the rest
          of the arithmetic.
        </p>

        <h3 className={styles.part}>Part 2 — Using the app</h3>

        <h4 className={styles.section}>Getting started</h4>
        <p>
          A new budget comes with a starter set of category groups: Immediate Obligations (rent, utilities,
          groceries), True Expenses (car maintenance, insurance, subscriptions), Quality of Life (dining out,
          fun money, vacation). It&rsquo;s a suggestion, not a rule. Rename, add, or hide categories on the{" "}
          <UI>Categories</UI> page until it matches your life.
        </p>
        <p>
          Then add your accounts (sidebar → <UI>Add account</UI>) with their current balances. Whatever you
          enter shows up as Ready to Assign, and your first budgeting session is just assigning all of it until
          that number reads $0.00.
        </p>

        <h4 className={styles.section}>The sidebar</h4>
        <ul>
          <li>
            <strong>Ready to Assign</strong> sits at the top. Green means there&rsquo;s unassigned money. Red
            (&ldquo;Over-Assigned&rdquo;) means you&rsquo;ve assigned dollars you don&rsquo;t have and should
            take some back. Clicking it takes you to the Budget page.
          </li>
          <li>All accounts shows net worth, every account combined, including tracking accounts.</li>
          <li>
            Each account shows its live balance. Per the section above, these are for checking against your
            bank, not for deciding what you can spend.
          </li>
        </ul>

        <h4 className={styles.section}>The Budget page</h4>
        <p>One row per category, three numbers each:</p>
        <ul>
          <li>
            <strong>Assigned</strong> — what you gave this category this month. Click and type to change it.
          </li>
          <li>
            <strong>Activity</strong> — what actually happened this month. Spending shows negative.
          </li>
          <li>
            <strong>Available</strong> — everything ever assigned minus everything ever spent. Leftover money
            rolls forward on its own, so $180 Available in Groceries is $180 you can spend, no matter which
            month it was assigned in. This is the number you check in the store.
          </li>
        </ul>
        <p>
          A red Available means the category is overspent: a dollar got spent that some other category thinks
          it still has. Fix it by assigning more (which pulls from Ready to Assign) or by lowering another
          category and raising this one. Either way, don&rsquo;t leave it red.
        </p>
        <p>A few helpers once you have some history:</p>
        <ul>
          <li>
            <UI>Set goal</UI> on a category. Either &ldquo;Assign each month&rdquo; (say, $450 for groceries)
            or &ldquo;Total to save&rdquo; (a $2,000 vacation target you chip away at).
          </li>
          <li>
            <UI>Auto-assign goals</UI> fills categories up to their goals from Ready to Assign, top to bottom,
            until the money runs out.
          </li>
          <li>
            <UI>Quick budget</UI> fills each empty category from its own three-month average. Useful on payday.
          </li>
        </ul>
        <p>
          The arrows next to the month name move between months; <UI>Today</UI> brings you back.
        </p>

        <h4 className={styles.section}>The transaction register</h4>
        <p>
          The <UI>Transactions</UI> page has one rule: every row is either done (white) or needs your review
          (tan). There&rsquo;s no separate &ldquo;cleared&rdquo; checkbox to manage. Reviewing is the work, and
          saving a row is what marks it reviewed.
        </p>
        <ul>
          <li>
            Adding by hand: click into the entry row, pick a payee, category, and amount. A positive amount
            with a payer records income. Categorize everything. An uncategorized transaction takes money out of
            the account without any category noticing, and that&rsquo;s how the budget and reality drift apart.
          </li>
          <li>
            Transfers: pick <UI>Transfer to</UI> and the other account. Moving money between your own accounts
            is never income and never spending, so no category is involved. Paying a credit card is a transfer,
            more on that below.
          </li>
          <li>
            Account types: Checking, Savings, and Credit are on-budget; their money is what you&rsquo;re
            budgeting. Investment and Loan accounts are tracking accounts. They count toward net worth, but
            their transactions never touch categories or Ready to Assign. Your retirement account is part of
            your wealth, not part of this month&rsquo;s grocery decision.
          </li>
        </ul>

        <h4 className={styles.section}>Importing from your bank</h4>
        <p>
          Download transactions from your bank (QFX/OFX, or a CSV with Date, Payee, Amount, Memo columns) and
          use <UI>Import transactions</UI> on the account.
        </p>
        <ul>
          <li>
            Imported rows arrive tan, needing review. They count against the account balance right away, since
            the money really did move, but they don&rsquo;t touch any category until you approve them.
          </li>
          <li>
            The app guesses a category for each row based on how you&rsquo;ve categorized that merchant before.
            Check the guess, fix it if it&rsquo;s wrong, then <UI>Approve</UI>. Each approval improves the next
            import&rsquo;s guesses.
          </li>
          <li>
            Approve one row by saving it, or tick several and use <UI>Approve selected</UI>. A row needs a
            category before it can be approved.
          </li>
          <li>
            Re-importing an overlapping export is safe; rows you already have get skipped. If you imported the
            wrong file, <UI>Undo import</UI> removes the unreviewed rows it added.
          </li>
        </ul>

        <h4 className={styles.section}>Credit cards</h4>
        <p>
          Buy $50 of groceries on your Visa and no money leaves your bank, so what stops you from spending that
          $50 again? Here, recording the purchase moves $50 from Groceries into a payment category for that
          card (&ldquo;Visa Payment&rdquo;). The budget now shows groceries down $50 and $50 set aside to pay
          Visa.
        </p>
        <p>
          When you pay the card, record it as a transfer from checking to the Visa account. The payment
          category goes back down. Paying the bill isn&rsquo;t spending; the spending happened at the store.
          The payment just moves dollars that were already set aside.
        </p>
        <p>
          The payment category row shows which purchases fed it, so the number is never a mystery. And if the
          payment category&rsquo;s Available doesn&rsquo;t cover the full card balance, that&rsquo;s card debt
          you haven&rsquo;t budgeted for yet. You can assign money to the payment category directly to chip
          away at it.
        </p>

        <h4 className={styles.section}>Checking against your bank</h4>
        <p>
          Every so often, make the app agree with your bank. On an account, click <UI>Adjust balance</UI> and
          type your actual bank balance. If they match, the app records that the account checked out clean. If
          they&rsquo;re off, it adds one adjustment transaction so they match again.
        </p>
        <p>
          You&rsquo;ll be asked to deal with any unreviewed imported rows first, since comparing against your
          bank with unreviewed transactions in the pile would produce a meaningless adjustment. The account
          header shows when the balance was last checked.
        </p>

        <h4 className={styles.section}>Reports</h4>
        <p>
          The <UI>Reports</UI> page shows income vs. spending, spending by category, net worth over time,
          category trends, top merchants, and budget vs. actual, over 1/3/6/12-month or year-to-date windows.
        </p>

        <h4 className={styles.section}>When the numbers look wrong</h4>
        <p>It&rsquo;s almost always one of these:</p>
        <ol>
          <li>
            Uncategorized spending. Money left an account and no category recorded it. Filter the register by
            Uncategorized and assign those rows.
          </li>
          <li>
            Unreviewed imports. Tan rows count against account balances but not against categories, so the
            register and the budget disagree until you review them.
          </li>
          <li>
            A transfer recorded as income or spending. Moving your own money between accounts should always be
            a Transfer; recorded any other way it inflates income or spending.
          </li>
          <li>Ready to Assign is negative. You assigned money you don&rsquo;t have. Lower something.</li>
        </ol>
        <p>
          One thing that never fixes a mismatch: moving assignments around. Assigning shifts dollars between
          &ldquo;undecided&rdquo; and a category. It can&rsquo;t create them, lose them, or recount them. If
          the totals disagree with reality, the problem is a transaction that&rsquo;s missing, uncategorized,
          or recorded wrong.
        </p>
      </div>
    </div>
  );
}
