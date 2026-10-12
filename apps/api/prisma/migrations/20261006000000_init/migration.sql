-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'INSPECTOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ResponseValue" AS ENUM ('YES', 'NO', 'NA');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RiskRating" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'EXTREME');

-- CreateEnum
CREATE TYPE "ObservationType" AS ENUM ('UNSAFE_ACT', 'UNSAFE_CONDITION', 'POSITIVE', 'NEAR_MISS');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'ACTION_ASSIGNED', 'IN_PROGRESS', 'PENDING_VERIFICATION', 'CLOSED');

-- CreateEnum
CREATE TYPE "FindingSource" AS ENUM ('INSPECTION', 'OBSERVATION', 'MANUAL');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('PHOTO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "EvidenceContext" AS ENUM ('INSPECTION_RESPONSE', 'OBSERVATION', 'FINDING', 'CORRECTIVE_ACTION_PROGRESS', 'CORRECTIVE_ACTION_CLOSURE', 'EOD');

-- CreateEnum
CREATE TYPE "EvidenceUploadStatus" AS ENUM ('PENDING', 'UPLOADED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('WEEKLY', 'CUMULATIVE', 'END_OF_TOURNAMENT');

-- CreateEnum
CREATE TYPE "ReportScope" AS ENUM ('CONSOLIDATED', 'STADIUM');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiInsightKind" AS ENUM ('TREND_SUMMARY', 'RISK_FORECAST', 'RECOMMENDATION', 'ANOMALY');

-- CreateEnum
CREATE TYPE "AiReviewStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('ACCESS_REQUEST_SUBMITTED', 'ACCESS_REQUEST_APPROVED', 'ACCESS_REQUEST_REJECTED', 'FINDING_ASSIGNED', 'ACTION_DUE_SOON', 'ACTION_OVERDUE', 'EOD_WINDOW_OPEN', 'EOD_MISSING', 'REPORT_READY', 'AI_INSIGHT_READY');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'SUBMIT', 'ADMIN_CORRECTION', 'STATUS_CHANGE', 'APPROVE', 'REJECT', 'LOGIN', 'LOGOUT');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('en', 'ar');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "organisation" TEXT,
    "jobTitle" TEXT,
    "avatarKey" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'en',
    "lastLoginAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "deviceId" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "lastUsedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "appVersion" TEXT,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_requests" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "organisation" TEXT,
    "jobTitle" TEXT,
    "note" TEXT,
    "requestedStadiumIds" UUID[],
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournaments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stadiums" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "code" TEXT NOT NULL,
    "city" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "capacity" INTEGER,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stadiums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stadium_assignments" (
    "userId" UUID NOT NULL,
    "stadiumId" UUID NOT NULL,
    "assignedById" UUID,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stadium_assignments_pkey" PRIMARY KEY ("userId","stadiumId")
);

-- CreateTable
CREATE TABLE "disciplines" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "icon" TEXT,
    "colorToken" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "disciplines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklists" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "titleAr" TEXT,
    "description" TEXT,
    "disciplineId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentVersionId" UUID,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_stadiums" (
    "checklistId" UUID NOT NULL,
    "stadiumId" UUID NOT NULL,

    CONSTRAINT "checklist_stadiums_pkey" PRIMARY KEY ("checklistId","stadiumId")
);

