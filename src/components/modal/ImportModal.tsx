"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "./ModalShell";
import { importTransactions } from "@/app/accounts/actions";
import { useToast } from "../toast/ToastContext";
import type { Account } from "@/generated/prisma-postgres/client";

export function ImportModal({ close, accountId, accounts }: { close: () => void; accountId: string; accounts: Account[] }) {
  const [selectedAccountId, setSelectedAccountId] = useState(accountId || accounts[0]?.id || "");
  const [importing, setImporting] = useState(false);
  // Track the chosen file in state (not just the input ref) so the Import button can reflect
  // readiness and the UI can show what's selected — otherwise clicking Import before picking a
  // file silently no-ops, which reads as "the button doesn't work".
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { showToast } = useToast();

  const save = async () => {
    if (!selectedAccountId) {
      showToast("Pick an account to import into.");
      return;
    }
    if (!file) {
      showToast("Choose a CSV or QFX file to import first.");
      return;
    }
    setImporting(true);
    let result;
    try {
      const text = await file.text();
      result = await importTransactions(selectedAccountId, text);
    } catch (err) {
      // Never leave the button stuck on "Importing…": surface the failure (e.g. a too-large file
      // exceeding the Server Action body limit, or a network/server error) and reset.
      showToast(err instanceof Error ? `Import failed: ${err.message}` : "Import failed.");
      setImporting(false);
      return;
    }
    setImporting(false);
    if (!result.ok) {
      showToast(result.reason);
      return;
    }
    const notes = [
      result.guessed > 0 ? `${result.guessed} pre-categorized from history` : null,
      result.duplicates > 0 ? `${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"} already present` : null,
      result.skipped > 0 ? `${result.skipped} row${result.skipped === 1 ? "" : "s"} skipped` : null,
    ].filter(Boolean);
    showToast(
      `Imported ${result.imported} transaction${result.imported === 1 ? "" : "s"}${notes.length > 0 ? ` (${notes.join(", ")})` : ""} — review and approve them below.`
    );
    close();
    router.push(`/accounts?account=${selectedAccountId}&category=all`);
  };

  return (
    <ModalShell title="Import transactions" close={close} onSave={save} saveLabel={importing ? "Importing…" : "Import"}>
      <div className="field">
        <label>Account</label>
        <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>CSV or QFX/OFX file</label>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.qfx,.ofx,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file && <span style={{ fontSize: 12, color: "var(--ink2)", marginTop: 4 }}>Selected: {file.name}</span>}
      </div>
      <p style={{ fontSize: 12, color: "var(--ink3)", margin: 0 }}>
        CSV needs columns Date, Payee, Amount, and optionally Memo. QFX/OFX (Quicken, bank
        downloads) is detected automatically — re-importing an overlapping QFX file skips any
        transaction already present (matched by the bank's own transaction id). Imported rows
        count toward this account's balance right away but land as <b>Pending</b> — uncategorized
        and unapproved until you open and save each one in the register.
      </p>
    </ModalShell>
  );
}
