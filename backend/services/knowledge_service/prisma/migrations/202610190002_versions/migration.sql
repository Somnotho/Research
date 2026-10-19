ALTER TABLE "document" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "content_hash" TEXT NOT NULL DEFAULT '',
ADD COLUMN "original" BYTEA,
ADD COLUMN "mime_type" TEXT NOT NULL DEFAULT 'application/octet-stream';
