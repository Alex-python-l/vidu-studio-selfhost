# 部署与运维手册

本文是 Vidu Studio 自托管版本的部署、验证、升级和回滚依据。生产实例采用香港应用节点、香港 MySQL 与新加坡 Garage 的双节点结构。

## 1. 生产拓扑

| 位置 | 组件 | 地址/路径 | 暴露方式 |
| --- | --- | --- | --- |
| 香港 | Nginx | `nltnpe.cn:443` | 公网 HTTPS |
| 香港 | Vidu Studio | `127.0.0.1:3100` | 仅 Nginx |
| 香港 | MySQL 8.4 | `127.0.0.1:3307` | 仅本机 |
| 香港 | Garage SSH 隧道 | `127.0.0.1:3900` | 仅应用 |
| 新加坡 | Garage 2.3 S3 API | `127.0.0.1:3900` | 仅 SSH 隧道 |

生产项目目录：

```text
/www/wwwroot/nltnpe.cn
```

新加坡 Garage 目录：

```text
/www/wwwroot/vidu-studio-storage
```

当前生产数据卷：`vidu-studio-mysql-data`。部署或升级时禁止使用 `docker compose down -v`。

## 2. 前置要求

- Linux x86_64 服务器。
- Docker Engine 与 Docker Compose v2。
- Nginx 与有效 TLS 证书。
- Node.js 22 仅用于不通过 Docker 的本地验证。
- 可用的 Garage/S3 Bucket、Access Key 与 Secret Key。
- 香港到新加坡的稳定 SSH 连接。
- DNS 已将 `nltnpe.cn` 与 `www.nltnpe.cn` 指向香港服务器。

## 3. 准备安全配置

复制模板：

```bash
cp .env.production.example .env
chmod 600 .env
```

必须更换模板中的所有示例值。以下四个安全密钥必须独立随机生成，不得复用：

- `SESSION_TOKEN_PEPPER`
- `ABUSE_HASH_SECRET`
- `PROVIDER_KEY_ENCRYPTION_SECRET`
- `INTERNAL_HEALTH_SECRET`

生成 32 字节十六进制值：

```bash
openssl rand -hex 32
```

`.env` 只能保存在服务器，权限应为 `0600`，不得写入镜像、日志或 Git。

## 4. Garage 与加密隧道

Garage 需要先在存储节点完成初始化、创建 Bucket 并签发一组仅用于应用的 S3 Key。生产 Bucket 名为 `vidu-studio-media`。

安全要求：

- Garage S3 API 只绑定新加坡节点 `127.0.0.1:3900`。
- Garage RPC、管理 Token 与指标 Token 不进入应用 `.env`。
- 香港节点只保存应用所需的 S3 Access Key/Secret Key。
- SSH 隧道使用独立低权限账号和独立密钥，禁止远程 Shell、PTY 和额外端口转发。

香港节点的 systemd 隧道应等价于：

```ini
[Unit]
Description=Vidu Studio encrypted tunnel to object storage
After=network-online.target
Wants=network-online.target

[Service]
User=root
ExecStart=/usr/bin/ssh -NT \
  -i /root/.ssh/vidu_storage_tunnel \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -L 127.0.0.1:3900:127.0.0.1:3900 \
  vidu-tunnel@STORAGE_SERVER_IP
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

验证：

```bash
systemctl is-active vidu-storage-tunnel.service
ss -lntp 'sport = :3900'
```

未携带 S3 签名直接请求端口时返回 `403` 是预期行为。

## 5. 首次启动 MySQL 与应用

创建命名数据卷：

```bash
docker volume create vidu-studio-mysql-data
```

启动：

```bash
cd /www/wwwroot/nltnpe.cn
docker compose --env-file .env up -d --build
docker compose --env-file .env ps
```

MySQL 首次创建空数据卷时会按顺序执行：

```text
deploy/mysql/init/001-schema.sql
deploy/mysql/init/002-seed-admin.sql
```

初始化 SQL 只会在空数据目录执行。已有数据卷升级必须使用单独审核过的前向迁移，不能依赖重新启动初始化脚本。

验证数据库：

```bash
./deploy/check-mysql.sh /www/wwwroot/nltnpe.cn
```

期望至少看到 15 张表、`video_tasks_release_active_slot` 触发器和活动管理员记录。

## 6. Nginx

参考配置位于 `deploy/nginx/nltnpe.cn.proxy.conf.example`。核心要求：

- 上游为 `http://127.0.0.1:3100`。
- `client_max_body_size` 至少为 `55m`。
- 必须覆盖 `Host`、`X-Forwarded-Host`、`X-Forwarded-Proto`。
- 关闭请求缓冲，以支持分块媒体上传。
- 配置变更前备份原文件，先 `nginx -t`，成功后再 reload。

示例：

```bash
/www/server/nginx/sbin/nginx -t
/www/server/nginx/sbin/nginx -s reload
```

缺少 `X-Forwarded-Host` 或 `X-Forwarded-Proto` 会导致 HTTPS 下的登录、上传和管理员写操作被同源校验拒绝为 403。

## 7. 健康检查

公开浅层检查只验证应用与数据库：

```bash
curl -fsS https://nltnpe.cn/api/health
```

期望：

```json
{"status":"ok","database":"ok"}
```

深度检查验证登录 POST、限流记录、MySQL 和 Garage 的写入/读取/删除：

```bash
./deploy/check-app.sh /www/wwwroot/nltnpe.cn https://nltnpe.cn
```

期望包括：

```text
password_probe=401
deep_health=200
{"status":"ok","database":"ok","storage":"ok"}
```

