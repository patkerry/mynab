"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Wallet, PiggyBank, CreditCard, TrendingUp, Landmark, LayoutGrid, ArrowLeftRight, PieChart, Tags, Plus, RotateCcw, CircleDot, Shield, LogOut } from "lucide-react";
import { fmt } from "@/lib/format";
import { useModal } from "./modal/ModalContext";
import { signOutAction } from "@/app/auth-actions";
import type { Account } from "@/generated/prisma-postgres/client";

export function Sidebar({
  accounts,
  acctBalance,
  netWorth,
  isAdmin = false,
  showAuth = false,
  showDemoReset = false,
}: {
  accounts: Account[];
  acctBalance: Record<string, number>;
  netWorth: number;
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

  return (
    <aside
      className="sidebar"
      style={{
        width: 268,
        background: "var(--surface)",
        borderRight: "1px solid var(--line)",
        padding: "20px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 22,
        position: "sticky",
        top: 0,
        height: "100vh",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px" }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            background: "var(--accent)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <CircleDot size={17} color="#fff" strokeWidth={2.4} />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.02em" }}>Assign</div>
          <div style={{ fontSize: 10, color: "var(--ink3)", fontWeight: 600, letterSpacing: ".04em", marginTop: -1 }}>
            ZERO-BASED BUDGET
          </div>
        </div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
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

      <div
        className="acct-list"
        style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}
      >
        <Link
          href="/accounts?account=all&category=all"
          className="navlink"
          style={{
            justifyContent: "space-between",
            padding: "6px 6px",
            marginBottom: 2,
            background: onAccounts && currentAccount === "all" && currentCategory === "all" ? "var(--accentSoft)" : "transparent",
          }}
        >
          <span className="eyebrow">All accounts</span>
          <span className="num" style={{ fontSize: 12, fontWeight: 700, color: netWorth >= 0 ? "var(--ink)" : "var(--neg)" }}>
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
              className="navlink"
              style={{
                gap: 9,
                padding: "8px 8px",
                fontWeight: 600,
                background: active ? "var(--accentSoft)" : "transparent",
                color: active ? "var(--accent)" : "var(--ink)",
              }}
            >
              <I size={16} color={active ? "var(--accent)" : "var(--ink3)"} />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  flex: 1,
                  textAlign: "left",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {a.name}
              </span>
              <span
                className="num"
                style={{ fontSize: 12.5, fontWeight: 600, color: bal < 0 ? "var(--neg)" : active ? "var(--accent)" : "var(--ink2)" }}
              >
                {fmt(bal)}
              </span>
            </Link>
          );
        })}
        <button className="navlink" style={{ color: "var(--accent)", fontSize: 13, marginTop: 2 }} onClick={() => openModal({ type: "account" })}>
          <Plus size={16} /> Add account
        </button>
      </div>

      {showDemoReset && (
        <button className="btn btn-ghost" style={{ justifyContent: "center" }} onClick={() => openModal({ type: "reset" })}>
          <RotateCcw size={14} /> Reset demo data
        </button>
      )}

      {showAuth && (
        <form action={signOutAction}>
          <button type="submit" className="btn btn-ghost" style={{ justifyContent: "center", width: "100%" }}>
            <LogOut size={14} /> Sign out
          </button>
        </form>
      )}
    </aside>
  );
}
