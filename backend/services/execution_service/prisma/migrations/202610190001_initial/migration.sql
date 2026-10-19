-- CreateTable
CREATE TABLE "code_test" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "input" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "code_test_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "code_test_project_id_created_at_idx" ON "code_test"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "code_test_state_created_at_idx" ON "code_test"("state", "created_at");

