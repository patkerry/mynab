"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { setGoal, removeGoal } from "@/app/(app)/budget/actions";
import { parseMoney } from "@/lib/format";
import { useToast } from "../toast/ToastContext";
import type { Category, GoalType } from "@/generated/prisma-postgres/client";
import m from "./modal.module.css";

export function GoalModal({ close, cat }: { close: () => void; cat: Category }) {
  // A savings TARGET doesn't make sense on a payment category (its available rises with more
  // card spending, not with money saved), so only MONTHLY funding is offered for one — see the
  // matching server-side guard in setGoal.
  const isPaymentCategory = cat.linkedAccountId != null;
  const [type, setType] = useState<GoalType>(isPaymentCategory ? "MONTHLY" : cat.goalType || "MONTHLY");
  const [amount, setAmount] = useState(cat.goalAmountCents != null ? (cat.goalAmountCents / 100).toFixed(2) : "");
  const { showToast } = useToast();

  const save = async () => {
    const result = await setGoal(cat.id, type, parseMoney(amount));
    if (!result.ok) {
      showToast(result.reason);
      return;
    }
    close();
  };
  const remove = async () => {
    await removeGoal(cat.id);
    close();
  };

  return (
    <>
      <div className={m.head}>
        <h3 className={m.title}>Goal · {cat.name}</h3>
        <button onClick={close} className={m.close}>
          <X size={19} />
        </button>
      </div>
      <div className={m.body}>
        <div className="field">
          <label>Goal type</label>
          <div className="seg">
            <button className={type === "MONTHLY" ? "on" : ""} onClick={() => setType("MONTHLY")}>
              Monthly funding
            </button>
            <button
              className={`${type === "TARGET" ? "on" : ""} ${isPaymentCategory ? m.segDisabled : ""}`}
              onClick={() => !isPaymentCategory && setType("TARGET")}
              disabled={isPaymentCategory}
              title={isPaymentCategory ? "Not available for payment categories" : undefined}
            >
              Savings target
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="f-goal-amount">{type === "MONTHLY" ? "Assign each month" : "Total to save"}</label>
          <input id="f-goal-amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="num" autoFocus />
        </div>
        <p className="hint">
          {isPaymentCategory
            ? "Payment categories can only use monthly funding — their available balance rises with card spending, so a savings target wouldn't track correctly."
            : type === "MONTHLY"
              ? "Progress tracks this month's assigned amount."
              : "Progress tracks total available in the category."}
        </p>
      </div>
      <div className={m.footerSplit}>
        <button className={`btn btn-ghost ${m.removeBtn}`} onClick={remove} disabled={!cat.goalType}>
          Remove goal
        </button>
        <div className={m.footerGroup}>
          <button className="btn btn-ghost" onClick={close}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save goal
          </button>
        </div>
      </div>
    </>
  );
}
