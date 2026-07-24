"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Sparkles, Plus, ChevronDown, ChevronUp, Eye, EyeOff, CalendarClock, Pencil, GripVertical } from "lucide-react";
import { fmt, addMonths, monthLabel, curYM } from "@/lib/format";
import { useModal } from "./modal/ModalContext";
import { useToast } from "./toast/ToastContext";
import { useRunAction } from "./useRunAction";
import { autoAssignGoals, quickBudget, setGroupHidden, reorderCategories, reorderGroups } from "@/app/(app)/budget/actions";
import { CatRow } from "./CatRow";
import type { Category, CategoryGroup } from "@/generated/prisma-postgres/client";
import type { BudgetPageModel, CatMonth } from "@/lib/types";
import styles from "./BudgetView.module.css";

const EMPTY_ROW: CatMonth = { assigned: 0, activity: 0, avail: 0, lastAssigned: 0 };

export function BudgetView({
  month,
  groups,
  categories,
  model,
}: {
  month: string;
  groups: CategoryGroup[];
  categories: Category[];
  // Server-computed per-category numbers + breakdowns — the engine no longer runs client-side
  // and the transaction history never reaches the browser (see getBudgetPageModel in queries.ts).
  model: BudgetPageModel;
}) {
  const { openModal } = useModal();
  const { showToast } = useToast();
  const router = useRouter();
  const run = useRunAction();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  // Drag-and-drop reorder. Categories reorder within their group; groups reorder among themselves.
  // The two drag states are independent, so a category drop on a group header (or vice versa) no-ops.
  const [dragCatId, setDragCatId] = useState<string | null>(null);
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);

  // Move dragId to just before targetId within an id list.
  const moveBefore = (ids: string[], dragId: string, targetId: string) => {
    const rest = ids.filter((id) => id !== dragId);
    rest.splice(rest.indexOf(targetId), 0, dragId);
    return rest;
  };
  const onCatDrop = (targetId: string, groupCatIds: string[]) => {
    if (!dragCatId || dragCatId === targetId || !groupCatIds.includes(dragCatId)) {
      setDragCatId(null);
      return;
    }
    void run(() => reorderCategories(moveBefore(groupCatIds, dragCatId, targetId)));
    setDragCatId(null);
  };
  const onGroupDrop = (targetId: string) => {
    if (!dragGroupId || dragGroupId === targetId) {
      setDragGroupId(null);
      return;
    }
    void run(() => reorderGroups(moveBefore(groups.map((g) => g.id), dragGroupId, targetId)));
    setDragGroupId(null);
  };
  const row = (catId: string): CatMonth => model.rows[catId] ?? EMPTY_ROW;

  const handleAutoAssign = async () => {
    const result = await run(() => autoAssignGoals(month), { refresh: false });
    if (!result) return;
    const { count, totalCents } = result;
    if (count > 0) {
      showToast(`Auto-assigned ${fmt(totalCents)} across ${count} goal${count > 1 ? "s" : ""}`, "success");
    } else {
      showToast("Nothing to auto-assign — no underfunded goals, or nothing left to assign");
    }
    router.refresh();
  };

  const handleQuickBudget = async () => {
    const result = await run(() => quickBudget(month), { refresh: false });
    if (!result) return;
    const { count, totalCents } = result;
    if (count > 0) {
      showToast(`Budgeted ${fmt(totalCents)} across ${count} categor${count > 1 ? "ies" : "y"} from your 3-month average`, "success");
    } else {
      showToast("Nothing to budget — no recent history to average, or every category is already assigned");
    }
    router.refresh();
  };

  const rta = model.rta;
  const rtaState = rta > 0 ? "pos" : rta < 0 ? "neg" : "zero";
  const banner = {
    pos: { label: "Ready to Assign", sub: "Give every dollar a job" },
    neg: { label: "Over-Assigned", sub: "You've assigned more than you have" },
    zero: { label: "All Money Assigned", sub: "Every dollar has a job" },
  }[rtaState];
  // Sage/state eyebrow + warm-ink number for the calm hero (rust when over-assigned).
  const bannerColor = rtaState === "pos" ? "var(--pos)" : rtaState === "neg" ? "var(--neg)" : "var(--accentDeep)";
  const heroNum = rtaState === "neg" ? "var(--neg)" : "var(--ink)";

  // Payment categories live in a hidden CategoryGroup (excluded from `groups`) so they don't
  // get a manageable, renameable group header — but they still need a place for users to
  // assign to them directly (per spec) and to see the transparency breakdown, so they get a
  // dedicated, always-visible section below the normal groups instead of vanishing entirely.
  const paymentCategories = categories.filter((c) => c.linkedAccountId);
  const pcLastAssigned = paymentCategories.reduce((s, c) => s + row(c.id).lastAssigned, 0);
  const pcAssigned = paymentCategories.reduce((s, c) => s + row(c.id).assigned, 0);
  const pcActivity = paymentCategories.reduce((s, c) => s + row(c.id).activity, 0);
  const pcAvail = paymentCategories.reduce((s, c) => s + row(c.id).avail, 0);

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.monthNav}>
          <Link href={`/budget?month=${addMonths(month, -1)}`} className={`btn btn-ghost ${styles.navBtn}`}>
            <ChevronLeft size={16} />
          </Link>
          <div className={styles.monthLabel}>{monthLabel(month)}</div>
          <Link href={`/budget?month=${addMonths(month, 1)}`} className={`btn btn-ghost ${styles.navBtn}`}>
            <ChevronRight size={16} />
          </Link>
          {month !== curYM() && (
            <Link href="/budget" className="btn btn-ghost">
              Today
            </Link>
          )}
        </div>
        <div className={styles.actions}>
          <button className="btn btn-ghost" onClick={handleQuickBudget} title="Fill every not-yet-budgeted category from its 3-month average">
            <CalendarClock size={15} /> Quick budget
          </button>
          <button className="btn btn-ghost" onClick={handleAutoAssign}>
            <Sparkles size={15} /> Auto-assign goals
          </button>
          <button className="btn btn-ghost" onClick={() => openModal({ type: "group" })}>
            <Plus size={15} /> Category group
          </button>
        </div>
      </div>

      <div className={styles.rtaWrap}>
        <div
          className={`card ${styles.rtaCard}`}
          title="Ready to Assign is your total unassigned money across all months — it isn't scoped to the selected month, so it stays the same as you page between months."
        >
          <div>
            <div className={`eyebrow ${styles.rtaEyebrow}`} style={{ color: bannerColor }}>
              {banner.label}
              <span className={styles.allMonths}> · all months</span>
            </div>
            <div className={styles.rtaSub}>{banner.sub}</div>
          </div>
          <div className={`num ${styles.heroNum}`} style={{ color: heroNum }}>
            {fmt(rta)}
          </div>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.headerRow}>
          <span className="eyebrow">Category</span>
          <span className={`eyebrow ${styles.right}`}>Last mo</span>
          <span className={`eyebrow ${styles.right}`}>Assigned</span>
          <span className={`eyebrow ${styles.right}`}>Activity</span>
          <span className={`eyebrow ${styles.right}`}>Available</span>
        </div>

        <div className={styles.groupList}>
          {groups.map((g) => {
            const cats = categories.filter((c) => c.groupId === g.id);
            // Hiding is purely a display filter — group totals still include hidden categories
            // (their money is real and still accounted for), only the individual rows are
            // tucked behind the expand toggle below.
            const visibleCats = cats.filter((c) => !c.isHidden);
            const hiddenCats = cats.filter((c) => c.isHidden);
            const isExpanded = expandedGroups[g.id] ?? false;
            const grpLastAssigned = cats.reduce((s, c) => s + row(c.id).lastAssigned, 0);
            const grpAssigned = cats.reduce((s, c) => s + row(c.id).assigned, 0);
            const grpActivity = cats.reduce((s, c) => s + row(c.id).activity, 0);
            const grpAvail = cats.reduce((s, c) => s + row(c.id).avail, 0);
            return (
              <div key={g.id} className={`card ${styles.groupCard}`}>
                <div
                  draggable
                  onDragStart={() => setDragGroupId(g.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    onGroupDrop(g.id);
                  }}
                  className={styles.groupHead}
                >
                  <div className={styles.groupNameCell}>
                    <span title="Drag to reorder group" className={styles.grip}>
                      <GripVertical size={14} />
                    </span>
                    <span className={styles.groupName}>{g.name}</span>
                    <button onClick={() => openModal({ type: "category", groupId: g.id })} title="Add category" className={styles.iconBtn}>
                      <Plus size={15} />
                    </button>
                    {cats.length > 0 && (
                      <button
                        onClick={() => run(() => setGroupHidden(g.id, hiddenCats.length !== cats.length))}
                        title={hiddenCats.length === cats.length ? "Unhide category group" : "Hide category group"}
                        className={styles.iconBtn}
                      >
                        {hiddenCats.length === cats.length ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>
                    )}
                    <button onClick={() => openModal({ type: "editGroup", group: g })} title="Rename or delete group" className={styles.iconBtn}>
                      <Pencil size={13} />
                    </button>
                  </div>
                  <span className={`num ${styles.grpLast}`}>{fmt(grpLastAssigned)}</span>
                  <span className={`num ${styles.grpMid}`}>{fmt(grpAssigned)}</span>
                  <span className={`num ${styles.grpMid}`}>{fmt(grpActivity)}</span>
                  <span className={`num ${styles.grpAvail}`} style={{ color: grpAvail < 0 ? "var(--neg)" : "var(--ink)" }}>
                    {fmt(grpAvail)}
                  </span>
                </div>
                {visibleCats.map((c) => (
                  <CatRow
                    key={c.id}
                    c={c}
                    month={month}
                    data={row(c.id)}
                    onDragStart={() => setDragCatId(c.id)}
                    onDrop={() => onCatDrop(c.id, cats.map((x) => x.id))}
                  />
                ))}
                {hiddenCats.length > 0 && (
                  <>
                    <button
                      onClick={() => setExpandedGroups((prev) => ({ ...prev, [g.id]: !isExpanded }))}
                      className={`${styles.expandBtn} ${isExpanded ? styles.expandBtnOpen : ""}`}
                    >
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      {hiddenCats.length} hidden categor{hiddenCats.length > 1 ? "ies" : "y"}
                    </button>
                    {isExpanded &&
                      hiddenCats.map((c) => (
                        <CatRow
                          key={c.id}
                          c={c}
                          month={month}
                          data={row(c.id)}
                          onDragStart={() => setDragCatId(c.id)}
                          onDrop={() => onCatDrop(c.id, cats.map((x) => x.id))}
                        />
                      ))}
                  </>
                )}
              </div>
            );
          })}

          {paymentCategories.length > 0 && (
            <div className={`card ${styles.groupCard}`}>
              <div className={styles.groupHead}>
                <span className={styles.groupName}>Credit Card Payments</span>
                <span className={`num ${styles.grpLast}`}>{fmt(pcLastAssigned)}</span>
                <span className={`num ${styles.grpMid}`}>{fmt(pcAssigned)}</span>
                <span className={`num ${styles.grpMid}`}>{fmt(pcActivity)}</span>
                <span className={`num ${styles.grpAvail}`} style={{ color: pcAvail < 0 ? "var(--neg)" : "var(--ink)" }}>
                  {fmt(pcAvail)}
                </span>
              </div>
              {paymentCategories.map((c) => (
                <CatRow
                  key={c.id}
                  c={c}
                  month={month}
                  data={row(c.id)}
                  breakdown={model.breakdowns[c.id]}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
