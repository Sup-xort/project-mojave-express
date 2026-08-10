#!/usr/bin/env bash
# plan.md 9절: SQLite 백업 크론. sqlite3 CLI의 .backup 명령은 실행 중인 WAL DB에 대해서도 안전하다.
set -euo pipefail

DB_PATH="${DB_PATH:-/opt/mojave-express/data/app.db}"
BACKUP_DIR="${BACKUP_DIR:-/backup}"
KEEP_DAYS="${KEEP_DAYS:-7}"

mkdir -p "$BACKUP_DIR"
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/app-$(date +%F).db'"
find "$BACKUP_DIR" -name 'app-*.db' -mtime "+$KEEP_DAYS" -delete
