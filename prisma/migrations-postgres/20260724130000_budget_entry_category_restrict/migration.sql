-- Protect budget history at the DB level: a category that has budget entries can no longer be
-- deleted (the FK was Cascade, which would have silently removed the entries). Budget-cascade
-- deletion still works (verified: Postgres orders the cascade so entries go before the category).
ALTER TABLE "budget_entries" DROP CONSTRAINT "budget_entries_categoryId_fkey";
ALTER TABLE "budget_entries" ADD CONSTRAINT "budget_entries_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
