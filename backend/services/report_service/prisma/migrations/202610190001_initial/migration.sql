-- CreateTable
CREATE TABLE "report" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "report_run_id_key" ON "report"("run_id");

-- CreateIndex
CREATE INDEX "report_project_id_idx" ON "report"("project_id");

