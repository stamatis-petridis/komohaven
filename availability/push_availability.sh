#!/usr/bin/env bash
set -euo pipefail

# Ensure commands run from repo root (script now lives in availability/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

echo "Installing/updating availability dependencies..."
python3 -m pip install -r availability/requirements.txt

echo "Building availability JSON from live feeds..."
python3 availability/build_availability_json.py

echo "Committing updated availability feed..."
git add availability/availability.json
git commit -m "chore: update availability feeds"

echo "Pushing changes to origin..."
git push

echo "Availability update complete."
