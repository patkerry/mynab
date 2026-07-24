"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { suspendUser, reactivateUser, deleteUser } from "./actions";
import styles from "./AdminUserActions.module.css";

// Row actions for the admin users table. Client component so destructive actions get a confirm and
// buttons can disable while the server action runs.
export function AdminUserActions({
  userId,
  email,
  suspended,
  isSelf,
}: {
  userId: string;
  email: string;
  suspended: boolean;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (isSelf) return <span className={styles.you}>(you)</span>;

  return (
    <span className={styles.actions}>
      {suspended ? (
        <button
          disabled={pending}
          onClick={() => startTransition(async () => { await reactivateUser(userId); router.refresh(); })}
          className={`${styles.btn} ${styles.reactivate}`}
        >
          Reactivate
        </button>
      ) : (
        <button
          disabled={pending}
          onClick={() => startTransition(async () => { await suspendUser(userId); router.refresh(); })}
          className={`${styles.btn} ${styles.suspend}`}
        >
          Suspend
        </button>
      )}
      <button
        disabled={pending}
        onClick={() => {
          if (confirm(`Permanently delete ${email} and the budgets they solely own? This cannot be undone.`)) {
            startTransition(async () => { await deleteUser(userId); router.refresh(); });
          }
        }}
        className={`${styles.btn} ${styles.delete}`}
      >
        Delete
      </button>
    </span>
  );
}
