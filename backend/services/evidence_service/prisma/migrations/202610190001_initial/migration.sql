-- CreateTable
CREATE TABLE "web_source" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "document_id" UUID NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_source_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "web_source_project_id_fetched_at_idx" ON "web_source"("project_id", "fetched_at");

