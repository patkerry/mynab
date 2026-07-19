"use client";

import { useState } from "react";
import { ModalShell } from "./ModalShell";
import { addCategory } from "@/app/(app)/budget/actions";

export function CategoryModal({ close, groupId }: { close: () => void; groupId: string }) {
  const [name, setName] = useState("");

  const save = async () => {
    if (!name.trim()) return;
    await addCategory(groupId, name);
    close();
  };

  return (
    <ModalShell title="New category" close={close} onSave={save} saveLabel="Add category">
      <div className="field">
        <label>Category name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Netflix" autoFocus />
      </div>
    </ModalShell>
  );
}
