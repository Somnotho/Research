-- CreateTable
CREATE TABLE "experiment" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "experiment_project_id_created_at_idx" ON "experiment"("project_id", "created_at");

