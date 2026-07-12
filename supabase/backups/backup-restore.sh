#!/usr/bin/env bash
# File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/supabase/backups/backup-restore.sh
# Description: Backup / restore helper for the FalaMadeira Supabase database. Subcommands:
#                dump                          - full backup of the live project -> new snapshot dir
#                restore-full  <dir> <target>  - full restore (roles + custom dump) into <target>
#                reset-appdata <dir> <target>  - truncate public tables + reload public data (post-test reset)
#                verify-local  <dir>           - containerized restore test (needs Docker)
#              Source password is read from repo .env.local (SUPABASE_DB_PASSWORD). Restore/reset
#              targets are passed explicitly as a libpq conninfo string and require confirmation.
# Author: assistant (for Libor Ballaty)
# Created: 2026-07-12

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUPS_DIR="${REPO_ROOT}/supabase/backups"
export PATH="/opt/homebrew/opt/libpq/bin:${PATH}"

PROJECT_REF="gxlrmdfqcqimwwplrdgd"
SRC_HOST="db.${PROJECT_REF}.supabase.co"
SRC_CONN="host=${SRC_HOST} port=5432 dbname=postgres user=postgres sslmode=require"

# All public app tables (for reset-appdata TRUNCATE). Keep in sync with the schema.
PUBLIC_TABLES="content_packs global_settings lesson_corrections lesson_requests lessons logs \
mastery_items missions_log profiles pronunciation_attempts situations tickets tracks \
user_situation_progress user_track_selection video_suggestions writing_submissions"

die() { echo "ERROR: $*" >&2; exit 1; }

load_src_password() {
  local envf="${REPO_ROOT}/.env.local"
  [ -f "$envf" ] || die "missing ${envf} (needs SUPABASE_DB_PASSWORD)"
  local pw
  pw="$(grep -E '^SUPABASE_DB_PASSWORD=' "$envf" | head -1 | cut -d= -f2- | tr -d '"'"'"'')"
  [ -n "$pw" ] || die "SUPABASE_DB_PASSWORD not set in .env.local"
  echo "$pw"
}

confirm() {
  echo "$1"
  read -r -p "Type 'yes' to proceed: " ans
  [ "$ans" = "yes" ] || die "aborted by user"
}

cmd_dump() {
  local ts dir
  ts="$(date +%Y-%m-%d_%H%M%S)"
  dir="${BACKUPS_DIR}/${ts}"
  mkdir -p "$dir"
  export PGPASSWORD="$(load_src_password)"
  echo "=== dumping ${PROJECT_REF} -> ${dir} ==="
  pg_dump -d "$SRC_CONN" -Fc -f "$dir/full-database.dump"           || die "custom dump failed"
  pg_dump -d "$SRC_CONN" -Fp -f "$dir/full-database.sql"            || die "plain dump failed"
  pg_dump -d "$SRC_CONN" -Fp --schema=public -f "$dir/public-schema-and-data.sql" || die "public dump failed"
  pg_dumpall -d "$SRC_CONN" --roles-only -f "$dir/roles.sql"        || echo "WARN: roles dump returned non-zero (check roles.sql)"
  echo "=== integrity check (expand custom archive) ==="
  pg_restore -f /dev/null "$dir/full-database.dump" && echo "archive OK (all data blocks readable)" || die "archive integrity check FAILED"
  echo "=== done. Files: ==="; ls -lah "$dir"
  echo "NOTE: write a MANIFEST.md in ${dir} recording the row-count baseline."
}

cmd_restore_full() {
  local dir="$1" target="$2"
  [ -d "$dir" ] || die "snapshot dir not found: $dir"
  [ -f "$dir/full-database.dump" ] || die "missing full-database.dump in $dir"
  confirm ">>> FULL RESTORE into: ${target}
    This applies roles.sql then pg_restore --clean --if-exists the ENTIRE database.
    It will DROP and recreate objects on the target. Do NOT run against prod unless intended."
  echo "=== [1/2] roles ==="
  psql "$target" -v ON_ERROR_STOP=0 -f "$dir/roles.sql"
  echo "=== [2/2] full database ==="
  pg_restore -d "$target" --clean --if-exists --no-comments "$dir/full-database.dump"
  echo "=== restore finished (review notices/errors above) ==="
}

