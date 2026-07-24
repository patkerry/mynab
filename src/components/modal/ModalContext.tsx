"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Account, Category, CategoryGroup } from "@/generated/prisma-postgres/client";
import { ModalHost } from "./ModalHost";

export type ModalState =
  | { type: "account" }
  | { type: "group" }
  | { type: "category"; groupId: string }
  | { type: "goal"; cat: Category }
  | { type: "editCategory"; cat: Category }
  | { type: "editGroup"; group: CategoryGroup }
  | { type: "reset" }
  | { type: "reconcile"; accountId: string; accountName: string; currentBalanceCents: number }
  | { type: "import"; accountId: string; accounts: Account[] }
  | null;

type ModalContextValue = {
  openModal: (modal: ModalState) => void;
  closeModal: () => void;
};

const ModalContext = createContext<ModalContextValue | null>(null);

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error("useModal must be used within a ModalProvider");
  return ctx;
}

// A single global modal slot shared across the layout's Sidebar and every route's page
// content — mirrors the original app's single `modal` state at the App component root
// (ynab-clone.jsx line 180), just lifted into context since Sidebar now lives in the
// persistent root layout while BudgetView/AccountsView live in separate route segments.
export function ModalProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalState>(null);
  const router = useRouter();
  // Closing a modal refreshes server data. Modals mutate via server actions, and in this Next 16
  // setup revalidatePath doesn't auto-refresh the client — so a newly added/edited/deleted row
  // wouldn't appear until reload. Refreshing on close covers every modal (a harmless no-op on Cancel).
  const close = () => {
    setModal(null);
    router.refresh();
  };

  return (
    <ModalContext.Provider value={{ openModal: setModal, closeModal: close }}>
      {children}
      {modal && <ModalHost modal={modal} close={close} />}
    </ModalContext.Provider>
  );
}
