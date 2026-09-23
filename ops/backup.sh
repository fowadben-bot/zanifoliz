#!/usr/bin/env sh
set -eu

BACKUP_DIR=${BACKUP_DIR:-./backups}
RETENTION_DAYS=${RETENTION_DAYS:-7}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="$BACKUP_DIR/zanifol-$STAMP.dump"

mkdir -p "$BACKUP_DIR"
umask 077

echo "Creating PostgreSQL backup: $FILE"
docker compose exec -T db pg_dump -U postgres -d zanifol -Fc > "$FILE"

if [ ! -s "$FILE" ]; then
  echo "Backup failed: empty file" >&2
  rm -f "$FILE"
  exit 1
fi

find "$BACKUP_DIR" -type f -name 'zanifol-*.dump' -mtime "+$RETENTION_DAYS" -delete
chmod 600 "$FILE"
echo "Backup complete: $FILE"
