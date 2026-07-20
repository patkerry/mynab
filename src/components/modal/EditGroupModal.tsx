"use client";

import { EditEntityModal } from "./EditEntityModal";
import { renameGroup, deleteGroup } from "@/app/(app)/budget/actions";
import type { CategoryGroup } from "@/generated/prisma-postgres/client";

export function EditGroupModal({ close, group }: { close: () => void; group: CategoryGroup }) {
  return (
    <EditEntityModal
      close={close}
      title="Edit category group"
      label="Category group name"
      placeholder="e.g. Subscriptions"
      initialName={group.name}
      deleteLabel="Delete group"
      onRename={(name) => renameGroup(group.id, name)}
      onDelete={() => deleteGroup(group.id)}
    />
  );
}
