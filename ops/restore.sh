#!/usr/bin/env sh
set -eu

FILE=${1:-}
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: RESTORE_CONFIRM=YES ./ops/restore.sh backups/zanifol-YYYYMMDDTHHMMSSZ.dump" >&2
  exit 2
fi
if [ "${RESTORE_CONFIRM:-}" != "YES" ]; then
  echo "Restore cancelled. Set RESTORE_CONFIRM=YES to confirm destructive restore." >&2
  exit 3
fi

echo "Stopping API before restore..."
docker compose stop api
trap 'docker compose start api >/dev/null 2>&1 || true' EXIT

echo "Restoring $FILE..."
docker compose exec -T db pg_restore -U postgres -d zanifol --clean --if-exists --no-owner < "$FILE"

echo "Restore complete. Starting API..."
docker compose start api
trap - EXIT
