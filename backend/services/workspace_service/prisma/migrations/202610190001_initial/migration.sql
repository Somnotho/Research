-- CreateTable
CREATE TABLE "project" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

