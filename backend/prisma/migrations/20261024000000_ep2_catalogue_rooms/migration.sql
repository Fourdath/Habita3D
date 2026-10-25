-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "budgetClp" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "ownerId" INTEGER;

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "areaMode" TEXT NOT NULL,
    "areaM2" DECIMAL(18,6),
    "lengthM" DECIMAL(18,6),
    "widthM" DECIMAL(18,6),
    "wastePercent" DECIMAL(9,6) NOT NULL DEFAULT 10,
    "budgetClp" BIGINT,
    "publicationKey" TEXT,
    "sceneRoomId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Publication" (
    "publicationKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "sku" TEXT,
    "seller" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT NOT NULL,
    "productUrl" TEXT NOT NULL,
    "imageUrl" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "priceType" TEXT NOT NULL DEFAULT 'public',
    "pricePerBoxClp" INTEGER NOT NULL,
    "saleUnit" TEXT NOT NULL,
    "coveragePerBoxM2" DECIMAL(18,6),
    "pricePerM2Clp" DECIMAL(20,2),
    "reportedPriceM2Clp" DECIMAL(20,6),
    "availability" TEXT NOT NULL,
    "communeCode" TEXT NOT NULL DEFAULT '13110',
    "commune" TEXT NOT NULL DEFAULT 'La Florida',
    "region" TEXT NOT NULL DEFAULT 'Metropolitana',
    "checkedAt" TIMESTAMPTZ(6) NOT NULL,
    "promotions" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "extractorVersion" TEXT NOT NULL,
    "lastRunId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("publicationKey")
);

-- CreateTable
CREATE TABLE "CaptureRun" (
    "runId" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "scheduledFor" TIMESTAMPTZ(6),
    "startedAt" TIMESTAMPTZ(6) NOT NULL,
    "finishedAt" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "groups" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "publicationCount" INTEGER NOT NULL,
    "updatedCount" INTEGER NOT NULL,
    "retainedCount" INTEGER NOT NULL,

    CONSTRAINT "CaptureRun_pkey" PRIMARY KEY ("runId")
);

