#!/usr/bin/env bash
# ==============================================================================
# SQLite Automated Safe Backup Script for Homelab Server
# Uses SQLite Online Backup API (atomic, zero locking interruption)
# Keeps rolling 30-day backups with automatic purge of older snapshots
# ==============================================================================

set -euo pipefail

# Configuration: Default paths relative to stack folder
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DB_FILE="${1:-${STACK_DIR}/dockge/data/portfolio.db}"
BACKUP_DIR="${2:-${STACK_DIR}/dockge/data/backups}"
RETENTION_DAYS="${3:-30}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/portfolio_backup_${TIMESTAMP}.db"

echo "=== [$(date +"%Y-%m-%d %H:%M:%S")] Starting SQLite Backup ==="

# Check source database exists
if [ ! -f "$DB_FILE" ]; then
    echo "[!] Error: SQLite database file not found at: ${DB_FILE}"
    exit 1
fi

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

# Execute atomic online backup
if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "${DB_FILE}" ".backup '${BACKUP_FILE}'"
else
    # Fallback to Python standard library sqlite3 if sqlite3 CLI is not installed on host
    python3 -c "
import sqlite3, sys
src = sqlite3.connect(sys.argv[1])
dst = sqlite3.connect(sys.argv[2])
with dst:
    src.backup(dst)
dst.close()
src.close()
" "${DB_FILE}" "${BACKUP_FILE}"
fi

chmod 600 "${BACKUP_FILE}"
FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[✓] Backup created successfully: ${BACKUP_FILE} (${FILE_SIZE})"

# Purge backups older than retention days
echo "[*] Purging snapshots older than ${RETENTION_DAYS} days..."
PURGED_COUNT=$(find "${BACKUP_DIR}" -name "portfolio_backup_*.db" -type f -mtime +"${RETENTION_DAYS}" | wc -l)
if [ "${PURGED_COUNT}" -gt 0 ]; then
    find "${BACKUP_DIR}" -name "portfolio_backup_*.db" -type f -mtime +"${RETENTION_DAYS}" -exec rm -f {} +
    echo "[✓] Purged ${PURGED_COUNT} old backup snapshot(s)."
else
    echo "[i] Zero expired snapshots found."
fi

echo "=== Backup completed successfully ==="
