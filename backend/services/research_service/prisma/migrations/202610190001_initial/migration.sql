-- CreateTable
CREATE TABLE "message" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_run" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "web_enabled" BOOLEAN NOT NULL DEFAULT false,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "evidence" JSONB,
    "answer" TEXT,
    "report_id" UUID,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "research_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_step" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "agent" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_step_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_project_id_created_at_idx" ON "message"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "research_run_project_id_idx" ON "research_run"("project_id");

-- CreateIndex
CREATE INDEX "research_run_state_created_at_idx" ON "research_run"("state", "created_at");

-- CreateIndex
CREATE INDEX "research_step_run_id_created_at_idx" ON "research_step"("run_id", "created_at");

