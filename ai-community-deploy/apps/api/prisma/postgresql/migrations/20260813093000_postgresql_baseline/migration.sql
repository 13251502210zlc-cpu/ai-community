-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "avatarColor" TEXT NOT NULL DEFAULT '#2563eb',
    "avatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "wecomUserId" TEXT,
    "employeeId" TEXT,
    "loginMethod" TEXT NOT NULL DEFAULT 'wecom',
    "accountStatus" TEXT NOT NULL DEFAULT 'active',
    "loginAccount" TEXT,
    "password" TEXT,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "role" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role","permission")
);

-- CreateTable
CREATE TABLE "BusinessDomain" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Work" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unpublished',
    "currentVersion" TEXT,
    "coverUrl" TEXT,
    "usage" TEXT NOT NULL DEFAULT '',
    "businessValue" TEXT,
    "scene" TEXT,
    "coreAbilities" TEXT,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "favorites" INTEGER NOT NULL DEFAULT 0,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkVersion" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "changelog" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "current" BOOLEAN NOT NULL DEFAULT false,
    "candidate" BOOLEAN NOT NULL DEFAULT false,
    "changelogAuthor" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewerId" TEXT,
    "rejectReason" TEXT,
    "baseVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT,
    "type" TEXT,
    "category" TEXT,
    "tagsJson" TEXT,
    "intro" TEXT,
    "usage" TEXT,
    "businessValue" TEXT,
    "scene" TEXT,
    "coreAbilities" TEXT,
    "coverUrl" TEXT,

    CONSTRAINT "WorkVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "versionId" TEXT,
    "uploaderId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "storedName" TEXT,
    "size" TEXT NOT NULL DEFAULT '0 KB',
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingUpload" (
    "id" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "avatarColor" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewEvent" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "workTitle" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reviewerId" TEXT,
    "reason" TEXT,
    "isFirstVersion" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationLog" (
    "id" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchivedOperationLog" (
    "id" TEXT NOT NULL,
    "originalId" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
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
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchivedOperationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLike" (
    "userId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,

    CONSTRAINT "UserLike_pkey" PRIMARY KEY ("userId","workId")
);

-- CreateTable
CREATE TABLE "UserFavorite" (
    "userId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,

    CONSTRAINT "UserFavorite_pkey" PRIMARY KEY ("userId","workId")
);

-- CreateTable
CREATE TABLE "_TagToWork" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "User_employeeId_idx" ON "User"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "User_wecomUserId_key" ON "User"("wecomUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_loginAccount_key" ON "User"("loginAccount");

-- CreateIndex
CREATE INDEX "UserRole_userId_idx" ON "UserRole"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_role_key" ON "UserRole"("userId", "role");

-- CreateIndex
CREATE INDEX "RolePermission_role_idx" ON "RolePermission"("role");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDomain_name_key" ON "BusinessDomain"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "Work_status_idx" ON "Work"("status");

-- CreateIndex
CREATE INDEX "Work_type_idx" ON "Work"("type");

-- CreateIndex
CREATE INDEX "Work_authorId_idx" ON "Work"("authorId");

-- CreateIndex
CREATE INDEX "WorkVersion_workId_idx" ON "WorkVersion"("workId");

-- CreateIndex
CREATE INDEX "WorkVersion_status_idx" ON "WorkVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkVersion_workId_version_key" ON "WorkVersion"("workId", "version");

-- CreateIndex
CREATE INDEX "Attachment_workId_idx" ON "Attachment"("workId");

-- CreateIndex
CREATE INDEX "Attachment_versionId_idx" ON "Attachment"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingUpload_storedName_key" ON "PendingUpload"("storedName");

-- CreateIndex
CREATE INDEX "PendingUpload_uploaderId_idx" ON "PendingUpload"("uploaderId");

-- CreateIndex
CREATE INDEX "PendingUpload_createdAt_idx" ON "PendingUpload"("createdAt");

-- CreateIndex
CREATE INDEX "Comment_workId_idx" ON "Comment"("workId");

-- CreateIndex
CREATE INDEX "ReviewEvent_workId_idx" ON "ReviewEvent"("workId");

-- CreateIndex
CREATE INDEX "ReviewEvent_status_idx" ON "ReviewEvent"("status");

-- CreateIndex
CREATE INDEX "OperationLog_time_idx" ON "OperationLog"("time");

-- CreateIndex
CREATE INDEX "OperationLog_operatorId_idx" ON "OperationLog"("operatorId");

-- CreateIndex
CREATE INDEX "OperationLog_module_idx" ON "OperationLog"("module");

-- CreateIndex
CREATE UNIQUE INDEX "ArchivedOperationLog_originalId_key" ON "ArchivedOperationLog"("originalId");

-- CreateIndex
CREATE INDEX "ArchivedOperationLog_time_idx" ON "ArchivedOperationLog"("time");

-- CreateIndex
CREATE INDEX "ArchivedOperationLog_operatorId_idx" ON "ArchivedOperationLog"("operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "_TagToWork_AB_unique" ON "_TagToWork"("A", "B");

-- CreateIndex
CREATE INDEX "_TagToWork_B_index" ON "_TagToWork"("B");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_category_fkey" FOREIGN KEY ("category") REFERENCES "BusinessDomain"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkVersion" ADD CONSTRAINT "WorkVersion_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkVersion" ADD CONSTRAINT "WorkVersion_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "WorkVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLike" ADD CONSTRAINT "UserLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLike" ADD CONSTRAINT "UserLike_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TagToWork" ADD CONSTRAINT "_TagToWork_A_fkey" FOREIGN KEY ("A") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TagToWork" ADD CONSTRAINT "_TagToWork_B_fkey" FOREIGN KEY ("B") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

