-- Investment (asset) and Loan (liability) account types. Real PG enum, so widen the type. ADD VALUE
-- is allowed inside the migration transaction on PG 12+ because the new values aren't used here.
ALTER TYPE "AccountType" ADD VALUE IF NOT EXISTS 'INVESTMENT';
ALTER TYPE "AccountType" ADD VALUE IF NOT EXISTS 'LOAN';
