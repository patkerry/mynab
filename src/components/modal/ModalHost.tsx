"use client";

import type { ModalState } from "./ModalContext";
import { AccountModal } from "./AccountModal";
import { GroupModal } from "./GroupModal";
import { CategoryModal } from "./CategoryModal";
import { GoalModal } from "./GoalModal";
import { ResetModal } from "./ResetModal";
import { ReconcileModal } from "./ReconcileModal";

export function ModalHost({ modal, close }: { modal: NonNullable<ModalState>; close: () => void }) {
  return (
    <div className="modal-bg" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {modal.type === "account" && <AccountModal close={close} />}
        {modal.type === "group" && <GroupModal close={close} />}
        {modal.type === "category" && <CategoryModal close={close} groupId={modal.groupId} />}
        {modal.type === "goal" && <GoalModal close={close} cat={modal.cat} />}
        {modal.type === "reset" && <ResetModal close={close} />}
        {modal.type === "reconcile" && (
          <ReconcileModal close={close} accountId={modal.accountId} accountName={modal.accountName} currentBalanceCents={modal.currentBalanceCents} />
        )}
      </div>
    </div>
  );
}
