"use client";

import { ModalShell } from "./ModalShell";
import { resetDemoData } from "@/app/actions";
import styles from "./ResetModal.module.css";

export function ResetModal({ close }: { close: () => void }) {
  const reset = async () => {
    await resetDemoData();
    close();
  };

  return (
    <ModalShell title="Reset demo data" close={close} onSave={reset} saveLabel="Reset everything">
      <p className={styles.prose}>
        This replaces all accounts, transactions, categories, and assignments with the original sample budget. This
        can&apos;t be undone.
      </p>
    </ModalShell>
  );
}
