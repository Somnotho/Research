-- CreateTable
CREATE TABLE "document" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "characters" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_project_id_idx" ON "document"("project_id");

