-- Create enums
CREATE TYPE "PipelineStage" AS ENUM ('NEW', 'DEEP_RESEARCH', 'LAST_STAGE', 'TRASH');
CREATE TYPE "SalesStatus" AS ENUM ('READY_TO_WORK', 'IN_PROGRESS', 'POTENTIAL_CONTRACT', 'DONE');

-- Add columns to Company
ALTER TABLE "Company" ADD COLUMN "stage" "PipelineStage" NOT NULL DEFAULT 'NEW';
ALTER TABLE "Company" ADD COLUMN "salesStatus" "SalesStatus";
ALTER TABLE "Company" ADD COLUMN "trashReason" TEXT;
ALTER TABLE "Company" ADD COLUMN "stageMovedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Index for stage + country queries
CREATE INDEX "Company_tenantId_stage_country_idx" ON "Company"("tenantId", "stage", "country");
