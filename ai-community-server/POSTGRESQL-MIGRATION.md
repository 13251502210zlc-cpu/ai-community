# PostgreSQL 旁路改造说明

PostgreSQL 改造当前处于“代码就绪、默认不启用”状态，目的是允许现有 SQLite 线上环境继续发布其他功能。

## 隔离边界

- 默认运行模型：`prisma/schema.prisma`，仍为 SQLite；
- 默认迁移：`prisma/migrations`，仍为原 SQLite 迁移链；
- PostgreSQL 模型：`prisma/postgresql/schema.prisma`；
- PostgreSQL 迁移：`prisma/postgresql/migrations`；
- 普通的 `npm run build`、`npm run prisma:generate`、`npm run prisma:migrate:deploy` 以及当前 Linux 安装脚本均不会切换数据库；
- PostgreSQL 操作必须使用带 `postgres:` 前缀的命令显式执行。

因此，在正式切库前部署其他功能迭代，不要修改线上 `DATABASE_URL`，也不要执行任何 `postgres:*` 命令。

## 旁路验证 PostgreSQL

在独立的测试数据库环境中配置 PostgreSQL `DATABASE_URL`，然后执行：

```bash
npm run postgres:generate
npm run postgres:migrate:deploy
```

这些命令使用独立 Schema 和迁移目录，不改默认 SQLite 文件。

## SQLite 历史数据迁移演练

配置：

```env
DATABASE_URL="postgresql://user:password@host:5432/aicommunity_test?schema=public"
LEGACY_SQLITE_DATABASE_URL="file:./prisma/dev.db"
```

在独立测试库完成建表后执行：

```bash
npm run postgres:data:migrate
```

迁移工具会检查目标库为空，并在一个事务中复制业务数据；失败整体回滚，SQLite 源文件不变。附件文件本体不在数据库迁移范围内，继续由 COS 或原文件存储处理。

## 正式切换前置条件

正式切换需要单独发布窗口，至少完成：

1. 数据库账号认证和建表权限验证；
2. 独立测试库迁移与接口回归；
3. 线上 SQLite 完整备份；
4. 短暂停写并执行最终增量/全量迁移；
5. 将默认 Prisma Client 与安装流程切到 PostgreSQL；
6. 所有实例使用相同 `DATABASE_URL`、`AUTH_SECRET` 和 COS 存储；
7. 验证后再开放流量，并保留明确回滚窗口。

在第 5 步代码合并之前，当前发布包继续使用 SQLite，不会因仓库中存在 PostgreSQL 旁路文件而自动切库。
