#!/usr/bin/env sh
set -eu

for migration in db/*.sql; do
  echo "Applying $migration"
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d zanifol < "$migration"
done

echo "Migrations complete."
