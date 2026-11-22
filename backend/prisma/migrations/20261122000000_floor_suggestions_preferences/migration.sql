BEGIN;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "suggestionsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Room"
  ADD COLUMN IF NOT EXISTS "preferredCategory" TEXT,
  ADD COLUMN IF NOT EXISTS "preferredSource" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"Room"'::regclass AND conname = 'Room_preferredCategory_check') THEN
    ALTER TABLE "Room" ADD CONSTRAINT "Room_preferredCategory_check" CHECK ("preferredCategory" IN ('ceramic', 'laminate'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"Room"'::regclass AND conname = 'Room_preferredSource_check') THEN
    ALTER TABLE "Room" ADD CONSTRAINT "Room_preferredSource_check" CHECK ("preferredSource" IN ('sodimac', 'easy'));
  END IF;
END;
$$;
COMMIT;
