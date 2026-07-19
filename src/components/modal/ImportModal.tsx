"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "./ModalShell";
import { importTransactions } from "@/app/(app)/accounts/actions";
import { useToast } from "../toast/ToastContext";
import type { Account } from "@/generated/prisma-postgres/client";

export function ImportModal({ close, accountId, accounts }: { close: () => void; accountId: string; accounts: Account[] }) {
  const [selectedAccountId, setSelectedAccountId] = useState(accountId || accounts[0]?.id || "");
  const [importing, setImporting] = useState(false);
  // Track the chosen file in state (not just the input ref) so the Import button can reflect
  // readiness and the UI can show what's selected — otherwise clicking Import before picking a
  // file silently no-ops, which reads as "the button doesn't work".
  const [file, setFile] = useState<File | null>(null);
  // Alternative to the file picker: paste the file's raw text. Works in environments where the
  // native file dialog is unavailable (e.g. VS Code's Simple Browser / embedded webviews).
  const [pasted, setPasted] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { showToast } = useToast();

  const save = async () => {
    if (!selectedAccountId) {
      showToast("Pick an account to import into.");
      return;
    }
    if (!file && !pasted.trim()) {
      showToast("Choose a file, or paste its contents, to import.");
      return;
    }
    setImporting(true);
    let result;
    try {
      const text = file ? await file.text() : pasted;
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
        {/* No `accept` restriction on purpose: macOS Finder greys out (makes unselectable) any file
            whose extension/UTI isn't listed, which blocks legitimate bank exports (.qbo, uppercase
            .QFX, no-extension, or files macOS reports with an unexpected MIME). Format is detected
            from the file's actual contents (isQfx in src/lib/qfx.ts) and unsupported files get a
            clear error on import, so letting the user pick any file is both safer and less confusing. */}
        <input
          ref={fileRef}
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file && <span style={{ fontSize: 12, color: "var(--ink2)", marginTop: 4 }}>Selected: {file.name}</span>}
      </div>
      <div className="field">
        <label>…or paste the file&rsquo;s contents</label>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          disabled={!!file}
          rows={5}
          placeholder="Open the CSV/QFX in a text editor, copy everything, and paste here — no file picker needed."
          style={{
            width: "100%",
            fontFamily: "ui-monospace, monospace",
            fontSize: 12,
            padding: "8px 10px",
            borderRadius: 9,
            border: "1px solid var(--line)",
            background: file ? "var(--paper)" : "#fff",
            resize: "vertical",
          }}
        />
        {pasted.trim() && !file && (
          <span style={{ fontSize: 12, color: "var(--ink2)", marginTop: 4 }}>{pasted.length.toLocaleString()} characters pasted</span>
        )}
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
