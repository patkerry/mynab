"use client";

import { useState } from "react";
import { GripVertical, Pencil, Plus, Eye, EyeOff } from "lucide-react";
import { useModal } from "./modal/ModalContext";
import { reorderCategories, reorderGroups, setCategoryHidden, setGroupHidden } from "@/app/(app)/budget/actions";
import type { Category, CategoryGroup } from "@/generated/prisma-postgres/client";

export function CategoriesView({ groups, categories }: { groups: CategoryGroup[]; categories: Category[] }) {
  const { openModal } = useModal();
  const [dragCatId, setDragCatId] = useState<string | null>(null);
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);

  const moveBefore = (ids: string[], dragId: string, targetId: string) => {
    const rest = ids.filter((id) => id !== dragId);
    rest.splice(rest.indexOf(targetId), 0, dragId);
    return rest;
  };
  const onCatDrop = (targetId: string, groupCatIds: string[]) => {
    if (dragCatId && dragCatId !== targetId && groupCatIds.includes(dragCatId)) {
      reorderCategories(moveBefore(groupCatIds, dragCatId, targetId));
    }
    setDragCatId(null);
  };
  const onGroupDrop = (targetId: string) => {
    if (dragGroupId && dragGroupId !== targetId) {
      reorderGroups(moveBefore(groups.map((g) => g.id), dragGroupId, targetId));
    }
    setDragGroupId(null);
  };

  const iconBtn = { display: "grid", placeItems: "center", color: "var(--ink3)" } as const;

  return (
    <div style={{ padding: "18px 26px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="eyebrow">Categories</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", margin: "2px 0 0" }}>Manage categories</h2>
          <div style={{ fontSize: 13, color: "var(--ink3)", marginTop: 2 }}>Add, rename, delete, hide, or drag to reorder. Amounts live on the Budget screen.</div>
        </div>
        <button className="btn btn-ghost" onClick={() => openModal({ type: "group" })}>
          <Plus size={15} /> Category group
        </button>
      </div>

      {groups.length === 0 && (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--ink3)", fontSize: 13 }}>
          No category groups yet. Add one to get started.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {groups.map((g) => {
          const cats = categories.filter((c) => c.groupId === g.id);
          const catIds = cats.map((c) => c.id);
          const allHidden = cats.length > 0 && cats.every((c) => c.isHidden);
          return (
            <div key={g.id} className="card" style={{ overflow: "hidden" }}>
              <div
                draggable
                onDragStart={() => setDragGroupId(g.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  onGroupDrop(g.id);
                }}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", background: "var(--paper)", borderBottom: "1px solid var(--line)" }}
              >
                <span title="Drag to reorder group" style={{ cursor: "grab", ...iconBtn, marginLeft: -4 }}>
                  <GripVertical size={14} />
                </span>
                <span style={{ fontWeight: 700, fontSize: 13.5, flex: 1 }}>{g.name}</span>
                <button onClick={() => openModal({ type: "category", groupId: g.id })} title="Add category" style={iconBtn}>
                  <Plus size={16} />
                </button>
                <button onClick={() => openModal({ type: "editGroup", group: g })} title="Rename or delete group" style={iconBtn}>
                  <Pencil size={13} />
                </button>
                {cats.length > 0 && (
                  <button onClick={() => setGroupHidden(g.id, !allHidden)} title={allHidden ? "Unhide group" : "Hide group"} style={iconBtn}>
                    {allHidden ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                )}
              </div>

              {cats.length === 0 ? (
                <div style={{ padding: "12px 14px 12px 40px", fontSize: 12.5, color: "var(--ink3)" }}>No categories — use ＋ to add one.</div>
              ) : (
                cats.map((c) => (
                  <div
                    key={c.id}
                    className="row-hover"
                    draggable
                    onDragStart={() => setDragCatId(c.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      onCatDrop(c.id, catIds);
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--line)", opacity: c.isHidden ? 0.55 : 1 }}
                  >
                    <span title="Drag to reorder" style={{ cursor: "grab", ...iconBtn }}>
                      <GripVertical size={13} />
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", flex: 1 }}>{c.name}</span>
                    {c.isHidden && <span style={{ fontSize: 10.5, color: "var(--ink3)", fontWeight: 600 }}>hidden</span>}
                    <button onClick={() => openModal({ type: "editCategory", cat: c })} title="Rename or delete category" style={iconBtn}>
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setCategoryHidden(c.id, !c.isHidden)} title={c.isHidden ? "Unhide category" : "Hide category"} style={iconBtn}>
                      {c.isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
