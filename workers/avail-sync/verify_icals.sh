#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../../availability/.env"

echo "== iCal URLs from .env =="
echo "(Cloudflare secrets are write-only, cannot be retrieved for verification)"
echo

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ .env file not found at $ENV_FILE"
  exit 1
fi

# Parse .env and extract all iCal URLs
while IFS='=' read -r key value; do
  # Skip comments and empty lines
  [[ "$key" =~ ^#.* ]] && continue
  [[ -z "$key" ]] && continue

  # Extract property and source from key (e.g., BLUE_DREAM_ICAL_URL_AIRBNB)
  if [[ "$key" =~ ^([A-Z_]+)_ICAL_URL_([A-Z_]+)$ ]]; then
    SECRET_NAME="$key"

    # Extract URL from value (handle quoted strings)
    URL=$(echo "$value" | sed 's/^"//; s/"$//')

    # Only list if URL is non-empty
    if [[ -n "$URL" ]]; then
      echo "$SECRET_NAME:"
      echo "  $URL"
      echo
    fi
  fi
done < "$ENV_FILE"
