-- Admin/suspension fields on users (web auth table).
ALTER TABLE "users" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "suspendedAt" TIMESTAMP(3);
