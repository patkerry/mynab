"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Wallet, PiggyBank, CreditCard, TrendingUp, Landmark, LayoutGrid, ArrowLeftRight, PieChart, Tags, Plus, RotateCcw, CircleDot, Shield, LogOut } from "lucide-react";
import { fmt } from "@/lib/format";
import { useModal } from "./modal/ModalContext";
import { signOutAction } from "@/app/auth-actions";
import type { Account } from "@/generated/prisma-postgres/client";
import styles from "./Sidebar.module.css";

export function Sidebar({
  accounts,
  acctBalance,
  netWorth,
  readyToAssign,
  userName = null,
  isAdmin = false,
  showAuth = false,
  showDemoReset = false,
}: {
  accounts: Account[];
  acctBalance: Record<string, number>;
  netWorth: number;
  readyToAssign: number;
  userName?: string | null;
  isAdmin?: boolean;
  showAuth?: boolean;
  showDemoReset?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { openModal } = useModal();

  const icon = (t: Account["type"]) =>
    t === "SAVINGS" ? PiggyBank : t === "CREDIT" ? CreditCard : t === "INVESTMENT" ? TrendingUp : t === "LOAN" ? Landmark : Wallet;

  const onAccounts = pathname === "/accounts";
  const currentAccount = searchParams.get("account") || "all";
  const currentCategory = searchParams.get("category") || "all";

  // Ready-to-Assign summary, mirroring BudgetView's banner states.
  const rtaState = readyToAssign > 0 ? "pos" : readyToAssign < 0 ? "neg" : "zero";
  const rtaLabel = rtaState === "pos" ? "Ready to Assign" : rtaState === "neg" ? "Over-Assigned" : "All Money Assigned";
  const rtaColor = rtaState === "pos" ? "var(--pos)" : rtaState === "neg" ? "var(--neg)" : "var(--accentDeep)";

  return (
    <aside className={`sidebar ${styles.aside}`}>
      <div className={styles.brand}>
        <div className={styles.logo}>
          <CircleDot size={17} color="#fff" strokeWidth={2.4} />
        </div>
        <div>
          <div className={styles.title}>Assign</div>
          <div className={styles.subtitle}>ZERO-BASED BUDGET</div>
        </div>
      </div>

      {userName && (
        <div className={styles.identity} title={userName}>
          {userName}
        </div>
      )}

      <Link href="/budget" className={styles.rta} style={{ borderColor: rtaColor }}>
        <span className="eyebrow" style={{ color: rtaColor }}>{rtaLabel}</span>
        <span className={`num ${styles.rtaNum}`} style={{ color: rtaState === "neg" ? "var(--neg)" : "var(--ink)" }}>
          {fmt(readyToAssign)}
        </span>
      </Link>

      <nav className={styles.nav}>
        <Link href="/budget" className={`navlink ${pathname === "/budget" ? "active" : ""}`}>
          <LayoutGrid size={17} /> Budget
        </Link>
        <Link href="/accounts" className={`navlink ${onAccounts ? "active" : ""}`}>
          <ArrowLeftRight size={17} /> Transactions
        </Link>
        <Link href="/categories" className={`navlink ${pathname === "/categories" ? "active" : ""}`}>
          <Tags size={17} /> Categories
        </Link>
        <Link href="/reports" className={`navlink ${pathname === "/reports" ? "active" : ""}`}>
          <PieChart size={17} /> Reports
        </Link>
        {isAdmin && (
          <Link href="/admin" className={`navlink ${pathname === "/admin" ? "active" : ""}`}>
            <Shield size={17} /> Admin
          </Link>
        )}
      </nav>

      <div className={`acct-list ${styles.acctList}`}>
        <Link
          href="/accounts?account=all&category=all"
          className={`navlink ${styles.allAccounts}`}
          style={{ background: onAccounts && currentAccount === "all" && currentCategory === "all" ? "var(--accentSoft)" : "transparent" }}
        >
          <span className="eyebrow">All accounts</span>
          <span className={`num ${styles.allBalance}`} style={{ color: netWorth >= 0 ? "var(--ink)" : "var(--neg)" }}>
            {fmt(netWorth)}
          </span>
        </Link>
        {accounts.map((a) => {
          const I = icon(a.type);
          const bal = acctBalance[a.id] ?? 0;
          const active = onAccounts && currentAccount === a.id && currentCategory === "all";
          return (
            <Link
              key={a.id}
              href={`/accounts?account=${a.id}&category=all`}
              className={`navlink ${styles.acctLink}`}
              style={{
                background: active ? "var(--accentSoft)" : "transparent",
                color: active ? "var(--accent)" : "var(--ink)",
              }}
            >
              <I size={16} color={active ? "var(--accent)" : "var(--ink3)"} />
              <span className={styles.acctName}>{a.name}</span>
              <span
                className={`num ${styles.acctBalance}`}
                style={{ color: bal < 0 ? "var(--neg)" : active ? "var(--accent)" : "var(--ink2)" }}
              >
                {fmt(bal)}
              </span>
            </Link>
          );
        })}
        <button className={`navlink ${styles.addBtn}`} onClick={() => openModal({ type: "account" })}>
          <Plus size={16} /> Add account
        </button>
      </div>

      {showDemoReset && (
        <button className={`btn btn-ghost ${styles.centerBtn}`} onClick={() => openModal({ type: "reset" })}>
          <RotateCcw size={14} /> Reset demo data
        </button>
      )}

      {showAuth && (
        <form action={signOutAction}>
          <button type="submit" className={`btn btn-ghost ${styles.fullBtn}`}>
            <LogOut size={14} /> Sign out
          </button>
        </form>
      )}
    </aside>
  );
}
