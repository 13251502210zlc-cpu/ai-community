-- CreateTable: OperationLog（操作日志后端持久化）
CREATE TABLE "OperationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "OperationLog_time_idx" ON "OperationLog"("time");

-- CreateIndex
CREATE INDEX "OperationLog_operatorId_idx" ON "OperationLog"("operatorId");

-- CreateIndex
CREATE INDEX "OperationLog_module_idx" ON "OperationLog"("module");
