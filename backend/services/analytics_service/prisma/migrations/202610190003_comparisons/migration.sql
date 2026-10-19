CREATE TABLE "improvement_comparison" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "improvement_comparison_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "improvement_comparison_project_id_created_at_idx" ON "improvement_comparison"("project_id", "created_at");
