#!/bin/sh
set -e

# Ensure data directory exists and has full read/write permissions
mkdir -p /app/data
chmod 777 /app/data 2>/dev/null || true

exec /usr/bin/dumb-init -- /app/backend "$@"
