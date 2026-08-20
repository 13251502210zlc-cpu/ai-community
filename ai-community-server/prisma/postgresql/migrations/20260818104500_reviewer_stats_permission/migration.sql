INSERT INTO "RolePermission" ("role", "permission", "allowed", "updatedAt")
VALUES ('reviewer', 'admin:stats', TRUE, CURRENT_TIMESTAMP)
ON CONFLICT ("role", "permission") DO UPDATE
SET "allowed" = TRUE,
    "updatedAt" = CURRENT_TIMESTAMP;
