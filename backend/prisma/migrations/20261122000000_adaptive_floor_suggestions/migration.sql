ALTER TABLE "Project" ADD COLUMN "suggestionsEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Room"
  ADD COLUMN "preferredCategory" TEXT,
  ADD COLUMN "preferredSource" TEXT,
  ADD CONSTRAINT "Room_preferredCategory_check" CHECK ("preferredCategory" IN ('ceramic', 'laminate')),
  ADD CONSTRAINT "Room_preferredSource_check" CHECK ("preferredSource" IN ('sodimac', 'easy'));
