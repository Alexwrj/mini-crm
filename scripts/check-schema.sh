#!/usr/bin/env bash
set -euo pipefail

# Creates a private cluster, never connects to any existing local/cloud database.
# Requires initdb, pg_ctl and psql from the same PostgreSQL installation in PATH.
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for command_name in initdb pg_ctl psql; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing PostgreSQL command: $command_name" >&2
    exit 1
  fi
done

# Keep the Unix socket path short enough for macOS and Linux.
cluster_dir="$(mktemp -d /tmp/crm-db.XXXXXX)"
cleanup() {
  if [[ -f "$cluster_dir/data/postmaster.pid" ]]; then
    if ! pg_ctl -D "$cluster_dir/data" -m immediate -w stop >/dev/null; then
      echo "Could not stop test PostgreSQL. Preserved $cluster_dir" >&2
      return 1
    fi
  fi
  rm -rf -- "$cluster_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

initdb -D "$cluster_dir/data" --auth=trust --no-locale --encoding=UTF8 >"$cluster_dir/initdb.log"
# Socket only: no TCP listener, no persistent service, no existing database touched.
pg_ctl -D "$cluster_dir/data" -l "$cluster_dir/server.log" \
  -o "-h '' -k '$cluster_dir' -p 55432" -w start

db_user="$(id -un)"
psql_args=(-X -v ON_ERROR_STOP=1 -h "$cluster_dir" -p 55432 -U "$db_user" -d postgres)
psql "${psql_args[@]}" -c 'select version();'
psql "${psql_args[@]}" -f "$project_dir/supabase/tests/stage2-bootstrap.sql"
for migration in "$project_dir"/supabase/migrations/*.sql; do
  psql "${psql_args[@]}" -f "$migration"
done
psql "${psql_args[@]}" -f "$project_dir/supabase/tests/stage2-schema.sql"
echo 'Stage 2 SQL checks passed. Disposable cluster will be removed.'
