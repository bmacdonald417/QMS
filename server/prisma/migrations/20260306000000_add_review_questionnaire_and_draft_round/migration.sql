-- AlterTable
ALTER TABLE "documents" ADD COLUMN "draft_round" INTEGER;

-- AlterTable
ALTER TABLE "document_assignments" ADD COLUMN "review_responses" JSONB;
