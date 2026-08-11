-- Add immutable content snapshots to work versions.
ALTER TABLE "WorkVersion" ADD COLUMN "title" TEXT;
ALTER TABLE "WorkVersion" ADD COLUMN "type" TEXT;
ALTER TABLE "WorkVersion" ADD COLUMN "category" TEXT;
ALTER TABLE "WorkVersion" ADD COLUMN "tagsJson" TEXT;
ALTER TABLE "WorkVersion" ADD COLUMN "intro" TEXT;
ALTER TABLE "WorkVersion" ADD COLUMN "usage" TEXT;
ALTER TABLE "WorkVersion" ADD COLUMN "businessValue" TEXT;
ALTER TABLE "WorkVersion" ADD COLUMN "scene" TEXT;
ALTER TABLE "WorkVersion" ADD COLUMN "coreAbilities" TEXT;
ALTER TABLE "WorkVersion" ADD COLUMN "coverUrl" TEXT;

-- Track attachment ownership and version affinity.
ALTER TABLE "Attachment" ADD COLUMN "versionId" TEXT REFERENCES "WorkVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD COLUMN "uploaderId" TEXT;
ALTER TABLE "Attachment" ADD COLUMN "url" TEXT;
ALTER TABLE "Attachment" ADD COLUMN "storedName" TEXT;
CREATE INDEX "Attachment_versionId_idx" ON "Attachment"("versionId");

CREATE TABLE "PendingUpload" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storedName" TEXT NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "size" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PendingUpload_storedName_key" ON "PendingUpload"("storedName");
CREATE INDEX "PendingUpload_uploaderId_idx" ON "PendingUpload"("uploaderId");
CREATE INDEX "PendingUpload_createdAt_idx" ON "PendingUpload"("createdAt");

CREATE TABLE "ArchivedOperationLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "originalId" TEXT NOT NULL,
  "time" DATETIME NOT NULL,
  "operatorId" TEXT NOT NULL,
  "operatorName" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "ip" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "archivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ArchivedOperationLog_originalId_key" ON "ArchivedOperationLog"("originalId");
CREATE INDEX "ArchivedOperationLog_time_idx" ON "ArchivedOperationLog"("time");
CREATE INDEX "ArchivedOperationLog_operatorId_idx" ON "ArchivedOperationLog"("operatorId");

CREATE TABLE "RolePermission" (
  "role" TEXT NOT NULL,
  "permission" TEXT NOT NULL,
  "allowed" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" DATETIME NOT NULL,
  PRIMARY KEY ("role", "permission")
);
CREATE INDEX "RolePermission_role_idx" ON "RolePermission"("role");

-- Backfill current content into existing versions so old records remain reviewable.
UPDATE "WorkVersion"
SET "title" = (SELECT "title" FROM "Work" WHERE "Work"."id" = "WorkVersion"."workId"),
    "type" = (SELECT "type" FROM "Work" WHERE "Work"."id" = "WorkVersion"."workId"),
    "category" = (SELECT "category" FROM "Work" WHERE "Work"."id" = "WorkVersion"."workId"),
    "intro" = (SELECT "intro" FROM "Work" WHERE "Work"."id" = "WorkVersion"."workId"),
    "usage" = (SELECT "usage" FROM "Work" WHERE "Work"."id" = "WorkVersion"."workId"),
    "businessValue" = (SELECT "businessValue" FROM "Work" WHERE "Work"."id" = "WorkVersion"."workId"),
    "scene" = (SELECT "scene" FROM "Work" WHERE "Work"."id" = "WorkVersion"."workId"),
    "coreAbilities" = (SELECT "coreAbilities" FROM "Work" WHERE "Work"."id" = "WorkVersion"."workId"),
    "coverUrl" = (SELECT "coverUrl" FROM "Work" WHERE "Work"."id" = "WorkVersion"."workId");
