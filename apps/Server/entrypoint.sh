#!/bin/sh
set -e

# Default to migrate if DB_STRATEGY is not set
DB_STRATEGY=${DB_STRATEGY:-migrate}

echo "Executing DB strategy: $DB_STRATEGY"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$DB_STRATEGY" = "migrate" ]; then
    (cd "$SCRIPT_DIR" && pnpm run migrate)
else
    echo "Skipping migrations (DB_STRATEGY=$DB_STRATEGY)"
fi

echo "Starting application..."
exec node "$SCRIPT_DIR/dist/index.js"