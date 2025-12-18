# Availability Transition Guide

## Overview

This directory contains tooling for the transition from the **static git-based pipeline** (`availability.json` + GitHub Actions cron) to the **KV-backed system** (Cloudflare Workers scheduled cron).

### Why Transition?

- **Git Churn**: Far-future blocked dates on Airbnb/Booking rotate asynchronously, causing ~1/3 of commits to be timestamp-only noise
- **Real-time Availability**: KV provides instant booking state without waiting for 30-min GitHub Actions runs
- **Scalability**: Easier to add new properties/feeds without git workflow changes
- **Multi-feed Merge**: Both Airbnb + Booking feeds now merged into single canonical source

## Monitoring the Transition

### Daily Checks

Run the comparison script to verify both systems agree:

```bash
# Compare 30-day booking window (default)
python3 availability/compare_availability.py

# Compare specific property
python3 availability/compare_availability.py --property blue-dream

# Compare shorter window
python3 availability/compare_availability.py --days 7

# Save report to file
python3 availability/compare_availability.py --save report_2025-12-18.txt

# Run silently, just output report
python3 availability/compare_availability.py --quiet
```

### What the Script Does

1. **Fetches Live KV Data** — Queries the deployed API for current KV state
2. **Loads Static File** — Reads `availability.json` (last auto-update from GitHub Actions)
3. **Compares 30-Day Window** — Checks if next 30 days of bookings match between KV and static file
4. **Reports Status** — Flags any divergence or confirms transition readiness

### Expected Output

**Good ✓:**
```
STATUS: ✓ TRANSITION READY
  Critical booking window matches on all properties.
  Far-future divergence is intentional (platform quirks).
  KV system is safe to use as primary source.
```

**Warning ⚠:**
```
STATUS: ⚠ DIVERGENCE DETECTED
  Mismatch in critical booking window. Investigate:
  1. Has the worker synced since static file was updated?
  2. Check worker logs: npx wrangler tail avail-sync
  3. Verify KV connectivity: curl komohaven.pages.dev/api/avail-health
```

## Timeline

**Phase 1: Parallel Operation (Now)**
- Both systems running independently
- KV worker syncs every 15 minutes (*/15 * * * *)
- Static pipeline runs every 30 minutes (GitHub Actions)
- Use `compare_availability.py` daily to verify alignment

**Phase 2: Frontend Switchover (24–48 hours)**
- Frontend fully uses `?kv_avail=1` (KV-backed system)
- Verify no user-facing issues
- Keep static file in place as fallback

**Phase 3: Retire Static Pipeline (48–72 hours)**
- Disable `availability.yml` GitHub Actions workflow
- Archive the static pipeline helpers
- Keep `availability.json` in git as reference (read-only)

## Debugging

### Worker Not Syncing?

```bash
# Watch worker logs
npx wrangler tail avail-sync --follow

# Check health endpoint
curl https://komohaven.pages.dev/api/avail-health | python3 -m json.tool

# Manual trigger (if available)
gh workflow run deploy-avail-sync.yml --ref lean
```

### KV Data Stale?

1. Check last sync timestamp: `curl https://komohaven.pages.dev/api/availability?slug=blue-dream&kv_avail=1 | jq .last_sync`
2. Verify feeds are accessible (check worker logs for 4xx/5xx errors)
3. Confirm KV namespace is properly bound in `wrangler.toml`

### Static File Out of Sync?

This is **expected and intentional** during transition:
- KV contains full state (including far-future blocks from Airbnb/Booking)
- Static file omits far-future to reduce git churn
- Both systems agree on the critical 30-day booking window

## Reference

### KV Schema

- `avail:{slug}:booked` — Array of `[{ start: "YYYY-MM-DD", end: "YYYY-MM-DD" }]` (half-open)
- `avail:{slug}:last_sync` — ISO timestamp of last successful sync
- `avail:{slug}:sync_status` — Metadata: `{ ok, ts, message, source, booking_hash, changed, feeds: {...} }`

### API Endpoints

- `GET /api/availability?slug={slug}&kv_avail=1` — KV-backed availability (primary)
- `GET /api/availability?slug={slug}` — Static file fallback (legacy)
- `GET /api/avail-health` — KV connectivity test

### Scripts

- `build_availability_json.py` — Build static file from iCal URLs (legacy, still useful for testing)
- `compare_availability.py` — Compare KV vs static file (transition monitoring)
- `push_availability.sh` — Full pipeline: fetch → build → commit → push (legacy)
- `add_icals.sh` — Upload iCal URLs to Cloudflare secrets
- `verify_icals.sh` — List iCal URLs from Cloudflare

## Notes

- The comparison script requires internet access to fetch live KV data
- Worker runs in production (`lean` branch); manual testing uses deployment API
- Far-future date divergence is normal and intentional (platform quirks, not booking changes)
- Safe to run comparison script multiple times—no side effects
