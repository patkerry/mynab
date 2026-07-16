-- Enforce that only NORMAL transactions may carry a categoryId;
-- INCOME and TRANSFER transactions must have categoryId IS NULL.
ALTER TABLE "transactions" ADD CONSTRAINT "category_null_unless_normal"
  CHECK ("kind" = 'NORMAL' OR "categoryId" IS NULL);
