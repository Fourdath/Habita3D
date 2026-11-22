ALTER TABLE "Room" ADD COLUMN "lastSuggestedPublicationKey" TEXT;

CREATE INDEX "Room_lastSuggestedPublicationKey_idx" ON "Room"("lastSuggestedPublicationKey");

ALTER TABLE "Room" ADD CONSTRAINT "Room_lastSuggestedPublicationKey_fkey"
    FOREIGN KEY ("lastSuggestedPublicationKey") REFERENCES "Publication"("publicationKey")
    ON DELETE SET NULL ON UPDATE CASCADE;
