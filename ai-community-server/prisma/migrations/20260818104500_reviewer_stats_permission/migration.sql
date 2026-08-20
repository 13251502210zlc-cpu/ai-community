INSERT INTO "RolePermission" ("role", "permission", "allowed", "updatedAt")
VALUES ('reviewer', 'admin:stats', 1, CURRENT_TIMESTAMP)
ON CONFLICT ("role", "permission") DO UPDATE
SET "allowed" = 1,
    "updatedAt" = CURRENT_TIMESTAMP;
