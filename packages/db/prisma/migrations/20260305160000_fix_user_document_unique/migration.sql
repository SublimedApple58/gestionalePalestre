-- Fix: drop the stale unique index on (userId, type) that was not removed by the previous migration.
-- The original index was created as a UNIQUE INDEX (not a CONSTRAINT), so DROP CONSTRAINT had no effect.
DROP INDEX IF EXISTS "UserDocument_userId_type_key";

-- Ensure the correct unique index on (userId, type, side) exists (idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS "UserDocument_userId_type_side_key" ON "UserDocument"("userId", "type", "side");
