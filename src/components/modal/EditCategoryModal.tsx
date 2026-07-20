"use client";

import { EditEntityModal } from "./EditEntityModal";
import { renameCategory, deleteCategory } from "@/app/(app)/budget/actions";
import type { Category } from "@/generated/prisma-postgres/client";

export function EditCategoryModal({ close, cat }: { close: () => void; cat: Category }) {
  return (
    <EditEntityModal
      close={close}
      title="Edit category"
      label="Category name"
      placeholder="e.g. Netflix"
      initialName={cat.name}
      deleteLabel="Delete category"
      onRename={(name) => renameCategory(cat.id, name)}
      onDelete={() => deleteCategory(cat.id)}
    />
  );
}
