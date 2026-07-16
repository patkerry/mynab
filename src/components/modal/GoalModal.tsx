"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { setGoal, removeGoal } from "@/app/budget/actions";
import { parseMoney } from "@/lib/format";
import type { Category, GoalType } from "@/generated/prisma/client";

export function GoalModal({ close, cat }: { close: () => void; cat: Category }) {
  const [type, setType] = useState<GoalType>(cat.goalType || "MONTHLY");
  const [amount, setAmount] = useState(cat.goalAmountCents != null ? (cat.goalAmountCents / 100).toFixed(2) : "");

  const save = async () => {
    await setGoal(cat.id, type, parseMoney(amount));
    close();
  };
  const remove = async () => {
    await removeGoal(cat.id);
    close();
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <h3 style={{ fontWeight: 700, fontSize: 16 }}>Goal · {cat.name}</h3>
        <button onClick={close} style={{ color: "var(--ink3)" }}>
          <X size={19} />
        </button>
      </div>
      <div style={{ padding: "18px 20px" }}>
        <div className="field">
          <label>Goal type</label>
          <div className="seg">
            <button className={type === "MONTHLY" ? "on" : ""} onClick={() => setType("MONTHLY")}>
              Monthly funding
            </button>
            <button className={type === "TARGET" ? "on" : ""} onClick={() => setType("TARGET")}>
              Savings target
            </button>
          </div>
        </div>
        <div className="field">
          <label>{type === "MONTHLY" ? "Assign each month" : "Total to save"}</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="num" autoFocus />
        </div>
        <p style={{ fontSize: 12, color: "var(--ink3)", margin: 0 }}>
          {type === "MONTHLY" ? "Progress tracks this month's assigned amount." : "Progress tracks total available in the category."}
        </p>
      </div>
      <div style={{ display: "flex", gap: 10, padding: "0 20px 18px", justifyContent: "space-between" }}>
        <button className="btn btn-ghost" style={{ color: "var(--neg)" }} onClick={remove} disabled={!cat.goalType}>
          Remove goal
        </button>
        <div style={{ display: "flex", gap: 10 }}>
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