-- CreateTable
CREATE TABLE "PriceObservation" (
    "id" SERIAL NOT NULL,
    "publicationKey" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "observedAt" TIMESTAMPTZ(6) NOT NULL,
    "pricePerBoxClp" INTEGER NOT NULL,
    "coveragePerBoxM2" DECIMAL(18,6),
    "pricePerM2Clp" DECIMAL(20,2),
    "saleUnit" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,

    CONSTRAINT "PriceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptureJob" (
    "id" TEXT NOT NULL,
    "scheduledFor" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(6) NOT NULL,
    "finishedAt" TIMESTAMPTZ(6),
    "runId" TEXT,
    "requestId" TEXT NOT NULL,
    "errorCode" TEXT,

    CONSTRAINT "CaptureJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Room_projectId_idx" ON "Room"("projectId");

-- CreateIndex
CREATE INDEX "Room_publicationKey_idx" ON "Room"("publicationKey");

-- CreateIndex
CREATE INDEX "Publication_category_source_pricePerM2Clp_idx" ON "Publication"("category", "source", "pricePerM2Clp");

-- CreateIndex
CREATE INDEX "Publication_source_category_checkedAt_idx" ON "Publication"("source", "category", "checkedAt");

-- CreateIndex
CREATE INDEX "Publication_checkedAt_idx" ON "Publication"("checkedAt");

-- CreateIndex
CREATE INDEX "CaptureRun_finishedAt_idx" ON "CaptureRun"("finishedAt");

-- CreateIndex
CREATE INDEX "PriceObservation_publicationKey_observedAt_idx" ON "PriceObservation"("publicationKey", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PriceObservation_publicationKey_runId_key" ON "PriceObservation"("publicationKey", "runId");

-- CreateIndex
CREATE INDEX "CaptureJob_startedAt_idx" ON "CaptureJob"("startedAt");

-- CreateIndex
CREATE INDEX "Project_ownerId_createdAt_idx" ON "Project"("ownerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_publicationKey_fkey" FOREIGN KEY ("publicationKey") REFERENCES "Publication"("publicationKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_lastRunId_fkey" FOREIGN KEY ("lastRunId") REFERENCES "CaptureRun"("runId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_publicationKey_fkey" FOREIGN KEY ("publicationKey") REFERENCES "Publication"("publicationKey") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CaptureRun"("runId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve legacy EP1 projects (ownerId NULL), but bound all new monetary values.
ALTER TABLE "Project" ADD CONSTRAINT "Project_budgetClp_check"
  CHECK ("budgetClp" >= 0 AND "budgetClp" <= 1000000000000000);

ALTER TABLE "Room" ADD CONSTRAINT "Room_surface_check" CHECK (
  ("areaMode" = 'area' AND "areaM2" > 0 AND "areaM2" <= 1000000
    AND "lengthM" IS NULL AND "widthM" IS NULL)
  OR
  ("areaMode" = 'dimensions' AND "areaM2" IS NULL
    AND "lengthM" > 0 AND "lengthM" <= 10000
    AND "widthM" > 0 AND "widthM" <= 10000)
);
-- CHECK alone accepts NULL/unknown expressions: require mode-specific values.
ALTER TABLE "Room" ADD CONSTRAINT "Room_required_surface_check" CHECK (
  ("areaMode" = 'area' AND "areaM2" IS NOT NULL)
  OR ("areaMode" = 'dimensions' AND "lengthM" IS NOT NULL AND "widthM" IS NOT NULL)
);
ALTER TABLE "Room" ADD CONSTRAINT "Room_wastePercent_check" CHECK ("wastePercent" BETWEEN 0 AND 100);
ALTER TABLE "Room" ADD CONSTRAINT "Room_budgetClp_check" CHECK ("budgetClp" IS NULL OR "budgetClp" BETWEEN 0 AND 1000000000000000);

ALTER TABLE "Publication" ADD CONSTRAINT "Publication_scope_check" CHECK (
  "source" IN ('sodimac', 'easy') AND "category" IN ('ceramic', 'laminate')
  AND "currency" = 'CLP' AND "priceType" = 'public' AND "communeCode" = '13110'
  AND "commune" = 'La Florida' AND "region" = 'Metropolitana'
  AND "availability" IN ('available', 'unavailable', 'unknown')
  AND "saleUnit" IN ('box', 'unknown')
  AND "publicationKey" ~ '^[0-9a-f]{64}$'
  AND "pricePerBoxClp" BETWEEN 1 AND 1000000000
);
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_coverage_check" CHECK (
  ("coveragePerBoxM2" IS NULL AND "pricePerM2Clp" IS NULL)
  OR ("coveragePerBoxM2" IS NOT NULL AND "pricePerM2Clp" IS NOT NULL
    AND "saleUnit" = 'box' AND "coveragePerBoxM2" BETWEEN 0.000001 AND 1000
    AND "pricePerM2Clp" BETWEEN 0 AND 1000000000000000)
);
ALTER TABLE "CaptureRun" ADD CONSTRAINT "CaptureRun_status_check"
  CHECK ("status" IN ('complete', 'partial', 'failed') AND "origin" = 'live'
    AND "trigger" IN ('manual', 'scheduled') AND "finishedAt" >= "startedAt"
    AND "publicationCount" BETWEEN 0 AND 40
    AND "updatedCount" BETWEEN 0 AND 40 AND "retainedCount" BETWEEN 0 AND 40);
ALTER TABLE "CaptureJob" ADD CONSTRAINT "CaptureJob_status_check"
  CHECK ("status" IN ('running', 'complete', 'partial', 'failed')
    AND ("finishedAt" IS NULL OR "finishedAt" >= "startedAt"));
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_value_check"
  CHECK ("pricePerBoxClp" BETWEEN 1 AND 1000000000
    AND "changeType" IN ('initial', 'price_or_pack_change')
    AND "saleUnit" IN ('box', 'unknown'));
