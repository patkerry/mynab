-- Admin/suspension fields on users (web-only table; empty on desktop, so a plain ADD COLUMN is safe).
ALTER TABLE "users" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "suspendedAt" DATETIME;
