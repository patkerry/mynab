import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Wallet, PiggyBank, CreditCard, Landmark, LayoutGrid, ArrowLeftRight,
  PieChart, Plus, ChevronLeft, ChevronRight, Target, Trash2, X, Check,
  RotateCcw, Sparkles, TrendingUp, CircleDot
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, LineChart, Line, Legend
} from "recharts";

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */
const uid = (p = "id") => p + "_" + Math.random().toString(36).slice(2, 9);
const now = new Date();
const curYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

const monthKeyOf = (dateStr) => (dateStr || "").slice(0, 7);
const addMonths = (ym, delta) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
};
const monthShort = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" });
};
const fmt = (cents) => {
  const v = (cents || 0) / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
};
const parseMoney = (s) => {
  const n = parseFloat(String(s).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : Math.round(n * 100);
};

// shared column template for the register header / rows / editor
const TXN_GRID = "84px 1.1fr 120px 1fr 120px 104px 56px";

/* ------------------------------------------------------------------ */
/* seed data                                                          */
/* ------------------------------------------------------------------ */
function seed() {
  const d = (day) => `${curYM}-${String(day).padStart(2, "0")}`;
  const accounts = [
    { id: "a_check", name: "Everyday Checking", type: "checking", onBudget: true },
    { id: "a_save", name: "Savings", type: "savings", onBudget: true },
    { id: "a_cc", name: "Visa Credit Card", type: "credit", onBudget: true },
  ];
  const groups = [
    { id: "g1", name: "Immediate Obligations" },
    { id: "g2", name: "True Expenses" },
    { id: "g3", name: "Quality of Life" },
  ];
  const categories = [
    { id: "c_rent", groupId: "g1", name: "Rent", goal: { type: "monthly", amount: 120000 } },
    { id: "c_elec", groupId: "g1", name: "Electric", goal: { type: "monthly", amount: 8000 } },
    { id: "c_net", groupId: "g1", name: "Internet", goal: { type: "monthly", amount: 6000 } },
    { id: "c_groc", groupId: "g1", name: "Groceries", goal: { type: "monthly", amount: 45000 } },
    { id: "c_trans", groupId: "g1", name: "Transportation", goal: { type: "monthly", amount: 15000 } },
    { id: "c_auto", groupId: "g2", name: "Auto Maintenance", goal: { type: "target", amount: 60000 } },
    { id: "c_med", groupId: "g2", name: "Medical", goal: { type: "monthly", amount: 5000 } },
    { id: "c_ins", groupId: "g2", name: "Renter's Insurance", goal: null },
    { id: "c_dine", groupId: "g3", name: "Dining Out", goal: { type: "monthly", amount: 20000 } },
    { id: "c_fun", groupId: "g3", name: "Fun Money", goal: { type: "monthly", amount: 10000 } },
    { id: "c_vac", groupId: "g3", name: "Vacation", goal: { type: "target", amount: 200000 } },
  ];
  const transactions = [
    { id: uid("t"), accountId: "a_check", date: d(1), payee: "Starting Balance", categoryId: "income", amount: 320000, cleared: true, memo: "" },
    { id: uid("t"), accountId: "a_save", date: d(1), payee: "Starting Balance", categoryId: "income", amount: 500000, cleared: true, memo: "" },
    { id: uid("t"), accountId: "a_cc", date: d(1), payee: "Starting Balance", categoryId: null, amount: -45000, cleared: true, memo: "" },
    { id: uid("t"), accountId: "a_check", date: d(2), payee: "Employer Payroll", categoryId: "income", amount: 230000, cleared: true, memo: "Paycheck" },
    { id: uid("t"), accountId: "a_check", date: d(3), payee: "Skyline Property Mgmt", categoryId: "c_rent", amount: -120000, cleared: true, memo: "" },
    { id: uid("t"), accountId: "a_check", date: d(5), payee: "Trader Joe's", categoryId: "c_groc", amount: -8500, cleared: true, memo: "" },
    { id: uid("t"), accountId: "a_check", date: d(9), payee: "Safeway", categoryId: "c_groc", amount: -6200, cleared: false, memo: "" },
    { id: uid("t"), accountId: "a_check", date: d(6), payee: "City Power & Light", categoryId: "c_elec", amount: -7300, cleared: true, memo: "" },
    { id: uid("t"), accountId: "a_cc", date: d(7), payee: "Bangkok Kitchen", categoryId: "c_dine", amount: -4200, cleared: false, memo: "Dinner" },
    { id: uid("t"), accountId: "a_check", date: d(8), payee: "Shell", categoryId: "c_trans", amount: -5500, cleared: true, memo: "" },
  ];
  const budgeted = {
    [curYM]: {
      c_rent: 120000, c_elec: 8000, c_net: 6000, c_groc: 45000,
      c_trans: 15000, c_dine: 20000, c_fun: 10000,
    },
  };
  return { accounts, groups, categories, transactions, budgeted };
}

/* ------------------------------------------------------------------ */
/* persistence                                                        */
/* ------------------------------------------------------------------ */
const STORE_KEY = "ynab_clone_state_v1";
async function loadState() {
  try {
    if (typeof window !== "undefined" && window.storage) {
      const res = await window.storage.get(STORE_KEY);
      if (res && res.value) return JSON.parse(res.value);
    }
  } catch (e) { /* key missing or storage unavailable */ }
  return null;
}
async function saveState(state) {
  try {
    if (typeof window !== "undefined" && window.storage) {
      await window.storage.set(STORE_KEY, JSON.stringify(state));
    }
  } catch (e) { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* style tokens                                                       */
/* ------------------------------------------------------------------ */
const CSS = `
:root{
  --ink:#161A21; --ink2:#616B78; --ink3:#95A0AD;
  --paper:#F4F5F3; --surface:#FFFFFF; --line:#E5E8E4;
  --pos:#1C9C64; --posSoft:#E3F2EA; --posInk:#0E6B42;
  --neg:#CB4E33; --negSoft:#FAE7E1; --negInk:#8F3521;
  --accent:#4A45C4; --accentSoft:#ECEBFA;
  --warn:#B9821B; --warnSoft:#FBF0D8;
}
*{box-sizing:border-box}
.ynab-root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  color:var(--ink);background:var(--paper);min-height:100vh;display:flex;
  font-feature-settings:"cv05","ss01";-webkit-font-smoothing:antialiased}
.num{font-variant-numeric:tabular-nums;letter-spacing:-0.01em}
.eyebrow{font-size:11px;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;color:var(--ink3)}
button{font-family:inherit;cursor:pointer;border:none;background:none}
input,select{font-family:inherit;font-size:14px;color:var(--ink)}
.btn{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;
  padding:8px 13px;border-radius:9px;transition:.13s;white-space:nowrap}
.btn-primary{background:var(--accent);color:#fff}
.btn-primary:hover{filter:brightness(1.08)}
.btn-ghost{background:var(--surface);color:var(--ink);border:1px solid var(--line)}
.btn-ghost:hover{border-color:var(--ink3)}
.assign-in{width:104px;text-align:right;padding:7px 10px;border-radius:8px;border:1px solid var(--line);
  background:var(--surface);font-variant-numeric:tabular-nums;transition:.12s}
.assign-in:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accentSoft)}
.row-hover:hover{background:var(--paper)}
.cat-name:hover{color:var(--accent)!important;text-decoration:underline;text-underline-offset:3px}
.navlink{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:9px;
  font-size:14px;font-weight:600;color:var(--ink2);transition:.12s;width:100%;text-align:left}
.navlink:hover{background:#EDEFEC;color:var(--ink)}
.navlink.active{background:var(--accentSoft);color:var(--accent)}
.pill{display:inline-flex;align-items:center;justify-content:flex-end;min-width:82px;padding:4px 10px;
  border-radius:999px;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}
.modal-bg{position:fixed;inset:0;background:rgba(20,24,31,.34);display:flex;align-items:center;
  justify-content:center;z-index:50;padding:18px;backdrop-filter:blur(2px)}
.modal{background:var(--surface);border-radius:16px;width:100%;max-width:430px;
  box-shadow:0 24px 60px rgba(20,24,31,.22);overflow:hidden}
.field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
.field label{font-size:12px;font-weight:600;color:var(--ink2)}
.field input,.field select{padding:10px 12px;border-radius:9px;border:1px solid var(--line);background:#fff}
.field input:focus,.field select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accentSoft)}
.seg{display:flex;gap:4px;background:var(--paper);padding:4px;border-radius:10px}
.seg button{flex:1;padding:8px;border-radius:7px;font-size:13px;font-weight:600;color:var(--ink2)}
.seg button.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.08)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px}
.mono-tick{font-variant-numeric:tabular-nums;font-size:12px;fill:var(--ink3)}
@media (max-width:820px){
  .ynab-root{flex-direction:column}
  .sidebar{width:100%!important;height:auto!important;border-right:none!important;
    border-bottom:1px solid var(--line)}
  .acct-list{display:none}
}
`;

/* ------------------------------------------------------------------ */
/* main                                                               */
/* ------------------------------------------------------------------ */
export default function App() {
  const [state, setState] = useState(null);
  const [view, setView] = useState("budget");
  const [month, setMonth] = useState(curYM);
  const [modal, setModal] = useState(null); // {type, ...}
  const [acctFilter, setAcctFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const firstLoad = useRef(true);

  useEffect(() => {
    let live = true;
    (async () => {
      const s = await loadState();
      if (!live) return;
      setState(s || seed());
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!state) return;
    if (firstLoad.current) { firstLoad.current = false; return; }
    const t = setTimeout(() => saveState(state), 350);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(link);
  }, []);

  /* ------- derived ------- */
  const derived = useMemo(() => {
    if (!state) return null;
    const { transactions, budgeted, categories, accounts } = state;

    const acctBalance = {};
    accounts.forEach((a) => (acctBalance[a.id] = 0));
    transactions.forEach((t) => { acctBalance[t.accountId] = (acctBalance[t.accountId] || 0) + t.amount; });

    // assigned up to & including a month
    const assignedUpTo = (catId, ym) => {
      let s = 0;
      Object.keys(budgeted).forEach((k) => { if (k <= ym) s += budgeted[k][catId] || 0; });
      return s;
    };
    const assignedIn = (catId, ym) => (budgeted[ym] && budgeted[ym][catId]) || 0;
    const activityUpTo = (catId, ym) => transactions
      .filter((t) => t.categoryId === catId && monthKeyOf(t.date) <= ym)
      .reduce((s, t) => s + t.amount, 0);
    const activityIn = (catId, ym) => transactions
      .filter((t) => t.categoryId === catId && monthKeyOf(t.date) === ym)
      .reduce((s, t) => s + t.amount, 0);
    const available = (catId, ym) => assignedUpTo(catId, ym) + activityUpTo(catId, ym);

    const totalIncome = transactions
      .filter((t) => t.categoryId === "income")
      .reduce((s, t) => s + t.amount, 0);
    const totalAssigned = Object.values(budgeted)
      .reduce((s, m) => s + Object.values(m).reduce((a, b) => a + b, 0), 0);
    const readyToAssign = totalIncome - totalAssigned;

    const assignedThisMonth = categories.reduce((s, c) => s + assignedIn(c.id, month), 0);
    const netWorth = Object.values(acctBalance).reduce((a, b) => a + b, 0);

    return { acctBalance, assignedIn, activityIn, available, readyToAssign, assignedThisMonth, netWorth, totalIncome };
  }, [state, month]);

  if (!state || !derived) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#F4F5F3", fontFamily: "system-ui" }}>
        <style>{CSS}</style>
        <div className="eyebrow">Loading your budget…</div>
      </div>
    );
  }

  /* ------- mutations ------- */
  const patch = (fn) => setState((prev) => { const next = structuredClone(prev); fn(next); return next; });

  const setAssigned = (catId, cents) =>
    patch((s) => {
      if (!s.budgeted[month]) s.budgeted[month] = {};
      if (cents === 0) delete s.budgeted[month][catId];
      else s.budgeted[month][catId] = cents;
    });

  const autoAssignGoals = () =>
    patch((s) => {
      if (!s.budgeted[month]) s.budgeted[month] = {};
      // recompute RTA locally as we assign
      const income = s.transactions.filter((t) => t.categoryId === "income").reduce((a, t) => a + t.amount, 0);
      let assignedAll = Object.values(s.budgeted).reduce((a, m) => a + Object.values(m).reduce((x, y) => x + y, 0), 0);
      let rta = income - assignedAll;
      s.categories.forEach((c) => {
        if (!c.goal || rta <= 0) return;
        const curAssigned = s.budgeted[month][c.id] || 0;
        let need = 0;
        if (c.goal.type === "monthly") need = c.goal.amount - curAssigned;
        else { // target: fund toward target available
          const avail = derived.available(c.id, month);
          need = c.goal.amount - avail;
        }
        if (need <= 0) return;
        const give = Math.min(need, rta);
        s.budgeted[month][c.id] = curAssigned + give;
        rta -= give;
      });
    });

  const closeModal = () => setModal(null);

  const openAccount = (id) => { setAcctFilter(id); setCatFilter("all"); setView("accounts"); };
  const openCategory = (id) => { setCatFilter(id); setAcctFilter("all"); setView("accounts"); };

  const sidebarProps = { state, view, setView, derived, setModal, month, acctFilter, catFilter, openAccount };

  return (
    <div className="ynab-root">
      <style>{CSS}</style>
      <Sidebar {...sidebarProps} />
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {view === "budget" && (
          <BudgetView
            state={state} month={month} setMonth={setMonth} derived={derived}
            setAssigned={setAssigned} autoAssignGoals={autoAssignGoals} setModal={setModal}
            patch={patch} openCategory={openCategory}
          />
        )}
        {view === "accounts" && (
          <AccountsView
            state={state} derived={derived} setModal={setModal}
            acctFilter={acctFilter} setAcctFilter={setAcctFilter}
            catFilter={catFilter} setCatFilter={setCatFilter} patch={patch}
          />
        )}
        {view === "reports" && <ReportsView state={state} derived={derived} month={month} />}
      </main>

      {modal && (
        <ModalHost
          modal={modal} close={closeModal} state={state} patch={patch} month={month}
          setState={setState}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* sidebar                                                            */
/* ------------------------------------------------------------------ */
function Sidebar({ state, view, setView, derived, setModal, acctFilter, catFilter, openAccount }) {
  const { accounts } = state;
  const icon = (t) => t === "savings" ? PiggyBank : t === "credit" ? CreditCard : Wallet;
  return (
    <aside className="sidebar" style={{ width: 268, background: "var(--surface)", borderRight: "1px solid var(--line)", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 22, position: "sticky", top: 0, height: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px" }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: "var(--accent)", display: "grid", placeItems: "center" }}>
          <CircleDot size={17} color="#fff" strokeWidth={2.4} />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.02em" }}>Assign</div>
          <div style={{ fontSize: 10, color: "var(--ink3)", fontWeight: 600, letterSpacing: ".04em", marginTop: -1 }}>ZERO-BASED BUDGET</div>
        </div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <button className={`navlink ${view === "budget" ? "active" : ""}`} onClick={() => setView("budget")}><LayoutGrid size={17} /> Budget</button>
        <button className={`navlink ${view === "accounts" ? "active" : ""}`} onClick={() => setView("accounts")}><ArrowLeftRight size={17} /> Transactions</button>
        <button className={`navlink ${view === "reports" ? "active" : ""}`} onClick={() => setView("reports")}><PieChart size={17} /> Reports</button>
      </nav>

      <div className="acct-list" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        <button
          onClick={() => openAccount("all")}
          className="navlink"
          style={{ justifyContent: "space-between", padding: "6px 6px", marginBottom: 2, background: view === "accounts" && acctFilter === "all" && catFilter === "all" ? "var(--accentSoft)" : "transparent" }}
        >
          <span className="eyebrow">All accounts</span>
          <span className="num" style={{ fontSize: 12, fontWeight: 700, color: derived.netWorth >= 0 ? "var(--ink)" : "var(--neg)" }}>{fmt(derived.netWorth)}</span>
        </button>
        {accounts.map((a) => {
          const I = icon(a.type);
          const bal = derived.acctBalance[a.id];
          const active = view === "accounts" && acctFilter === a.id && catFilter === "all";
          return (
            <button
              key={a.id}
              onClick={() => openAccount(a.id)}
              className="navlink"
              style={{ gap: 9, padding: "8px 8px", fontWeight: 600, background: active ? "var(--accentSoft)" : "transparent", color: active ? "var(--accent)" : "var(--ink)" }}
            >
              <I size={16} color={active ? "var(--accent)" : "var(--ink3)"} />
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
              <span className="num" style={{ fontSize: 12.5, fontWeight: 600, color: bal < 0 ? "var(--neg)" : active ? "var(--accent)" : "var(--ink2)" }}>{fmt(bal)}</span>
            </button>
          );
        })}
        <button className="navlink" style={{ color: "var(--accent)", fontSize: 13, marginTop: 2 }} onClick={() => setModal({ type: "account" })}><Plus size={16} /> Add account</button>
      </div>

      <button className="btn btn-ghost" style={{ justifyContent: "center" }} onClick={() => setModal({ type: "reset" })}>
        <RotateCcw size={14} /> Reset demo data
      </button>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* budget view                                                        */
/* ------------------------------------------------------------------ */
function BudgetView({ state, month, setMonth, derived, setAssigned, autoAssignGoals, setModal, patch, openCategory }) {
  const { groups, categories } = state;
  const rta = derived.readyToAssign;
  const rtaState = rta > 0 ? "pos" : rta < 0 ? "neg" : "zero";

  const banner = {
    pos: { label: "Ready to Assign", sub: "Give every dollar a job" },
    neg: { label: "Over-Assigned", sub: "You've assigned more than you have" },
    zero: { label: "All Money Assigned", sub: "Every dollar has a job" },
  }[rtaState];
  const bannerColor = rtaState === "pos" ? "var(--pos)" : rtaState === "neg" ? "var(--neg)" : "var(--accent)";

  return (
    <>
      {/* header */}
      <div style={{ padding: "18px 26px 0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="btn btn-ghost" style={{ padding: 8 }} onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft size={16} /></button>
          <div style={{ fontWeight: 700, fontSize: 17, minWidth: 168, textAlign: "center", letterSpacing: "-0.01em" }}>{monthLabel(month)}</div>
          <button className="btn btn-ghost" style={{ padding: 8 }} onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={16} /></button>
          {month !== curYM && <button className="btn btn-ghost" onClick={() => setMonth(curYM)}>Today</button>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={autoAssignGoals}><Sparkles size={15} /> Auto-assign goals</button>
          <button className="btn btn-ghost" onClick={() => setModal({ type: "group" })}><Plus size={15} /> Group</button>
        </div>
      </div>

      {/* RTA banner */}
      <div style={{ padding: "16px 26px 0" }}>
        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderColor: bannerColor, background: rtaState === "pos" ? "var(--posSoft)" : rtaState === "neg" ? "var(--negSoft)" : "var(--accentSoft)" }}>
          <div>
            <div className="eyebrow" style={{ color: bannerColor }}>{banner.label}</div>
            <div style={{ fontSize: 13, color: "var(--ink2)", marginTop: 2 }}>{banner.sub}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {rtaState === "zero" && <div style={{ width: 34, height: 34, borderRadius: 999, background: "var(--accent)", display: "grid", placeItems: "center" }}><Check size={20} color="#fff" strokeWidth={3} /></div>}
            <div className="num" style={{ fontSize: 40, fontWeight: 800, color: bannerColor, letterSpacing: "-0.03em", lineHeight: 1 }}>{fmt(rta)}</div>
          </div>
        </div>
      </div>

      {/* column header */}
      <div style={{ padding: "18px 26px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 132px 120px 120px", gap: 8, padding: "0 14px 8px" }}>
          <span className="eyebrow">Category</span>
          <span className="eyebrow" style={{ textAlign: "right" }}>Assigned</span>
          <span className="eyebrow" style={{ textAlign: "right" }}>Activity</span>
          <span className="eyebrow" style={{ textAlign: "right" }}>Available</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 40 }}>
          {groups.map((g) => {
            const cats = categories.filter((c) => c.groupId === g.id);
            const grpAssigned = cats.reduce((s, c) => s + derived.assignedIn(c.id, month), 0);
            const grpActivity = cats.reduce((s, c) => s + derived.activityIn(c.id, month), 0);
            const grpAvail = cats.reduce((s, c) => s + derived.available(c.id, month), 0);
            return (
              <div key={g.id} className="card" style={{ overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 132px 120px 120px", gap: 8, padding: "12px 14px", background: "var(--paper)", alignItems: "center", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{g.name}</span>
                    <button onClick={() => setModal({ type: "category", groupId: g.id })} title="Add category" style={{ color: "var(--ink3)", display: "grid", placeItems: "center" }}><Plus size={15} /></button>
                  </div>
                  <span className="num" style={{ textAlign: "right", fontWeight: 600, fontSize: 13, color: "var(--ink2)" }}>{fmt(grpAssigned)}</span>
                  <span className="num" style={{ textAlign: "right", fontWeight: 600, fontSize: 13, color: "var(--ink2)" }}>{fmt(grpActivity)}</span>
                  <span className="num" style={{ textAlign: "right", fontWeight: 700, fontSize: 13, color: grpAvail < 0 ? "var(--neg)" : "var(--ink)" }}>{fmt(grpAvail)}</span>
                </div>
                {cats.map((c) => (
                  <CatRow key={c.id} c={c} month={month} derived={derived} setAssigned={setAssigned} setModal={setModal} openCategory={openCategory} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function CatRow({ c, month, derived, setAssigned, setModal, openCategory }) {
  const assigned = derived.assignedIn(c.id, month);
  const activity = derived.activityIn(c.id, month);
  const avail = derived.available(c.id, month);
  const [draft, setDraft] = useState((assigned / 100).toFixed(2));
  useEffect(() => { setDraft(assigned ? (assigned / 100).toFixed(2) : ""); }, [assigned, month]);

  // goal progress
  let goalInfo = null;
  if (c.goal) {
    if (c.goal.type === "monthly") {
      const pct = Math.min(100, Math.round((assigned / c.goal.amount) * 100));
      goalInfo = { pct, met: assigned >= c.goal.amount, label: `${fmt(assigned)} of ${fmt(c.goal.amount)}/mo` };
    } else {
      const pct = Math.min(100, Math.round((avail / c.goal.amount) * 100));
      goalInfo = { pct, met: avail >= c.goal.amount, label: `${fmt(avail)} of ${fmt(c.goal.amount)} target` };
    }
  }

  const availColor = avail < 0
    ? { color: "var(--negInk)", background: "var(--negSoft)" }
    : avail === 0
      ? { color: "var(--ink3)", background: "var(--paper)" }
      : { color: "var(--posInk)", background: "var(--posSoft)" };

  const commit = () => setAssigned(c.id, parseMoney(draft));

  return (
    <div className="row-hover" style={{ display: "grid", gridTemplateColumns: "1fr 132px 120px 120px", gap: 8, padding: "10px 14px", alignItems: "center", borderBottom: "1px solid var(--line)" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => openCategory(c.id)}
            title="View transactions"
            className="cat-name"
            style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", padding: 0, textAlign: "left" }}
          >{c.name}</button>
          <button onClick={() => setModal({ type: "goal", cat: c })} title="Set goal" style={{ display: "grid", placeItems: "center", color: c.goal ? "var(--accent)" : "var(--ink3)", opacity: c.goal ? 1 : 0.55 }}><Target size={13} /></button>
        </div>
        {goalInfo && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
            <div style={{ flex: 1, maxWidth: 150, height: 4, borderRadius: 999, background: "var(--line)", overflow: "hidden" }}>
              <div style={{ width: goalInfo.pct + "%", height: "100%", background: goalInfo.met ? "var(--pos)" : "var(--warn)" }} />
            </div>
            <span style={{ fontSize: 10.5, color: goalInfo.met ? "var(--posInk)" : "var(--warn)", fontWeight: 600, whiteSpace: "nowrap" }}>{goalInfo.label}</span>
          </div>
        )}
      </div>
      <div style={{ textAlign: "right" }}>
        <input
          className="assign-in num"
          value={draft}
          placeholder="0.00"
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
        />
      </div>
      <span className="num" style={{ textAlign: "right", fontSize: 13.5, color: activity ? "var(--ink)" : "var(--ink3)" }}>{fmt(activity)}</span>
      <div style={{ textAlign: "right" }}>
        <span className="pill num" style={availColor}>{fmt(avail)}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* transactions view                                                  */
/* ------------------------------------------------------------------ */
function AccountsView({ state, derived, setModal, acctFilter, setAcctFilter, catFilter, setCatFilter, patch }) {
  const { transactions, accounts, categories } = state;
  const catName = (id) => id === "income" ? "Ready to Assign" : id === null ? "—" : (categories.find((c) => c.id === id)?.name || "—");
  const acctName = (id) => accounts.find((a) => a.id === id)?.name || "?";

  const matchesCat = (t) =>
    catFilter === "all" ? true :
    catFilter === "none" ? t.categoryId === null :
    t.categoryId === catFilter;

  const rows = transactions
    .filter((t) => acctFilter === "all" || t.accountId === acctFilter)
    .filter(matchesCat)
    .slice().sort((a, b) => (a.date < b.date ? 1 : -1));

  const toggleCleared = (id) => patch((s) => { const t = s.transactions.find((x) => x.id === id); if (t) t.cleared = !t.cleared; });
  const del = (id) => patch((s) => {
    const t = s.transactions.find((x) => x.id === id);
    if (t && t.transferId) s.transactions = s.transactions.filter((x) => x.transferId !== t.transferId);
    else s.transactions = s.transactions.filter((x) => x.id !== id);
  });

  const isTransferTxn = (t) => t.categoryId === null && /^Transfer (to|from)\b/.test(t.payee || "");
  const txnToDraft = (t) => ({
    date: t.date,
    payee: t.payee,
    categoryId: t.categoryId === "income" ? "income" : (t.categoryId || ""),
    accountId: t.accountId,
    amount: (Math.abs(t.amount) / 100).toFixed(2),
    memo: t.memo || "",
  });

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const addTxn = (draft) => {
    const cents = parseMoney(draft.amount);
    if (!cents || !draft.accountId) return false;
    const memo = (draft.memo || "").trim();
    const isTransfer = draft.categoryId.startsWith("transfer:");
    if (isTransfer) {
      const toId = draft.categoryId.slice(9);
      if (!toId || toId === draft.accountId) return false;
      const tid = uid("xfer");
      patch((s) => {
        const toN = s.accounts.find((a) => a.id === toId)?.name;
        const fromN = s.accounts.find((a) => a.id === draft.accountId)?.name;
        s.transactions.push({ id: uid("t"), transferId: tid, accountId: draft.accountId, date: draft.date, payee: `Transfer to ${toN}`, categoryId: null, amount: -cents, cleared: false, memo });
        s.transactions.push({ id: uid("t"), transferId: tid, accountId: toId, date: draft.date, payee: `Transfer from ${fromN}`, categoryId: null, amount: cents, cleared: false, memo });
      });
    } else if (draft.categoryId === "income") {
      patch((s) => s.transactions.push({ id: uid("t"), accountId: draft.accountId, date: draft.date, payee: draft.payee.trim() || "Income", categoryId: "income", amount: cents, cleared: false, memo }));
    } else {
      patch((s) => s.transactions.push({ id: uid("t"), accountId: draft.accountId, date: draft.date, payee: draft.payee.trim() || "Payee", categoryId: draft.categoryId || null, amount: -cents, cleared: false, memo }));
    }
    return true;
  };

  const updateTxn = (id, draft) => {
    const cents = parseMoney(draft.amount);
    if (!cents || !draft.accountId) return false;
    patch((s) => {
      const t = s.transactions.find((x) => x.id === id);
      if (!t) return;
      t.date = draft.date;
      t.accountId = draft.accountId;
      t.memo = (draft.memo || "").trim();
      if (draft.categoryId === "income") { t.categoryId = "income"; t.amount = cents; t.payee = draft.payee.trim() || "Income"; }
      else { t.categoryId = draft.categoryId || null; t.amount = -cents; t.payee = draft.payee.trim() || "Payee"; }
    });
    return true;
  };

  const cleared = rows.filter((t) => t.cleared).reduce((s, t) => s + t.amount, 0);
  const uncleared = rows.filter((t) => !t.cleared).reduce((s, t) => s + t.amount, 0);

  return (
    <div style={{ padding: "18px 26px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <select value={acctFilter} onChange={(e) => setAcctFilter(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: `1px solid ${acctFilter !== "all" ? "var(--accent)" : "var(--line)"}`, background: "#fff", fontWeight: 600 }}>
            <option value="all">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: `1px solid ${catFilter !== "all" ? "var(--accent)" : "var(--line)"}`, background: "#fff", fontWeight: 600 }}>
            <option value="all">All categories</option>
            <option value="income">Ready to Assign</option>
            <option value="none">Uncategorized</option>
            <optgroup label="Category">
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          </select>
          {(acctFilter !== "all" || catFilter !== "all") && (
            <button className="btn btn-ghost" style={{ padding: "8px 11px" }} onClick={() => { setAcctFilter("all"); setCatFilter("all"); }}><X size={14} /> Clear</button>
          )}
          <div style={{ display: "flex", gap: 16, fontSize: 12.5 }}>
            <span style={{ color: "var(--ink2)" }}>Balance <b className="num" style={{ color: (cleared + uncleared) < 0 ? "var(--neg)" : "var(--ink)" }}>{fmt(cleared + uncleared)}</b></span>
            <span style={{ color: "var(--ink2)" }}>Cleared <b className="num" style={{ color: "var(--ink)" }}>{fmt(cleared)}</b></span>
            <span style={{ color: "var(--ink2)" }}>Uncleared <b className="num" style={{ color: "var(--ink)" }}>{fmt(uncleared)}</b></span>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { setAdding(true); setEditingId(null); }} disabled={adding} style={{ opacity: adding ? 0.5 : 1 }}><Plus size={15} /> Add transaction</button>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: TXN_GRID, gap: 8, padding: "10px 16px", borderBottom: "1px solid var(--line)", background: "var(--paper)" }}>
          {["Date", "Payee", "Category", "Memo", "Account", "Amount", ""].map((h, i) => (
            <span key={i} className="eyebrow" style={{ textAlign: i === 5 ? "right" : "left" }}>{h}</span>
          ))}
        </div>
        {adding && (
          <TxnEditorRow
            accounts={accounts}
            categories={categories}
            allowTransfer
            initial={{ date: new Date().toISOString().slice(0, 10), payee: "", categoryId: "", accountId: acctFilter !== "all" ? acctFilter : accounts[0]?.id, amount: "", memo: "" }}
            onSubmit={addTxn}
            onClose={() => setAdding(false)}
          />
        )}
        {rows.length === 0 && !adding && (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--ink3)", fontSize: 14 }}>
            {(acctFilter !== "all" || catFilter !== "all") ? "No transactions match this filter." : "No transactions yet. Add one to get started."}
          </div>
        )}
        {rows.map((t) => {
          if (t.id === editingId) {
            return (
              <TxnEditorRow
                key={t.id}
                accounts={accounts}
                categories={categories}
                allowTransfer={false}
                initial={txnToDraft(t)}
                onSubmit={(draft) => updateTxn(t.id, draft)}
                onClose={() => setEditingId(null)}
              />
            );
          }
          const transfer = isTransferTxn(t);
          return (
            <div
              key={t.id}
              className="row-hover"
              onClick={() => { if (!transfer) { setEditingId(t.id); setAdding(false); } }}
              title={transfer ? "Transfers can't be edited inline — delete to remove both legs" : "Click to edit"}
              style={{ display: "grid", gridTemplateColumns: TXN_GRID, gap: 8, padding: "11px 16px", alignItems: "center", borderBottom: "1px solid var(--line)", fontSize: 13.5, cursor: transfer ? "default" : "pointer" }}
            >
              <span className="num" style={{ color: "var(--ink2)" }}>{t.date.slice(5)}</span>
              <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.payee}</span>
              <span style={{ color: "var(--ink2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{catName(t.categoryId)}</span>
              <span style={{ color: "var(--ink3)", fontSize: 12.5, fontStyle: t.memo ? "italic" : "normal", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.memo || "—"}</span>
              <span style={{ color: "var(--ink2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{acctName(t.accountId)}</span>
              <span className="num" style={{ textAlign: "right", fontWeight: 600, color: t.amount < 0 ? "var(--ink)" : "var(--posInk)" }}>{fmt(t.amount)}</span>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button title={t.cleared ? "Cleared" : "Uncleared"} onClick={(e) => { e.stopPropagation(); toggleCleared(t.id); }} style={{ width: 22, height: 22, borderRadius: 999, display: "grid", placeItems: "center", background: t.cleared ? "var(--pos)" : "var(--line)", color: "#fff" }}><Check size={13} strokeWidth={3} /></button>
                <button title="Delete" onClick={(e) => { e.stopPropagation(); del(t.id); }} style={{ color: "var(--ink3)", display: "grid", placeItems: "center" }}><Trash2 size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TxnEditorRow({ accounts, categories, initial, allowTransfer = true, onSubmit, onClose }) {
  const [date, setDate] = useState(initial.date);
  const [payee, setPayee] = useState(initial.payee);
  const [categoryId, setCategoryId] = useState(initial.categoryId); // "" | "income" | "transfer:<id>" | catId
  const [accountId, setAccountId] = useState(initial.accountId || accounts[0]?.id || "");
  const [amount, setAmount] = useState(initial.amount);
  const [memo, setMemo] = useState(initial.memo || "");
  const [err, setErr] = useState(false);

  const isIncome = categoryId === "income";
  const isTransfer = categoryId.startsWith("transfer:");

  const submit = () => {
    const ok = onSubmit({ date, payee, categoryId, accountId, amount, memo });
    if (ok) onClose();
    else { setErr(true); setTimeout(() => setErr(false), 1200); }
  };
  const key = (e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onClose(); };

  const inp = {
    width: "100%", padding: "7px 9px", borderRadius: 8,
    border: `1px solid ${err ? "var(--neg)" : "var(--line)"}`, background: "#fff", fontSize: 13,
  };

  return (
    <div onKeyDown={key} style={{ display: "grid", gridTemplateColumns: TXN_GRID, gap: 8, padding: "10px 16px", alignItems: "center", borderBottom: "1px solid var(--line)", background: "var(--accentSoft)", boxShadow: "inset 3px 0 0 var(--accent)" }}>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="num" style={{ ...inp, padding: "7px 5px", fontSize: 12 }} />
      <input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder={isTransfer ? "—" : isIncome ? "Payer" : "Payee"} disabled={isTransfer} autoFocus style={{ ...inp, opacity: isTransfer ? 0.5 : 1 }} />
      <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={inp}>
        <option value="income">Inflow: Ready to Assign</option>
        <option value="">Uncategorized</option>
        <optgroup label="Category">
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
        {allowTransfer && (
          <optgroup label="Transfer to">
            {accounts.map((a) => <option key={a.id} value={"transfer:" + a.id}>{a.name}</option>)}
          </optgroup>
        )}
      </select>
      <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Memo" style={inp} />
      <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={inp}>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="num" style={{ ...inp, textAlign: "right", color: isIncome ? "var(--posInk)" : "var(--ink)" }} />
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={submit} title="Save (Enter)" style={{ width: 24, height: 24, borderRadius: 7, display: "grid", placeItems: "center", background: "var(--accent)", color: "#fff" }}><Check size={14} strokeWidth={3} /></button>
        <button onClick={onClose} title="Cancel (Esc)" style={{ width: 24, height: 24, borderRadius: 7, display: "grid", placeItems: "center", background: "var(--line)", color: "var(--ink2)" }}><X size={14} /></button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* reports view                                                       */
/* ------------------------------------------------------------------ */
function ReportsView({ state, derived, month }) {
  const { transactions, categories } = state;

  const spendByCat = useMemo(() => {
    const map = {};
    transactions.filter((t) => monthKeyOf(t.date) === month && t.amount < 0 && t.categoryId && t.categoryId !== "income")
      .forEach((t) => { map[t.categoryId] = (map[t.categoryId] || 0) + Math.abs(t.amount); });
    return Object.entries(map).map(([id, v]) => ({ name: categories.find((c) => c.id === id)?.name || "?", value: v / 100 }))
      .sort((a, b) => b.value - a.value);
  }, [transactions, categories, month]);

  const months = useMemo(() => {
    const arr = [];
    for (let i = 5; i >= 0; i--) arr.push(addMonths(month, -i));
    return arr;
  }, [month]);

  const incomeExpense = useMemo(() => months.map((ym) => {
    let inc = 0, exp = 0;
    transactions.filter((t) => monthKeyOf(t.date) === ym).forEach((t) => {
      if (t.categoryId === "income" || (t.amount > 0 && t.categoryId !== null)) inc += t.amount;
      else if (t.amount < 0 && t.categoryId !== null && t.categoryId !== "income") exp += Math.abs(t.amount);
    });
    return { name: monthShort(ym), Income: inc / 100, Spending: exp / 100 };
  }), [transactions, months]);

  const netWorthTrend = useMemo(() => {
    return months.map((ym) => {
      const end = ym + "-31";
      const nw = transactions.filter((t) => t.date <= end).reduce((s, t) => s + t.amount, 0);
      return { name: monthShort(ym), value: nw / 100 };
    });
  }, [transactions, months]);

  const barColors = ["#4A45C4", "#1C9C64", "#B9821B", "#CB4E33", "#3E8E8A", "#7A57C9", "#C25E9B"];
  const money = (v) => "$" + Math.round(v).toLocaleString();

  return (
    <div style={{ padding: "18px 26px 40px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div className="eyebrow">Reports</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", margin: "2px 0 0" }}>{monthLabel(month)} & trends</h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Spending by category</div>
          {spendByCat.length === 0 ? <Empty msg="No spending this month." /> : (
            <ResponsiveContainer width="100%" height={Math.max(180, spendByCat.length * 42)}>
              <BarChart data={spendByCat} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid horizontal={false} stroke="var(--line)" />
                <XAxis type="number" tickFormatter={money} tick={{ fontSize: 11, fill: "var(--ink3)" }} />
                <YAxis type="category" dataKey="name" width={104} tick={{ fontSize: 12, fill: "var(--ink2)" }} />
                <Tooltip formatter={(v) => money(v)} cursor={{ fill: "var(--paper)" }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
                  {spendByCat.map((_, i) => <Cell key={i} fill={barColors[i % barColors.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Income vs. spending</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={incomeExpense} margin={{ left: 4, right: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--ink2)" }} />
              <YAxis tickFormatter={money} tick={{ fontSize: 11, fill: "var(--ink3)" }} width={52} />
              <Tooltip formatter={(v) => money(v)} cursor={{ fill: "var(--paper)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Income" fill="var(--pos)" radius={[5, 5, 0, 0]} barSize={16} />
              <Bar dataKey="Spending" fill="var(--neg)" radius={[5, 5, 0, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ padding: "18px 20px", gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <TrendingUp size={16} color="var(--accent)" />
            <div style={{ fontWeight: 700, fontSize: 14 }}>Net worth trend</div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={netWorthTrend} margin={{ left: 4, right: 12 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--ink2)" }} />
              <YAxis tickFormatter={money} tick={{ fontSize: 11, fill: "var(--ink3)" }} width={60} />
              <Tooltip formatter={(v) => money(v)} />
              <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--accent)" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
function Empty({ msg }) {
  return <div style={{ padding: "36px 0", textAlign: "center", color: "var(--ink3)", fontSize: 13 }}>{msg}</div>;
}

/* ------------------------------------------------------------------ */
/* modals                                                             */
/* ------------------------------------------------------------------ */
function ModalHost({ modal, close, state, patch, month, setState }) {
  return (
    <div className="modal-bg" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {modal.type === "account" && <AccountModal close={close} patch={patch} month={month} />}
        {modal.type === "group" && <GroupModal close={close} patch={patch} />}
        {modal.type === "category" && <CategoryModal close={close} patch={patch} groupId={modal.groupId} />}
        {modal.type === "goal" && <GoalModal close={close} patch={patch} cat={modal.cat} />}
        {modal.type === "reset" && <ResetModal close={close} setState={setState} />}
      </div>
    </div>
  );
}

function ModalShell({ title, children, onSave, close, saveLabel = "Save" }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
        <h3 style={{ fontWeight: 700, fontSize: 16 }}>{title}</h3>
        <button onClick={close} style={{ color: "var(--ink3)" }}><X size={19} /></button>
      </div>
      <div style={{ padding: "18px 20px" }}>{children}</div>
      <div style={{ display: "flex", gap: 10, padding: "0 20px 18px", justifyContent: "flex-end" }}>
        <button className="btn btn-ghost" onClick={close}>Cancel</button>
        {onSave && <button className="btn btn-primary" onClick={onSave}>{saveLabel}</button>}
      </div>
    </>
  );
}

function AccountModal({ close, patch, month }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("checking");
  const [bal, setBal] = useState("");
  const save = () => {
    if (!name.trim()) return;
    const id = uid("a");
    patch((s) => {
      s.accounts.push({ id, name: name.trim(), type, onBudget: true });
      const cents = parseMoney(bal);
      if (cents !== 0) {
        s.transactions.push({
          id: uid("t"), accountId: id, date: `${curYM}-01`, payee: "Starting Balance",
          categoryId: cents > 0 && type !== "credit" ? "income" : null, amount: cents, cleared: true, memo: "",
        });
      }
    });
    close();
  };
  return (
    <ModalShell title="Add account" close={close} onSave={save} saveLabel="Add account">
      <div className="field"><label>Account name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency Fund" autoFocus /></div>
      <div className="field">
        <label>Type</label>
        <div className="seg">
          {[["checking", "Checking"], ["savings", "Savings"], ["credit", "Credit"]].map(([v, l]) => (
            <button key={v} className={type === v ? "on" : ""} onClick={() => setType(v)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="field"><label>Current balance</label><input value={bal} onChange={(e) => setBal(e.target.value)} placeholder="0.00" className="num" /></div>
      <p style={{ fontSize: 12, color: "var(--ink3)", margin: 0 }}>A positive starting balance becomes income you can assign.</p>
    </ModalShell>
  );
}

function GroupModal({ close, patch }) {
  const [name, setName] = useState("");
  const save = () => { if (!name.trim()) return; patch((s) => s.groups.push({ id: uid("g"), name: name.trim() })); close(); };
  return (
    <ModalShell title="New category group" close={close} onSave={save} saveLabel="Add group">
      <div className="field"><label>Group name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Subscriptions" autoFocus /></div>
    </ModalShell>
  );
}

function CategoryModal({ close, patch, groupId }) {
  const [name, setName] = useState("");
  const save = () => { if (!name.trim()) return; patch((s) => s.categories.push({ id: uid("c"), groupId, name: name.trim(), goal: null })); close(); };
  return (
    <ModalShell title="New category" close={close} onSave={save} saveLabel="Add category">
      <div className="field"><label>Category name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Netflix" autoFocus /></div>
    </ModalShell>
  );
}

function GoalModal({ close, patch, cat }) {
  const [type, setType] = useState(cat.goal?.type || "monthly");
  const [amount, setAmount] = useState(cat.goal ? (cat.goal.amount / 100).toFixed(2) : "");
  const save = () => {
    patch((s) => { const c = s.categories.find((x) => x.id === cat.id); if (c) c.goal = { type, amount: parseMoney(amount) }; });
    close();
  };
  const remove = () => { patch((s) => { const c = s.categories.find((x) => x.id === cat.id); if (c) c.goal = null; }); close(); };
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
        <h3 style={{ fontWeight: 700, fontSize: 16 }}>Goal · {cat.name}</h3>
        <button onClick={close} style={{ color: "var(--ink3)" }}><X size={19} /></button>
      </div>
      <div style={{ padding: "18px 20px" }}>
        <div className="field">
          <label>Goal type</label>
          <div className="seg">
            <button className={type === "monthly" ? "on" : ""} onClick={() => setType("monthly")}>Monthly funding</button>
            <button className={type === "target" ? "on" : ""} onClick={() => setType("target")}>Savings target</button>
          </div>
        </div>
        <div className="field"><label>{type === "monthly" ? "Assign each month" : "Total to save"}</label><input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="num" autoFocus /></div>
        <p style={{ fontSize: 12, color: "var(--ink3)", margin: 0 }}>{type === "monthly" ? "Progress tracks this month's assigned amount." : "Progress tracks total available in the category."}</p>
      </div>
      <div style={{ display: "flex", gap: 10, padding: "0 20px 18px", justifyContent: "space-between" }}>
        <button className="btn btn-ghost" style={{ color: "var(--neg)" }} onClick={remove} disabled={!cat.goal}>Remove goal</button>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost" onClick={close}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save goal</button>
        </div>
      </div>
    </>
  );
}

function ResetModal({ close, setState }) {
  const reset = () => { setState(seed()); saveState(seed()); close(); };
  return (
    <ModalShell title="Reset demo data" close={close} onSave={reset} saveLabel="Reset everything">
      <p style={{ fontSize: 14, color: "var(--ink2)", margin: 0, lineHeight: 1.5 }}>
        This replaces all accounts, transactions, categories, and assignments with the original sample budget. This can't be undone.
      </p>
    </ModalShell>
  );
}
