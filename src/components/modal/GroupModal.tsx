"use client";

import { useState } from "react";
import { ModalShell } from "./ModalShell";
import { addGroup } from "@/app/(app)/budget/actions";

export function GroupModal({ close }: { close: () => void }) {
  const [name, setName] = useState("");

  const save = async () => {
    if (!name.trim()) return;
    await addGroup(name);
    close();
  };

  return (
    <ModalShell title="New category group" close={close} onSave={save} saveLabel="Add category group">
      <div className="field">
        <label htmlFor="f-category-group-name">Category group name</label>
        <input id="f-category-group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Subscriptions" autoFocus />
      </div>
    </ModalShell>
  );
}
