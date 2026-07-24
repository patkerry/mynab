"use client";

import { useState } from "react";
import { GripVertical, Pencil, Plus, Eye, EyeOff } from "lucide-react";
import { useModal } from "./modal/ModalContext";
import { useRunAction } from "./useRunAction";
import { reorderCategories, reorderGroups, setCategoryHidden, setGroupHidden } from "@/app/(app)/budget/actions";
import type { Category, CategoryGroup } from "@/generated/prisma-postgres/client";
import styles from "./CategoriesView.module.css";

export function CategoriesView({ groups, categories }: { groups: CategoryGroup[]; categories: Category[] }) {
  const { openModal } = useModal();
  const run = useRunAction();
  const [dragCatId, setDragCatId] = useState<string | null>(null);
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);

  const moveBefore = (ids: string[], dragId: string, targetId: string) => {
    const rest = ids.filter((id) => id !== dragId);
    rest.splice(rest.indexOf(targetId), 0, dragId);
    return rest;
  };
  const onCatDrop = (targetId: string, groupCatIds: string[]) => {
    if (dragCatId && dragCatId !== targetId && groupCatIds.includes(dragCatId)) {
      void run(() => reorderCategories(moveBefore(groupCatIds, dragCatId, targetId)));
    }
    setDragCatId(null);
  };
  const onGroupDrop = (targetId: string) => {
    if (dragGroupId && dragGroupId !== targetId) {
      void run(() => reorderGroups(moveBefore(groups.map((g) => g.id), dragGroupId, targetId)));
    }
    setDragGroupId(null);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className="eyebrow">Categories</div>
          <h2 className={styles.h2}>Manage categories</h2>
          <div className={styles.desc}>Add, rename, delete, hide, or drag to reorder. Amounts live on the Budget screen.</div>
        </div>
        <button className="btn btn-ghost" onClick={() => openModal({ type: "group" })}>
          <Plus size={15} /> Category group
        </button>
      </div>

      {groups.length === 0 && <div className={styles.empty}>No category groups yet. Add one to get started.</div>}

      <div className={styles.groupList}>
        {groups.map((g) => {
          const cats = categories.filter((c) => c.groupId === g.id);
          const catIds = cats.map((c) => c.id);
          const allHidden = cats.length > 0 && cats.every((c) => c.isHidden);
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
                <span title="Drag to reorder group" className={styles.gripGroup}>
                  <GripVertical size={14} />
                </span>
                <span className={styles.groupName}>{g.name}</span>
                <button onClick={() => openModal({ type: "category", groupId: g.id })} title="Add category" className={styles.iconBtn}>
                  <Plus size={16} />
                </button>
                <button onClick={() => openModal({ type: "editGroup", group: g })} title="Rename or delete group" className={styles.iconBtn}>
                  <Pencil size={13} />
                </button>
                {cats.length > 0 && (
                  <button onClick={() => run(() => setGroupHidden(g.id, !allHidden))} title={allHidden ? "Unhide group" : "Hide group"} className={styles.iconBtn}>
                    {allHidden ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                )}
              </div>

              {cats.length === 0 ? (
                <div className={styles.emptyCats}>No categories — use ＋ to add one.</div>
              ) : (
                cats.map((c) => (
                  <div
                    key={c.id}
                    className={`row-hover ${styles.catRow}`}
                    draggable
                    onDragStart={() => setDragCatId(c.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      onCatDrop(c.id, catIds);
                    }}
                    style={{ opacity: c.isHidden ? 0.55 : 1 }}
                  >
                    <span title="Drag to reorder" className={styles.grip}>
                      <GripVertical size={13} />
                    </span>
                    <span className={styles.catName}>{c.name}</span>
                    {c.isHidden && <span className={styles.hiddenTag}>hidden</span>}
                    <button onClick={() => openModal({ type: "editCategory", cat: c })} title="Rename or delete category" className={styles.iconBtn}>
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => run(() => setCategoryHidden(c.id, !c.isHidden))} title={c.isHidden ? "Unhide category" : "Hide category"} className={styles.iconBtn}>
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
