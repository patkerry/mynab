-- Manual ordering for categories and category groups (drag-and-drop reorder).
-- Default 0 + the existing createdAt tiebreak in getBudgetPageData preserves current order.
ALTER TABLE "categories" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "category_groups" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
