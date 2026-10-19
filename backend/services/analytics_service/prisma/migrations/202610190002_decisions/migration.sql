CREATE TABLE "decision_matrix" ("id" UUID NOT NULL, "project_id" UUID NOT NULL, "label" TEXT NOT NULL, "input" JSONB NOT NULL, "result" JSONB NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "decision_matrix_pkey" PRIMARY KEY ("id"));
CREATE INDEX "decision_matrix_project_id_created_at_idx" ON "decision_matrix"("project_id","created_at");
