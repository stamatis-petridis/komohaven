#!/usr/bin/env bash
set -euo pipefail

# Ensure commands run from repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

echo "Installing/updating availability dependencies..."
pip install -r availability/requirements.txt

echo "Building availability JSON from live feeds..."
python availability/build_availability_json.py

echo "Committing updated availability feed..."
git add availability/availability.json
git commit -m "chore: update availability feeds"

echo "Pushing changes to origin..."
git push

echo "Availability update complete."
