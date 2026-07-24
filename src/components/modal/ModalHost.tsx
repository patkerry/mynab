"use client";

import { useEffect } from "react";
import type { ModalState } from "./ModalContext";
import { AccountModal } from "./AccountModal";
import { GroupModal } from "./GroupModal";
import { CategoryModal } from "./CategoryModal";
import { GoalModal } from "./GoalModal";
import { EditCategoryModal } from "./EditCategoryModal";
import { EditGroupModal } from "./EditGroupModal";
import { ResetModal } from "./ResetModal";
import { ReconcileModal } from "./ReconcileModal";
import { ImportModal } from "./ImportModal";

export function ModalHost({ modal, close }: { modal: NonNullable<ModalState>; close: () => void }) {
  // Escape closes any modal — matching TxnEditorRow's keyboard behavior. (Full focus trapping is
  // still a gap; this at least gives keyboard users a way OUT.)
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div className="modal-bg" onClick={close}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {modal.type === "account" && <AccountModal close={close} />}
        {modal.type === "group" && <GroupModal close={close} />}
        {modal.type === "category" && <CategoryModal close={close} groupId={modal.groupId} />}
        {modal.type === "goal" && <GoalModal close={close} cat={modal.cat} />}
        {modal.type === "editCategory" && <EditCategoryModal close={close} cat={modal.cat} />}
        {modal.type === "editGroup" && <EditGroupModal close={close} group={modal.group} />}
        {modal.type === "reset" && <ResetModal close={close} />}
        {modal.type === "reconcile" && (
          <ReconcileModal close={close} accountId={modal.accountId} accountName={modal.accountName} currentBalanceCents={modal.currentBalanceCents} />
        )}
        {modal.type === "import" && <ImportModal close={close} accountId={modal.accountId} accounts={modal.accounts} />}
      </div>
    </div>
  );
}
