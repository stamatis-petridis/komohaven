#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../../availability/.env"

echo "== Add iCal URLs to Cloudflare secrets (from $ENV_FILE) =="
echo

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ .env file not found at $ENV_FILE"
  exit 1
fi

# Parse .env and extract all iCal URLs in sorted order
declare -a SECRETS
while IFS='=' read -r key value; do
  # Skip comments and empty lines
  [[ "$key" =~ ^#.* ]] && continue
  [[ -z "$key" ]] && continue

  # Extract property and source from key (e.g., BLUE_DREAM_ICAL_URL_AIRBNB)
  if [[ "$key" =~ ^([A-Z_]+)_ICAL_URL_([A-Z_]+)$ ]]; then
    SECRET_NAME="$key"

    # Extract URL from value (handle quoted strings)
    URL=$(echo "$value" | sed 's/^"//; s/"$//')

    # Only add if URL is non-empty
    if [[ -n "$URL" ]]; then
      SECRETS+=("$SECRET_NAME|$URL")
    fi
  fi
done < "$ENV_FILE"

# Sort for deterministic order
IFS=$'\n' SECRETS=($(sort <<<"${SECRETS[*]}"))
unset IFS

# Add each secret
for SECRET_PAIR in "${SECRETS[@]}"; do
  SECRET_NAME="${SECRET_PAIR%|*}"
  URL="${SECRET_PAIR#*|}"

  echo "Adding $SECRET_NAME..."
  printf "%s" "$URL" | npx wrangler secret put "$SECRET_NAME"
  echo "✅ $SECRET_NAME uploaded"
  echo
done

echo "== All secrets added successfully =="
