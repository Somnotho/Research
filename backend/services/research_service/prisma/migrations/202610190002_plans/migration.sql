ALTER TABLE "research_run" ADD COLUMN "plan" JSONB, ADD COLUMN "limits" JSONB, ADD COLUMN "usage" JSONB, ADD COLUMN "cancel_requested" BOOLEAN NOT NULL DEFAULT false;
