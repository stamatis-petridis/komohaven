# Komohaven: Dashboard as Source of Truth

## Current State
- Airbnb, Booking, and Komohaven sync independently
- No central control
- Risk of conflicts and lost data

## Goal
Dashboard becomes the single source of truth:
```
Airbnb ─┐
        ├─→ Komohaven (hub) ─┬─→ Airbnb
Booking ┘                    └─→ Booking
```

All data flows through the dashboard. You decide what's blocked/available.

---

## Implementation Plan (5 Phases)

### Phase 1: Upgrade iCal Endpoint ✅ CURRENT
**Status:** Partially done
**What we have:**
- `/api/availability.ics?slug=studio-9` exports merged booked + blocked dates
- Already can be imported into Airbnb/Booking

**What's needed:**
- Separate iCal export for **blocked dates only** (for your reference)
- Separate iCal export for **booked dates only** (optional)
- Query params to filter: `?blocked-only=1` or `?booked-only=1`

**Why:** You need flexibility to export what platforms need

---

### Phase 2: Disable Direct Platform Sync ❌ TODO
**Manual step (outside of code)**

**For Airbnb:**
1. Go to Calendar settings
2. Remove Booking.com calendar import URL (if exists)
3. Remove any other platform syncs

**For Booking.com:**
1. Go to Calendar settings
2. Remove Airbnb calendar import URL (if exists)
3. Remove any other platform syncs

**Why:** Stop conflicting syncs. Only Komohaven imports should be active.

---

### Phase 3: Set Up iCal Imports in Platforms ❌ TODO
**Manual step (your mum does this)**

**For Airbnb:**
1. Settings → Calendar → Import Calendar
2. Paste: `https://komohaven.pages.dev/api/availability.ics?slug=studio-9`
3. Save
4. Verify it syncs (check if unavailable dates appear in 1-6 hours)

**For Booking.com:**
1. Calendar → Import/Export
2. Paste same URL
3. Save
4. Verify sync

**Note:** Both platforms will auto-refresh every 6 hours.

**Why:** This creates the outbound sync (Komohaven → platforms)

---

### Phase 4: Verify Bidirectional Flow ❌ TODO
**Test workflow:**

1. **Inbound (Platform → Dashboard):**
   - Book a date in Airbnb
   - Check dashboard: does it show up as booked?
   - ✅ Already works (avail-sync worker pulls every 15 min)

2. **Outbound (Dashboard → Platforms):**
   - Block a date in dashboard
   - Check iCal: does it include the block?
   - Wait 1-6 hours
   - Check Airbnb/Booking: does it show unavailable?

3. **Cross-platform (Booking → Komohaven → Airbnb):**
   - Book date in Booking.com
   - Check dashboard: shows as booked?
   - Check Airbnb calendar: shows as unavailable after sync?
   - ✅ Tests that data flows all the way through

---

### Phase 5: Documentation & Handoff to Your Mum ❌ TODO
**Create simple guide:**
- How to block dates in dashboard
- What the colors mean
- How to verify platforms updated
- Troubleshooting (if sync is slow)

**Why:** Your mum needs to understand the system she's using

---

## Current Architecture Review

### What's Working ✅
1. **Inbound:** 
   - `/api/availability` fetches booked dates from both platforms via iCal feeds
   - Updates KV every 15 minutes
   - Dashboard reads from KV

2. **Manual Blocking:**
   - Dashboard allows blocking dates (stored in KV)
   - `/api/blocked-dates/add` and `/remove` work
   - Colors show source (red=Airbnb, blue=Booking, green=your blocks)

3. **iCal Export:**
   - `/api/availability.ics` merges booked + blocked
   - Can be imported into platforms
   - Auto-refreshes every 6 hours on platforms

### What Needs Upgrade 🔧

#### 1. Enhanced iCal Endpoint (Easy)
**Current:** `/api/availability.ics?slug=studio-9` → merged dates

**Upgrade to:**
```
GET /api/availability.ics?slug=studio-9
  → All unavailable (booked + blocked)

GET /api/availability.ics?slug=studio-9&blocked-only=1
  → Only your manual blocks (for reference)

GET /api/availability.ics?slug=studio-9&booked-only=1
  → Only platform bookings (optional)
```

**Implementation:** Add query param handling to `availability.ics.js`

#### 2. Source Tracking in iCal (Medium)
**Current:** All events say "Unavailable" (generic)

**Upgrade to:**
```
SUMMARY:Booked (Airbnb)
or
SUMMARY:Booked (Booking.com)
or
SUMMARY:Blocked (Manual)
```

**Why:** Your mum can see at a glance which source each unavailable date came from

**Implementation:** 
- Add `source` field to booked dates in KV
- Pass source through to iCal generation
- Update SUMMARY field based on source

#### 3. Separate Admin iCal Export (Optional)
**Current:** Only one iCal export (`availability.ics`)

**Add:** Admin-only endpoint
```
GET /api/admin/ical/blocked?slug=studio-9
  → Only your manual blocks (admin reference)
```

**Why:** Your mum might want to see JUST her blocks for auditing

---

## Recommended Implementation Order

### Priority 1 (This session) 🔥
1. Upgrade iCal to support query params (blocked-only, booked-only)
2. Test exports in calendar app
3. Add source tracking to SUMMARY field

### Priority 2 (Next session)
1. Create setup guide for your mum
2. Manually disable Airbnb ↔ Booking sync
3. Import iCal into both platforms
4. Do end-to-end test

### Priority 3 (Later, if needed)
1. Add admin-only export endpoints
2. Add webhook to auto-sync without 6-hour lag (optional)
3. Add email notifications when platforms sync

---

## Data Flow After Implementation

```
INBOUND (Every 15 min):
Airbnb iCal feed → Worker → KV (booked:blue-dream)
Booking iCal feed → Worker → KV (booked:blue-dream)

DASHBOARD:
You see: booked dates (from both) + your blocks
You manage: only your blocks
You export: iCal with all unavailable dates

OUTBOUND (Every 6 hours - platforms refresh):
KV (booked + blocked) → /api/availability.ics
Airbnb imports iCal → calendar updated
Booking imports iCal → calendar updated

RESULT:
Single source of truth: Your Dashboard
All platforms stay in sync
No direct platform-to-platform sync
```

---

## Files to Modify

### Phase 1 (iCal Upgrade)
- `functions/api/availability.ics.js` - Add query params + source tracking

### Phase 2-3 (Manual)
- No code changes (configuration in platforms)

### Phase 4 (Testing)
- Manual verification only

### Phase 5 (Documentation)
- Create `ADMIN_GUIDE.md` for your mum

---

## Success Criteria

✅ Dashboard shows booked dates from both Airbnb + Booking
✅ Dashboard allows you to block/unblock dates
✅ Blocked dates appear in iCal export
✅ iCal imports successfully into Airbnb
✅ iCal imports successfully into Booking
✅ Platforms show unavailable dates within 6 hours
✅ No direct Airbnb ↔ Booking sync active
✅ Your mum can manage everything from one dashboard

