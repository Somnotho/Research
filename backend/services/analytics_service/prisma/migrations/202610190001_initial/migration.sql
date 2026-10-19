-- CreateTable
CREATE TABLE "scenario" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scenario_project_id_idx" ON "scenario"("project_id");

