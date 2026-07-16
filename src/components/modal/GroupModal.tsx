"use client";

import { useState } from "react";
import { ModalShell } from "./ModalShell";
import { addGroup } from "@/app/budget/actions";

export function GroupModal({ close }: { close: () => void }) {
  const [name, setName] = useState("");

  const save = async () => {
    if (!name.trim()) return;
    await addGroup(name);
    close();
  };

  return (
    <ModalShell title="New category group" close={close} onSave={save} saveLabel="Add group">
      <div className="field">
        <label>Group name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Subscriptions" autoFocus />
      </div>
    </ModalShell>
  );
}
