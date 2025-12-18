# Compare KV vs availability.json

Verify the transition from static availability.json to KV-backed system by comparing reservations across both sources for the next 30 days.

## Your Task

1. **Fetch KV Data**
   - Query the KV-backed availability endpoints for both properties
   - Extract the booked ranges from the API responses
   - Format as: `[{ start: "YYYY-MM-DD", end: "YYYY-MM-DD" }, ...]`

2. **Read Static File**
   - Load `availability/availability.json`
   - Extract booked ranges for both properties
   - Note the "updated" timestamp

3. **Date Range Analysis**
   - Focus on bookings from today (2025-12-18) through 2026-01-17 (30-day window)
   - Identify overlapping vs. diverging ranges
   - Note any gaps or additional bookings in KV

4. **Per-Property Comparison**
   For each property (blue-dream, studio-9):
   - Create a side-by-side comparison table:
     ```
     | Date Range | KV State | Static File | Match? |
     |------------|----------|-------------|--------|
     | 2025-12-15 to 2025-12-20 | ✓ | ✓ | ✓ |
     | 2025-12-25 to 2025-12-29 | ✓ | ✓ | ✓ |
     ```
   - Highlight any mismatches (indicates static file is outdated)

5. **Check Sync Status**
   - Query `avail:{slug}:sync_status` from KV
   - Verify `ok: true` and `changed: false` (stable state between syncs)
   - Check `feeds.airbnb.ok` and `feeds.booking.ok` (both sources healthy?)

6. **Summary Report**
   - Total bookings in KV vs static file
   - Status: "✓ Transition Ready" (KV and static match) OR "⚠ Static Outdated" (expected during transition)
   - Recommendation: Safe to retire static pipeline when status is stable for 24+ hours

## Key Endpoints
- KV Read: `GET /api/availability?slug={slug}&kv_avail=1`
- Static Read: `availability/availability.json`

## Interpretation
- **Match (✓)**: Both sources show same bookings → system consistent
- **KV Ahead**: KV has newer bookings → static file stale (normal during cron gaps)
- **KV Behind**: Static file has bookings KV lacks → sync error, investigate
- **Sync Status = "unchanged"**: No new bookings since last sync → stable state

## Next Steps
- Run this command daily for 3-5 days during transition
- If all comparisons are stable, retire the static `availability.json` git pipeline
- Frontend can fully switch to KV-backed system (`?kv_avail=1`)
