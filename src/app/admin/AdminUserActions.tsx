"use client";

import { useTransition } from "react";
import { suspendUser, reactivateUser, deleteUser } from "./actions";

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

  if (isSelf) return <span style={{ color: "#999", fontSize: 13 }}>(you)</span>;

  return (
    <span style={{ display: "inline-flex", gap: 8 }}>
      {suspended ? (
        <button
          disabled={pending}
          onClick={() => startTransition(() => reactivateUser(userId))}
          style={btn("#0a7")}
        >
          Reactivate
        </button>
      ) : (
        <button
          disabled={pending}
          onClick={() => startTransition(() => suspendUser(userId))}
          style={btn("#b70")}
        >
          Suspend
        </button>
      )}
      <button
        disabled={pending}
        onClick={() => {
          if (confirm(`Permanently delete ${email} and the budgets they solely own? This cannot be undone.`)) {
            startTransition(() => deleteUser(userId));
          }
        }}
        style={btn("#c33")}
      >
        Delete
      </button>
    </span>
  );
}

function btn(color: string): React.CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: 6,
    border: `1px solid ${color}`,
    color,
    background: "transparent",
    fontSize: 13,
    cursor: "pointer",
  };
}
