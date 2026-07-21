"use client";

import { useState } from "react";
import { ModalShell } from "./ModalShell";
import { addAccount } from "@/app/(app)/accounts/actions";
import type { AccountType } from "@/generated/prisma-postgres/client";

const TYPE_OPTIONS: [AccountType, string][] = [
  ["CHECKING", "Checking"],
  ["SAVINGS", "Savings"],
  ["CREDIT", "Credit"],
  ["INVESTMENT", "Investment"],
  ["LOAN", "Loan"],
];

const BALANCE_HINT: Partial<Record<AccountType, string>> = {
  INVESTMENT: "Tracked toward net worth — its transactions aren't budgeted.",
  LOAN: "Enter the amount owed — tracked as a liability toward net worth, not budgeted.",
};
const DEFAULT_HINT = "A positive starting balance becomes income you can assign.";

export function AccountModal({ close }: { close: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("CHECKING");
  const [bal, setBal] = useState("");

  const save = async () => {
    if (!name.trim()) return;
    await addAccount({ name, type, balance: bal });
    close();
  };

  return (
    <ModalShell title="Add account" close={close} onSave={save} saveLabel="Add account">
      <div className="field">
        <label>Account name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency Fund" autoFocus />
      </div>
      <div className="field">
        <label>Type</label>
        <div className="seg">
          {TYPE_OPTIONS.map(([v, l]) => (
            <button key={v} className={type === v ? "on" : ""} onClick={() => setType(v)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Current balance</label>
        <input value={bal} onChange={(e) => setBal(e.target.value)} placeholder="0.00" className="num" />
      </div>
      <p style={{ fontSize: 12, color: "var(--ink3)", margin: 0 }}>
        {BALANCE_HINT[type] ?? DEFAULT_HINT}
      </p>
    </ModalShell>
  );
}