还应检查：

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' https://nltnpe.cn/
curl -fsS -o /dev/null -w '%{http_code}\n' https://nltnpe.cn/login
curl -fsS https://nltnpe.cn/api/auth/session
```

主页和登录页应返回 200，匿名会话应返回 `authenticated: false`。

## 8. 管理员初始化与 Provider Key

数据库会预置管理员账户记录，但不会写入明文密码。首次使用可通过受控恢复窗口创建一次性访问口令：

1. 确认 `ADMIN_EMAILS` 只包含批准的管理员邮箱。
2. 临时配置新的 `ADMIN_RECOVERY_SECRET`，重启应用。
3. 打开 `/api/auth/password/recovery`，创建一次性访问口令。
4. 使用访问口令完成密码初始化并确认管理员页面可用。
5. 立即从 `.env` 删除 `ADMIN_RECOVERY_SECRET` 并重启应用。

Vidu 与 Gemini Key 可以写入服务器 `.env`，也可以在管理员页面录入。后台录入时必须配置 `PROVIDER_KEY_ENCRYPTION_SECRET`，数据库只保存 AES-GCM 密文和非敏感提示信息。

## 9. 升级

升级前：

```bash
cd /www/wwwroot/nltnpe.cn
docker compose --env-file .env ps
./deploy/check-mysql.sh
./deploy/check-app.sh
```

推荐使用并行候选目录：

```text
/www/wwwroot/nltnpe.cn.next
```

流程：

1. 将候选版本放入 `.next`，复制生产 `.env` 并设为 `0600`。
2. 运行 `docker compose build app`，完成生产构建。
3. 审核数据库迁移；MySQL 结构变更必须先备份并单独执行。
4. 备份当前站点目录和 Nginx 配置。
5. 停止旧 Compose 项目但保留命名数据卷。
6. 原子交换目录后执行 `docker compose --env-file .env up -d`。
7. 先验证 `127.0.0.1:3100`，再 reload Nginx。
8. 运行完整公网深度检查。

已有数据卷需要先执行尚未应用的前向迁移。例如，修复管理员录入服务 Key
的内部编号长度：

```bash
docker compose --env-file .env exec -T mysql sh -lc \
  'MYSQL_PWD="$MYSQL_PASSWORD" mysql -uvidu_studio vidu_studio' \
  < deploy/mysql/migrations/001-provider-key-id-length.sql
```

如果只更新应用代码：

```bash
docker compose --env-file .env build app
docker compose --env-file .env up -d app
```

## 10. 备份

至少备份：

- MySQL 逻辑备份与数据卷快照。
- `/www/wwwroot/nltnpe.cn/.env` 的加密离线副本。
- Nginx vhost 和代理 include。
- 新加坡 Garage 的 metadata 与 data 目录。
- Garage 配置、应用 S3 Key 映射以及 SSH 隧道配置。

MySQL 逻辑备份示例：

```bash
set -a
. ./.env
set +a
docker exec -e MYSQL_PWD="$MYSQL_PASSWORD" vidu-studio-mysql \
  mysqldump -uvidu_studio --single-transaction --routines --triggers vidu_studio \
  > /secure-backup/vidu_studio.sql
```

备份文件包含用户和审计数据，必须加密并限制权限。

## 11. 回滚

应用回滚不得回滚或删除 MySQL 数据卷：

1. 确认上一版本代码兼容当前数据库结构。
2. 备份当前 Nginx 配置和当前代码目录。
3. 恢复上一版本目录或镜像。
4. `docker compose up -d`，验证本机健康。
5. `nginx -t` 后 reload。
6. 运行公网浅层和深度检查。

如果新版本包含不向后兼容的数据库变更，不要直接回滚应用；应先发布兼容修复或按经过验证的数据库恢复计划处理。

## 12. 故障排查

| 现象 | 常见原因 | 检查 |
| --- | --- | --- |
| 公网 502 | Nginx 仍指向旧端口或应用未监听 | `nginx -T`、`ss -lntp`、应用日志 |
| 登录 POST 403 | 代理未设置 Forwarded Host/Proto | 检查 Nginx 示例中的三组 Host 头 |
| 数据库 503 | MySQL 未健康、密码错误或结构缺失 | `docker compose ps`、`check-mysql.sh` |
| 深度健康 503 | Garage 隧道、S3 Key 或 Bucket 异常 | systemd 隧道状态、Garage 日志 |
| 上传 413 | Nginx Body 上限过低或文件超过 50 MB | `client_max_body_size 55m` |
| Provider Key 不可用 | Key 未配置、别名已删除或加密根密钥变化 | 管理后台只读可用性检查 |
| 全部会话失效 | `SESSION_TOKEN_PEPPER` 被更换 | 恢复原值或要求用户重新登录 |

日志中不得输出数据库密码、Garage 密钥、Provider Key、会话 Token、访问口令或完整媒体地址。

## 13. 当前生产记录

- 域名：`nltnpe.cn`、`www.nltnpe.cn`
- 应用目录：`/www/wwwroot/nltnpe.cn`
- 管理员邮箱：`k994772392@qq.com`
- MySQL：`vidu-studio-mysql`，命名卷 `vidu-studio-mysql-data`
- 应用：`vidu-studio-app`，镜像 `vidu-studio-app:latest`
- Garage Bucket：`vidu-studio-media`
- Garage 隧道服务：`vidu-storage-tunnel.service`
- 首次自托管切换：2026-07-30 至 2026-07-31

生产 Secret 的具体值不记录在本文或 Git 中。
