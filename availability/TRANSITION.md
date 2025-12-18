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

The script now has two modes:

**Mode 1: Verify Worker Sync (RECOMMENDED)**
```bash
# Fetches live iCals, merges both feeds, compares against KV
python3 availability/compare_availability.py

# This is the ground-truth test. If status is "✓ SYNC VERIFIED",
# the worker is correctly merging Airbnb + Booking bookings.
```

**Mode 2: Compare Static JSON (legacy)**
```bash
# Compares git-committed availability.json vs KV
python3 availability/compare_availability.py --compare-json

# Expected result: ⚠ SYNC DIVERGENCE
# (far-future blocks in KV but omitted from git—intentional)
```

**Additional options (work with both modes):**
```bash
# Single property
python3 availability/compare_availability.py --property blue-dream

# Custom window (default is 210 days)
python3 availability/compare_availability.py --days 30

# Save report to file
python3 availability/compare_availability.py --save report_2025-12-18.txt

# Suppress progress messages
python3 availability/compare_availability.py --quiet
```

### What the Script Does (Mode 1: Default)

1. **Discovers iCal URLs** — Reads `.env` for Airbnb + Booking feed URLs
2. **Fetches Live Feeds** — Downloads current bookings from both platforms
3. **Parses & Merges** — Parses iCal events, merges overlapping ranges
4. **Fetches KV State** — Gets current bookings from deployed KV storage
5. **Compares 210-Day Window** — Verifies merged iCals match KV state
6. **Reports Status** — "✓ SYNC VERIFIED" if worker synced correctly

### Expected Output

**Mode 1: Default (Live iCals) — Good ✓:**
```
STATUS: ✓ SYNC VERIFIED
  Worker correctly synced live icals (airbnb + booking) feeds.
  All bookings match between source and KV storage.
```
→ Means: Worker is syncing both iCal feeds correctly into KV.

**Mode 1: Default (Live iCals) — Warning ⚠:**
```
STATUS: ⚠ SYNC DIVERGENCE
  Mismatch between source and KV. Investigate:
  1. Check worker logs: npx wrangler tail avail-sync
  2. Verify feed URLs are correct in Cloudflare secrets
  3. Test KV connectivity: curl komohaven.pages.dev/api/avail-health
```
→ Means: Worker didn't sync feeds correctly. Debug immediately.

**Mode 2: --compare-json — Expected:**
```
STATUS: ⚠ SYNC DIVERGENCE
  Mismatch between source and KV.
  (far-future blocks in KV but omitted from git—intentional)
```
→ Means: Static JSON is stale. This is expected and OK. Use Mode 1 instead.

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
