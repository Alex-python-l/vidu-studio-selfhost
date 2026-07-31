#!/bin/sh
set -eu

project_dir=${1:-/www/wwwroot/nltnpe.cn}
base_url=${2:-http://127.0.0.1:3100}
cd "$project_dir"
set -a
. ./.env
set +a

status=$(
  curl -sS \
    -o /tmp/vidu-password-probe.json \
    -w '%{http_code}' \
    -H "Origin: $base_url" \
    -H 'Content-Type: application/json' \
    --data '{"email":"k994772392@qq.com","password":"definitely-wrong-password"}' \
    "$base_url/api/auth/password"
)
printf 'password_probe=%s\n' "$status"
if [ "$status" != 401 ]; then
  head -c 300 /tmp/vidu-password-probe.json
  printf '\n'
  exit 1
fi

rate_rows=$(
  docker exec \
    -e MYSQL_PWD="$MYSQL_PASSWORD" \
    vidu-studio-mysql \
    mysql -N -uvidu_studio vidu_studio \
    -e 'SELECT COUNT(*) FROM rate_limit_buckets;'
)
printf 'rate_rows=%s\n' "$rate_rows"

health_status=$(
  curl -sS \
    -o /tmp/vidu-health-probe.json \
    -w '%{http_code}' \
    -X POST \
    -H "x-internal-health-secret: $INTERNAL_HEALTH_SECRET" \
    "$base_url/api/health"
)
printf 'deep_health=%s\n' "$health_status"
cat /tmp/vidu-health-probe.json
printf '\n'
if [ "$health_status" != 200 ]; then
  exit 1
fi
