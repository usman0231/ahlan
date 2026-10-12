-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'RESTORE';

-- DropIndex
DROP INDEX "eod_reports_stadiumId_inspectorId_date_key";

-- AlterTable
ALTER TABLE "disciplines" ADD COLUMN     "deletedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "eod_reports" ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "deletedById" UUID,
ADD COLUMN     "deletedSlot" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "findings" ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "deletedById" UUID;

-- AlterTable
ALTER TABLE "inspections" ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "deletedById" UUID;

-- AlterTable
ALTER TABLE "observations" ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "deletedById" UUID;

-- AlterTable
ALTER TABLE "stadiums" ADD COLUMN     "imageKey" TEXT,
ADD COLUMN     "imageUpdatedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "deletedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "disciplines_deletedAt_idx" ON "disciplines"("deletedAt");

-- CreateIndex
CREATE INDEX "eod_reports_deletedAt_idx" ON "eod_reports"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "eod_reports_stadiumId_inspectorId_date_deletedSlot_key" ON "eod_reports"("stadiumId", "inspectorId", "date", "deletedSlot");

-- CreateIndex
CREATE INDEX "findings_deletedAt_idx" ON "findings"("deletedAt");

-- CreateIndex
CREATE INDEX "inspections_deletedAt_idx" ON "inspections"("deletedAt");

-- CreateIndex
CREATE INDEX "observations_deletedAt_idx" ON "observations"("deletedAt");

-- CreateIndex
CREATE INDEX "tournaments_deletedAt_idx" ON "tournaments"("deletedAt");

