-- CreateEnum
CREATE TYPE "ChecklistCategory" AS ENUM ('READINESS', 'DISCIPLINE', 'GENERAL');

-- AlterTable
ALTER TABLE "checklists" ADD COLUMN     "category" "ChecklistCategory" NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "disciplines" ADD COLUMN     "description" TEXT,
ADD COLUMN     "descriptionAr" TEXT;

-- AlterTable
ALTER TABLE "eod_reports" ADD COLUMN     "actionsMitigation" TEXT,
ADD COLUMN     "additionalRemarks" TEXT,
ADD COLUMN     "fireIncidents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "firstAidCases" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hseObservationsReported" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nonWorkRelatedMedical" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "otherIncidents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalSpectators" INTEGER,
ADD COLUMN     "workRelatedMedical" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: contractor/headcount become category/personnel (renamed, data kept),
-- plus hours per person backfilled as manHours / personnel (2dp, capped at 24).
ALTER TABLE "eod_workforce_entries" RENAME COLUMN "contractor" TO "category";
ALTER TABLE "eod_workforce_entries" RENAME COLUMN "headcount" TO "personnel";
ALTER TABLE "eod_workforce_entries" ADD COLUMN     "hours" DECIMAL(5,2) NOT NULL DEFAULT 0;
UPDATE "eod_workforce_entries"
   SET "hours" = LEAST(24, ROUND("manHours" / "personnel", 2))
 WHERE "personnel" > 0;

-- AlterTable
ALTER TABLE "inspection_responses" ADD COLUMN     "concern" TEXT,
ADD COLUMN     "recommendation" TEXT;

-- AlterTable
ALTER TABLE "inspections" ADD COLUMN     "locationLabel" TEXT,
ADD COLUMN     "otherObservations" TEXT;

-- CreateTable
CREATE TABLE "eod_window_defaults" (
    "id" UUID NOT NULL,
    "stadiumId" UUID,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "eod_window_defaults_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "eod_window_defaults_stadiumId_key" ON "eod_window_defaults"("stadiumId");

-- CreateIndex
CREATE INDEX "eod_window_defaults_updatedAt_idx" ON "eod_window_defaults"("updatedAt");

-- CreateIndex
CREATE INDEX "checklists_category_idx" ON "checklists"("category");

-- AddForeignKey
ALTER TABLE "eod_window_defaults" ADD CONSTRAINT "eod_window_defaults_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "stadiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_window_defaults" ADD CONSTRAINT "eod_window_defaults_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: existing discipline checklists are DISCIPLINE; existing EOD reports
-- carry their recordable incidents as work-related medical cases.
UPDATE "checklists" SET "category" = 'DISCIPLINE' WHERE "disciplineId" IS NOT NULL;
UPDATE "eod_reports" SET "workRelatedMedical" = "recordableIncidents";
