import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { AdminUserActions } from "./AdminUserActions";
import styles from "./page.module.css";

// Global admin console. requireAdmin() redirects non-admins/suspended before any data loads.
// Web-only in practice; the desktop build has no users so this page is never meaningfully reached.
export const dynamic = "force-dynamic";

function fmtDate(d: Date | null) {
  return d ? new Date(d).toISOString().slice(0, 10) : "—";
}

export default async function AdminPage() {
  const admin = await requireAdmin();

  const [users, budgets] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        isAdmin: true,
        suspendedAt: true,
        createdAt: true,
        _count: { select: { memberships: true } },
      },
    }),
    prisma.budget.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { memberships: true, accounts: true, transactions: true } },
        // The budget's owner(s) — normally exactly one OWNER membership.
        memberships: { where: { role: "OWNER" }, select: { user: { select: { email: true, name: true } } } },
      },
    }),
  ]);

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Admin</h1>
      <p className={styles.sub}>
        {users.length} user{users.length === 1 ? "" : "s"} · {budgets.length} budget{budgets.length === 1 ? "" : "s"}
      </p>

      <h2 className={styles.h2}>Users</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Email</th>
            <th className={styles.th}>Name</th>
            <th className={styles.th}>Budgets</th>
            <th className={styles.th}>Joined</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td className={styles.td}>
                {u.email}
                {u.isAdmin && <span className={styles.badgeAdmin}>admin</span>}
              </td>
              <td className={styles.td}>{u.name ?? "—"}</td>
              <td className={styles.td}>{u._count.memberships}</td>
              <td className={styles.td}>{fmtDate(u.createdAt)}</td>
              <td className={styles.td}>
                {u.suspendedAt ? <span className={styles.badgeSuspended}>suspended</span> : <span className={styles.active}>active</span>}
              </td>
              <td className={styles.td}>
                <AdminUserActions userId={u.id} email={u.email} suspended={!!u.suspendedAt} isSelf={u.id === admin.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className={styles.h2Spaced}>Budgets</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Name</th>
            <th className={styles.th}>Owner</th>
            <th className={styles.th}>Members</th>
            <th className={styles.th}>Accounts</th>
            <th className={styles.th}>Transactions</th>
            <th className={styles.th}>Created</th>
          </tr>
        </thead>
        <tbody>
          {budgets.map((b) => {
            const owner = b.memberships[0]?.user;
            return (
              <tr key={b.id}>
                <td className={styles.td}>{b.name}</td>
                <td className={styles.td}>{owner ? owner.email : <span className={styles.noOwner}>no owner</span>}</td>
                <td className={styles.td}>{b._count.memberships}</td>
                <td className={styles.td}>{b._count.accounts}</td>
                <td className={styles.td}>{b._count.transactions}</td>
                <td className={styles.td}>{fmtDate(b.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
