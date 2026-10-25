#!/usr/bin/env bash
# Daily refresh for Bangkok Event Calendar. Meant for cron, e.g.:
#   15 4 * * * /home/dev/projects/bangkokeventcalendar/scripts/cron-daily.sh
# Runs `npm run jobs:daily` and appends timestamped output to logs/jobs.log.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || exit 1
export PATH="/home/dev/node/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
fi
export JOB_TRIGGERED_BY="cron"

mkdir -p logs
LOG="logs/jobs.log"
{
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) jobs:daily start ==="
  npm run --silent jobs:daily 2>&1 | while IFS= read -r line; do
    printf '%s %s\n' "$(date -u +%H:%M:%S)" "$line"
  done
  status=${PIPESTATUS[0]}
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) jobs:daily exit=$status ==="
  exit "$status"
} >>"$LOG" 2>&1