-- CreateTable
CREATE TABLE "checklist_versions" (
    "id" UUID NOT NULL,
    "checklistId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "changeNote" TEXT,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_sections" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "titleAr" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "checklist_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" UUID NOT NULL,
    "sectionId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "questionAr" TEXT,
    "guidance" TEXT,
    "defaultSeverity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "allowNa" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" UUID NOT NULL,
    "stadiumId" UUID NOT NULL,
    "tournamentId" UUID,
    "checklistId" UUID NOT NULL,
    "checklistVersionId" UUID NOT NULL,
    "inspectorId" UUID NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "localDate" DATE NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "clientCreatedAt" TIMESTAMPTZ(3) NOT NULL,
    "submittedAt" TIMESTAMPTZ(3),
    "serverReceivedAt" TIMESTAMPTZ(3),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "gpsAccuracyM" DOUBLE PRECISION,
    "deviceId" TEXT,
    "appVersion" TEXT,
    "yesCount" INTEGER NOT NULL DEFAULT 0,
    "noCount" INTEGER NOT NULL DEFAULT 0,
    "naCount" INTEGER NOT NULL DEFAULT 0,
    "compliancePercent" DECIMAL(5,2),
    "notes" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_responses" (
    "id" UUID NOT NULL,
    "inspectionId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "itemCode" TEXT NOT NULL,
    "value" "ResponseValue" NOT NULL,
    "comment" TEXT,
    "severity" "Severity",
    "answeredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inspection_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observations" (
    "id" UUID NOT NULL,
    "stadiumId" UUID NOT NULL,
    "tournamentId" UUID,
    "disciplineId" UUID NOT NULL,
    "inspectorId" UUID NOT NULL,
    "type" "ObservationType" NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "riskRating" "RiskRating" NOT NULL DEFAULT 'MODERATE',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "locationLabel" TEXT,
    "responsibleParty" TEXT,
    "immediateAction" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "localDate" DATE NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "clientCreatedAt" TIMESTAMPTZ(3) NOT NULL,
    "submittedAt" TIMESTAMPTZ(3),
    "serverReceivedAt" TIMESTAMPTZ(3),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "gpsAccuracyM" DOUBLE PRECISION,
    "deviceId" TEXT,
    "appVersion" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findings" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "stadiumId" UUID NOT NULL,
    "tournamentId" UUID,
    "disciplineId" UUID,
    "source" "FindingSource" NOT NULL,
    "inspectionId" UUID,
    "inspectionResponseId" UUID,
    "observationId" UUID,
    "raisedById" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "localDate" DATE NOT NULL,
    "raisedAt" TIMESTAMPTZ(3) NOT NULL,
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_counters" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reference_counters_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "corrective_actions" (
    "id" UUID NOT NULL,
    "findingId" UUID NOT NULL,
    "assigneeId" UUID,
    "responsibleParty" TEXT,
    "action" TEXT NOT NULL,
    "dueDate" DATE,
    "status" "FindingStatus" NOT NULL DEFAULT 'ACTION_ASSIGNED',
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "verifiedAt" TIMESTAMPTZ(3),
    "verifiedById" UUID,
    "closureNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "corrective_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" UUID NOT NULL,
    "kind" "EvidenceKind" NOT NULL DEFAULT 'PHOTO',
    "context" "EvidenceContext" NOT NULL,
    "contextId" UUID,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "caption" TEXT,
    "checksum" TEXT,
    "capturedAt" TIMESTAMPTZ(3),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "gpsAccuracyM" DOUBLE PRECISION,
    "uploadStatus" "EvidenceUploadStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedById" UUID NOT NULL,
    "stadiumId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eod_windows" (
    "id" UUID NOT NULL,
    "stadiumId" UUID,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "eod_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eod_reports" (
    "id" UUID NOT NULL,
    "stadiumId" UUID NOT NULL,
    "tournamentId" UUID,
    "inspectorId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "totalHeadcount" INTEGER NOT NULL DEFAULT 0,
    "totalManHours" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "inspectionsCompleted" INTEGER NOT NULL DEFAULT 0,
    "observationsRaised" INTEGER NOT NULL DEFAULT 0,
    "findingsRaised" INTEGER NOT NULL DEFAULT 0,
    "findingsClosed" INTEGER NOT NULL DEFAULT 0,
    "recordableIncidents" INTEGER NOT NULL DEFAULT 0,
    "nearMisses" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "concerns" TEXT,
    "plannedTomorrow" TEXT,
    "weather" TEXT,
    "clientCreatedAt" TIMESTAMPTZ(3) NOT NULL,
    "submittedAt" TIMESTAMPTZ(3),
    "serverReceivedAt" TIMESTAMPTZ(3),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "gpsAccuracyM" DOUBLE PRECISION,
    "deviceId" TEXT,
    "appVersion" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "eod_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eod_workforce_entries" (
    "id" UUID NOT NULL,
    "eodReportId" UUID NOT NULL,
    "contractor" TEXT NOT NULL,
    "headcount" INTEGER NOT NULL DEFAULT 0,
    "manHours" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "eod_workforce_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "type" "ReportType" NOT NULL,
    "scope" "ReportScope" NOT NULL DEFAULT 'CONSOLIDATED',
    "stadiumId" UUID,
    "tournamentId" UUID NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "objectKey" TEXT,
    "fileName" TEXT,
    "sizeBytes" INTEGER,
    "pageCount" INTEGER,
    "includeAiInsights" BOOLEAN NOT NULL DEFAULT false,
    "locale" "Locale" NOT NULL DEFAULT 'en',
    "note" TEXT,
    "requestedById" UUID NOT NULL,
    "error" TEXT,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insights" (
    "id" UUID NOT NULL,
    "kind" "AiInsightKind" NOT NULL,
    "tournamentId" UUID NOT NULL,
    "stadiumId" UUID,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bullets" TEXT[],
    "severity" "Severity",
    "confidence" DECIMAL(4,3),
    "inputSnapshot" JSONB,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "reviewStatus" "AiReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "route" TEXT,
    "data" JSONB,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "actorRole" TEXT,
    "action" "AuditAction" NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "stadiumId" UUID,
    "reason" TEXT,
    "diff" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE INDEX "sessions_userId_revokedAt_idx" ON "sessions"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens"("token");

-- CreateIndex
CREATE INDEX "push_tokens_userId_idx" ON "push_tokens"("userId");

-- CreateIndex
CREATE INDEX "access_requests_status_createdAt_idx" ON "access_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "access_requests_email_idx" ON "access_requests"("email");

-- CreateIndex
CREATE INDEX "tournaments_isActive_idx" ON "tournaments"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "stadiums_code_key" ON "stadiums"("code");

-- CreateIndex
CREATE INDEX "stadiums_isActive_deletedAt_idx" ON "stadiums"("isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "stadium_assignments_stadiumId_idx" ON "stadium_assignments"("stadiumId");

-- CreateIndex
CREATE UNIQUE INDEX "disciplines_slug_key" ON "disciplines"("slug");

-- CreateIndex
CREATE INDEX "disciplines_isActive_sortOrder_idx" ON "disciplines"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "checklists_currentVersionId_key" ON "checklists"("currentVersionId");

-- CreateIndex
CREATE INDEX "checklists_isActive_deletedAt_idx" ON "checklists"("isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "checklists_disciplineId_idx" ON "checklists"("disciplineId");

-- CreateIndex
CREATE INDEX "checklist_stadiums_stadiumId_idx" ON "checklist_stadiums"("stadiumId");

-- CreateIndex
CREATE INDEX "checklist_versions_checklistId_isPublished_idx" ON "checklist_versions"("checklistId", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_versions_checklistId_version_key" ON "checklist_versions"("checklistId", "version");

-- CreateIndex
CREATE INDEX "checklist_sections_versionId_sortOrder_idx" ON "checklist_sections"("versionId", "sortOrder");

-- CreateIndex
CREATE INDEX "checklist_items_sectionId_sortOrder_idx" ON "checklist_items"("sectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "inspections_stadiumId_localDate_idx" ON "inspections"("stadiumId", "localDate");

-- CreateIndex
CREATE INDEX "inspections_inspectorId_localDate_idx" ON "inspections"("inspectorId", "localDate");

-- CreateIndex
CREATE INDEX "inspections_status_updatedAt_idx" ON "inspections"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "inspections_tournamentId_localDate_idx" ON "inspections"("tournamentId", "localDate");

-- CreateIndex
CREATE INDEX "inspection_responses_itemCode_idx" ON "inspection_responses"("itemCode");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_responses_inspectionId_itemId_key" ON "inspection_responses"("inspectionId", "itemId");

-- CreateIndex
CREATE INDEX "observations_stadiumId_localDate_idx" ON "observations"("stadiumId", "localDate");

-- CreateIndex
CREATE INDEX "observations_disciplineId_localDate_idx" ON "observations"("disciplineId", "localDate");

-- CreateIndex
CREATE INDEX "observations_inspectorId_localDate_idx" ON "observations"("inspectorId", "localDate");

-- CreateIndex
CREATE INDEX "observations_status_updatedAt_idx" ON "observations"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "findings_reference_key" ON "findings"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "findings_inspectionResponseId_key" ON "findings"("inspectionResponseId");

-- CreateIndex
CREATE UNIQUE INDEX "findings_observationId_key" ON "findings"("observationId");

-- CreateIndex
CREATE INDEX "findings_stadiumId_status_idx" ON "findings"("stadiumId", "status");

-- CreateIndex
CREATE INDEX "findings_status_severity_idx" ON "findings"("status", "severity");

-- CreateIndex
CREATE INDEX "findings_localDate_idx" ON "findings"("localDate");

-- CreateIndex
CREATE INDEX "findings_tournamentId_localDate_idx" ON "findings"("tournamentId", "localDate");

-- CreateIndex
CREATE INDEX "corrective_actions_findingId_idx" ON "corrective_actions"("findingId");

-- CreateIndex
CREATE INDEX "corrective_actions_assigneeId_status_idx" ON "corrective_actions"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "corrective_actions_status_dueDate_idx" ON "corrective_actions"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_objectKey_key" ON "evidence"("objectKey");

-- CreateIndex
CREATE INDEX "evidence_context_contextId_idx" ON "evidence"("context", "contextId");

-- CreateIndex
CREATE INDEX "evidence_uploadStatus_createdAt_idx" ON "evidence"("uploadStatus", "createdAt");

-- CreateIndex
CREATE INDEX "evidence_stadiumId_idx" ON "evidence"("stadiumId");

-- CreateIndex
CREATE INDEX "eod_windows_date_enabled_idx" ON "eod_windows"("date", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "eod_windows_stadiumId_date_key" ON "eod_windows"("stadiumId", "date");

-- CreateIndex
CREATE INDEX "eod_reports_stadiumId_date_idx" ON "eod_reports"("stadiumId", "date");

-- CreateIndex
CREATE INDEX "eod_reports_inspectorId_date_idx" ON "eod_reports"("inspectorId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "eod_reports_stadiumId_inspectorId_date_key" ON "eod_reports"("stadiumId", "inspectorId", "date");

-- CreateIndex
CREATE INDEX "eod_workforce_entries_eodReportId_sortOrder_idx" ON "eod_workforce_entries"("eodReportId", "sortOrder");

-- CreateIndex
CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "reports_tournamentId_type_idx" ON "reports"("tournamentId", "type");

-- CreateIndex
CREATE INDEX "ai_insights_tournamentId_reviewStatus_idx" ON "ai_insights"("tournamentId", "reviewStatus");

-- CreateIndex
CREATE INDEX "ai_insights_stadiumId_periodEnd_idx" ON "ai_insights"("stadiumId", "periodEnd");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stadium_assignments" ADD CONSTRAINT "stadium_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stadium_assignments" ADD CONSTRAINT "stadium_assignments_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "stadiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stadium_assignments" ADD CONSTRAINT "stadium_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "disciplines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "checklist_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_stadiums" ADD CONSTRAINT "checklist_stadiums_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_stadiums" ADD CONSTRAINT "checklist_stadiums_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "stadiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_versions" ADD CONSTRAINT "checklist_versions_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_versions" ADD CONSTRAINT "checklist_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_sections" ADD CONSTRAINT "checklist_sections_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "checklist_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "checklist_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "stadiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "checklists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_checklistVersionId_fkey" FOREIGN KEY ("checklistVersionId") REFERENCES "checklist_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_responses" ADD CONSTRAINT "inspection_responses_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_responses" ADD CONSTRAINT "inspection_responses_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "checklist_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "stadiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "disciplines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "stadiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "disciplines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_inspectionResponseId_fkey" FOREIGN KEY ("inspectionResponseId") REFERENCES "inspection_responses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "observations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "stadiums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_windows" ADD CONSTRAINT "eod_windows_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "stadiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_windows" ADD CONSTRAINT "eod_windows_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_reports" ADD CONSTRAINT "eod_reports_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "stadiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_reports" ADD CONSTRAINT "eod_reports_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_reports" ADD CONSTRAINT "eod_reports_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_workforce_entries" ADD CONSTRAINT "eod_workforce_entries_eodReportId_fkey" FOREIGN KEY ("eodReportId") REFERENCES "eod_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "stadiums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "stadiums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

