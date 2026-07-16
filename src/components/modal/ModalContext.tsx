"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Category } from "@/generated/prisma/client";
import { ModalHost } from "./ModalHost";

export type ModalState =
  | { type: "account" }
  | { type: "group" }
  | { type: "category"; groupId: string }
  | { type: "goal"; cat: Category }
  | { type: "reset" }
  | { type: "reconcile"; accountId: string; accountName: string; currentBalanceCents: number }
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

  return (
    <ModalContext.Provider value={{ openModal: setModal, closeModal: () => setModal(null) }}>
      {children}
      {modal && <ModalHost modal={modal} close={() => setModal(null)} />}
    </ModalContext.Provider>
  );
}
