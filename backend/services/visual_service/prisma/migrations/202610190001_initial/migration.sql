-- CreateTable
CREATE TABLE "visual_asset" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT,
    "kind" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visual_asset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visual_asset_project_id_idx" ON "visual_asset"("project_id");

-- CreateIndex
CREATE INDEX "visual_asset_state_created_at_idx" ON "visual_asset"("state", "created_at");

