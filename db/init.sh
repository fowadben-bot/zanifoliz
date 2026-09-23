#!/usr/bin/env sh
set -eu

if [ -z "${APP_DB_PASSWORD:-}" ]; then
  echo "APP_DB_PASSWORD is required" >&2
  exit 1
fi

escaped_password=$(printf "%s" "$APP_DB_PASSWORD" | sed "s/'/''/g")
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='zanifol_app') THEN
    CREATE ROLE zanifol_app LOGIN PASSWORD '$escaped_password';
  ELSE
    ALTER ROLE zanifol_app WITH PASSWORD '$escaped_password';
  END IF;
END
\$\$;
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f /opt/zanifol-db/001_init.sql

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO zanifol_app;
GRANT USAGE ON SCHEMA public TO zanifol_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO zanifol_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO zanifol_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO zanifol_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO zanifol_app;
SQL
