"use client";

import { ModalShell } from "./ModalShell";
import { resetDemoData } from "@/app/actions";

export function ResetModal({ close }: { close: () => void }) {
  const reset = async () => {
    await resetDemoData();
    close();
  };

  return (
    <ModalShell title="Reset demo data" close={close} onSave={reset} saveLabel="Reset everything">
      <p style={{ fontSize: 14, color: "var(--ink2)", margin: 0, lineHeight: 1.5 }}>
        This replaces all accounts, transactions, categories, and assignments with the original sample budget. This
        can&apos;t be undone.
      </p>
    </ModalShell>
  );
}
