"use client";

import { EditEntityModal } from "./EditEntityModal";
import { renameAccount, deleteAccount } from "@/app/(app)/accounts/actions";
import type { Account } from "@/generated/prisma-postgres/client";

// Rename / delete an account — the same two-step-confirm dialog categories and groups use.
// Delete removes the account's WHOLE history (transactions, transfer counterpart legs, a card's
// payment category + its assignments); it exists mostly to clean up accidental duplicates.
export function EditAccountModal({ close, account }: { close: () => void; account: Account }) {
  return (
    <EditEntityModal
      close={close}
      title="Rename or delete account"
      label="Account name"
      placeholder="e.g. Everyday Chequing"
      initialName={account.name}
      deleteLabel="Delete account and ALL its transactions"
      onRename={(name) => renameAccount(account.id, name)}
      onDelete={() => deleteAccount(account.id)}
    />
  );
}
