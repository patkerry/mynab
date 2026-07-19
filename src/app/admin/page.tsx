import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { AdminUserActions } from "./AdminUserActions";

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
      },
    }),
  ]);

  return (
    <div style={{ padding: "2rem", maxWidth: 1100, margin: "0 auto", overflowX: "auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 4 }}>Admin</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        {users.length} user{users.length === 1 ? "" : "s"} · {budgets.length} budget{budgets.length === 1 ? "" : "s"}
      </p>

      <h2 style={h2}>Users</h2>
      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Email</th>
            <th style={th}>Name</th>
            <th style={th}>Budgets</th>
            <th style={th}>Joined</th>
            <th style={th}>Status</th>
            <th style={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td style={td}>
                {u.email}
                {u.isAdmin && <span style={badge("#06c")}>admin</span>}
              </td>
              <td style={td}>{u.name ?? "—"}</td>
              <td style={td}>{u._count.memberships}</td>
              <td style={td}>{fmtDate(u.createdAt)}</td>
              <td style={td}>
                {u.suspendedAt ? <span style={badge("#c33")}>suspended</span> : <span style={{ color: "#0a7" }}>active</span>}
              </td>
              <td style={td}>
                <AdminUserActions userId={u.id} email={u.email} suspended={!!u.suspendedAt} isSelf={u.id === admin.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ ...h2, marginTop: 40 }}>Budgets</h2>
      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Name</th>
            <th style={th}>Members</th>
            <th style={th}>Accounts</th>
            <th style={th}>Transactions</th>
            <th style={th}>Created</th>
          </tr>
        </thead>
        <tbody>
          {budgets.map((b) => (
            <tr key={b.id}>
              <td style={td}>{b.name}</td>
              <td style={td}>{b._count.memberships}</td>
              <td style={td}>{b._count.accounts}</td>
              <td style={td}>{b._count.transactions}</td>
              <td style={td}>{fmtDate(b.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const h2: React.CSSProperties = { fontSize: "1.1rem", fontWeight: 600, marginBottom: 12 };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", borderBottom: "2px solid #e5e5e5", color: "#666", fontWeight: 600 };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #eee" };
function badge(color: string): React.CSSProperties {
  return { marginLeft: 8, fontSize: 11, fontWeight: 600, color, border: `1px solid ${color}`, borderRadius: 4, padding: "1px 5px" };
}
