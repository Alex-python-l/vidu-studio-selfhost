#!/bin/sh
set -eu

project_dir=${1:-/www/wwwroot/nltnpe.cn}
cd "$project_dir"
set -a
. ./.env
set +a

docker exec \
  -e MYSQL_PWD="$MYSQL_PASSWORD" \
  vidu-studio-mysql \
  mysql -N -uvidu_studio vidu_studio -e '
    SELECT CONCAT("tables=", COUNT(*))
      FROM information_schema.tables
      WHERE table_schema = DATABASE();
    SELECT CONCAT("trigger=", COUNT(*))
      FROM information_schema.triggers
      WHERE trigger_schema = DATABASE()
        AND trigger_name = "video_tasks_release_active_slot";
    SELECT CONCAT("admin=", email, " role=", role, " status=", status)
      FROM users
      WHERE email = "k994772392@qq.com";
  '
