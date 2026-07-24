"use client";

import { useEffect, useRef } from "react";
import type { ModalState } from "./ModalContext";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
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
  const dialogRef = useRef<HTMLDivElement>(null);

  // Keyboard contract for every modal: Escape closes (matching TxnEditorRow), Tab cycles WITHIN
  // the dialog (the page keeps rendering behind the overlay — without a trap, Tab walked straight
  // out into it, the same hazard ARCHITECTURE.md documents for unscoped Playwright selectors).
  // Focus returns to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    // Modals autoFocus their first input; if one doesn't, seed focus into the dialog.
    if (dialog && !dialog.contains(document.activeElement)) {
      dialog.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && dialog) {
        const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute("disabled"));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (!dialog.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [close]);

  return (
    <div className="modal-bg" onClick={close}>
      <div ref={dialogRef} className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
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
