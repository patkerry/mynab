"use client";

import { useState } from "react";
import { RECIPES } from "./recipes";
import styles from "./help.module.css";

// The in-app user guide: the zero-based-budgeting philosophy first (users who skip the reframe
// read correct numbers as bugs), then a searchable, wiki-style "How do I…?" list — task-shaped
// entries instead of a manual to read cover to cover. Content lives in recipes.tsx; this file is
// the source of truth USER_GUIDE.md points at. Client component purely for the search box —
// there's no data fetching.

export default function HelpPage() {
  const [query, setQuery] = useState("");
  // Every typed word must appear somewhere in the question or its keywords.
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = RECIPES.filter((r) => {
    const hay = (r.q + " " + r.keywords).toLowerCase();
    return words.every((w) => hay.includes(w));
  });

  return (
    <div className={styles.page}>
      <div>
        <h2 className={styles.h2}>How to use Assign</h2>
        <div className={styles.desc}>Five minutes on the idea behind it, then answers by task.</div>
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

        <h3 className={styles.part}>Part 2 — How do I…?</h3>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Search — try "paycheck", "split", "credit card", "wrong"…'
          aria-label="Search the how-do-I list"
          className={styles.searchBox}
        />

        {matches.length === 0 && (
          <p className={styles.noMatch}>
            Nothing matches &ldquo;{query}&rdquo;. Try a different word — or clear the search to see everything.
          </p>
        )}

        <div className={styles.recipeList}>
          {matches.map((r) => (
            // While searching, matches open themselves — you searched for it, show the answer.
            <details key={r.q} className={styles.recipe} open={words.length > 0 || undefined}>
              <summary className={styles.recipeQ}>{r.q}</summary>
              <ol className={styles.recipeSteps}>
                {r.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