cmd_reset_appdata() {
  local dir="$1" target="$2"
  [ -d "$dir" ] || die "snapshot dir not found: $dir"
  [ -f "$dir/full-database.dump" ] || die "missing full-database.dump in $dir"
  local tlist="" t
  for t in $PUBLIC_TABLES; do tlist="${tlist}${tlist:+, }public.${t}"; done
  confirm ">>> RESET APP DATA on: ${target}
    TRUNCATE ${tlist}
    then reload public data from the snapshot. ALL public rows written since the snapshot are LOST."
  echo "=== truncating public app tables ==="
  psql "$target" -v ON_ERROR_STOP=1 -c "TRUNCATE ${tlist} RESTART IDENTITY CASCADE;" || die "truncate failed"
  echo "=== reloading public data (data-only, triggers disabled) ==="
  pg_restore -d "$target" --data-only --schema=public --disable-triggers "$dir/full-database.dump"
  echo "=== reset finished. Verify row counts against MANIFEST.md ==="
}

cmd_verify_local() {
  local dir="$1"
  [ -d "$dir" ] || die "snapshot dir not found: $dir"
  command -v docker >/dev/null 2>&1 || die "docker not found"
  local name="fm_restore_verify_$$"
  local port=55432
  echo "=== starting throwaway postgres:17 (container ${name}, port ${port}) ==="
  echo "NOTE: vanilla postgres lacks the supabase_vault extension — expect a small number of"
  echo "      vault-related ERRORs. public/auth/storage data + row counts are the real signal."
  docker run -d --name "$name" -e POSTGRES_PASSWORD=postgres -p "${port}:5432" postgres:17 >/dev/null \
    || die "docker run failed (is it permitted in this environment?)"
  # shellcheck disable=SC2064
  trap "docker rm -f '$name' >/dev/null 2>&1 || true" EXIT
  local i; for i in $(seq 1 30); do docker exec "$name" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
  local T="host=127.0.0.1 port=${port} dbname=postgres user=postgres"
  PGPASSWORD=postgres psql "$T" -q -f "$dir/roles.sql" >/tmp/fm_verify_roles.log 2>&1
  PGPASSWORD=postgres psql "$T" -v ON_ERROR_STOP=0 -f "$dir/full-database.sql" >/tmp/fm_verify_restore.log 2>&1
  echo "restore ERROR count: $(grep -c 'ERROR' /tmp/fm_verify_restore.log)"
  echo "=== restored row counts (compare to MANIFEST baseline) ==="
  PGPASSWORD=postgres psql "$T" -tAc \
    "select 'public.situations='||count(*) from public.situations
     union all select 'auth.users='||count(*) from auth.users
     union all select 'public.tracks='||count(*) from public.tracks
     union all select 'public.content_packs='||count(*) from public.content_packs;" 2>&1
  echo "(container ${name} will be removed on exit)"
}

usage() {
  sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# //; s/^#//'
}

main() {
  local sub="${1:-}"; shift || true
  case "$sub" in
    dump)          cmd_dump "$@" ;;
    restore-full)  [ $# -eq 2 ] || die "usage: restore-full <snapshot-dir> <target-conninfo>"; cmd_restore_full "$@" ;;
    reset-appdata) [ $# -eq 2 ] || die "usage: reset-appdata <snapshot-dir> <target-conninfo>"; cmd_reset_appdata "$@" ;;
    verify-local)  [ $# -eq 1 ] || die "usage: verify-local <snapshot-dir>"; cmd_verify_local "$@" ;;
    *)             usage; exit 2 ;;
  esac
}

main "$@"
