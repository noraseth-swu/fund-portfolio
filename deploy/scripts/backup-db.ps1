# ==============================================================================
# SQLite Automated Safe Backup Script (PowerShell for Windows)
# ==============================================================================

param (
    [string]$DbPath = "$PSScriptRoot\..\dockge\data\portfolio.db",
    [string]$BackupDir = "$PSScriptRoot\..\dockge\data\backups",
    [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"

Write-Host "=== [$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting SQLite Backup ==="

if (-not (Test-Path $DbPath)) {
    Write-Error "[!] Error: SQLite database file not found at: $DbPath"
    exit 1
}

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = Join-Path $BackupDir "portfolio_backup_${Timestamp}.db"

# Execute safe backup using python standard library
python -c @"
import sqlite3, sys
src = sqlite3.connect(sys.argv[1])
dst = sqlite3.connect(sys.argv[2])
with dst:
    src.backup(dst)
dst.close()
src.close()
"@ "$DbPath" "$BackupFile"

$FileSize = (Get-Item $BackupFile).Length / 1MB
Write-Host ("[✓] Backup created successfully: {0} ({1:N2} MB)" -f $BackupFile, $FileSize)

# Clean up snapshots older than $RetentionDays
$ThresholdDate = (Get-Date).AddDays(-$RetentionDays)
$OldBackups = Get-ChildItem -Path $BackupDir -Filter "portfolio_backup_*.db" | Where-Object { $_.LastWriteTime -lt $ThresholdDate }

if ($OldBackups) {
    $OldBackups | Remove-Item -Force
    Write-Host ("[✓] Purged {0} old backup snapshot(s)." -f $OldBackups.Count)
} else {
    Write-Host "[i] Zero expired snapshots found."
}

Write-Host "=== Backup completed successfully ==="
