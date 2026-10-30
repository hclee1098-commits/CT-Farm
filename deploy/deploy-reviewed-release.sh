#!/bin/sh
# 서버 전용 고정 진입점. 관리자 관리 파일만 읽습니다.
set -eu
umask 077
manifest=${1:?release.json 경로 필요}
case "$manifest" in /*) ;; *) echo '절대 경로만 허용'; exit 1;; esac
cd /srv/secure-starter/app
set -a
. /etc/secure-starter/server.env
set +a
export DEPLOY_ENV_FILE=/etc/secure-starter/server.env
mkdir -p .starter-state/incoming
incoming=$(mktemp -d .starter-state/incoming/release.XXXXXX)
trap 'rm -rf "$incoming"' EXIT HUP INT TERM
cp "$manifest" "$incoming/release.json"
for suffix in staging approval; do
  if [ -f "$manifest.$suffix.json" ]; then cp "$manifest.$suffix.json" "$incoming/release.json.$suffix.json"; fi
done
node tools/deployment/release.mjs deploy "$incoming/release.json"
if [ "$APP_ENV" = STAGING ]; then cp "$incoming/release.json.staging.json" "$manifest.staging.json"; fi
