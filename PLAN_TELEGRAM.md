# Telegram Blocked Dates Integration Plan

**Status**: Planning Phase  
**Target**: Integrate Komohaven blocking into ai-assistant Telegram bot  
**Timeline**: ~2.5 hours (Phase 1-5)  
**Date Created**: 2026-01-27

---

## Overview

Instead of creating a separate Telegram bot for Komohaven, extend the existing ai-assistant bot (`@stamatis_claude_bot`) with new commands:

```
/ask "question"              → Qwen (existing)
/block_dates <slug> <dates>  → Komohaven (NEW)
/unblock_dates <slug> <dates> → Komohaven (NEW)
/status [slug]              → Komohaven (NEW)
```

**Architecture:**
```
Telegram Command (/block_dates blue-dream 2026-02-01 2026-02-05)
         ↓
ai-assistant/telegram-bot/bot.js (new command handler)
         ↓
komohaven worker endpoint (/api/blocked-dates/add)
         ↓
KV storage (blocked:{slug}:dates)
         ↓
Worker merges: bookings + blocks → .ics file
         ↓
Airbnb/Booking import .ics feed → dates blocked
```

---

## Phase 1: Extend ai-assistant Bot with Komohaven Commands

### Step 1.1: Add Command Router to bot.js

**File**: `~/dev/ai-assistant/telegram-bot/bot.js`

Add command detection after whitelist check, before calling Qwen:

```javascript
// After whitelist check, before calling Qwen:

if (msg.text.startsWith('/block_dates')) {
  handleBlockDates(msg);
  return; // Don't send to Qwen
}

if (msg.text.startsWith('/unblock_dates')) {
  handleUnblockDates(msg);
  return;
}

if (msg.text.startsWith('/status')) {
  handleStatus(msg);
  return;
}

// Default: send to Qwen (existing behavior)
handleQwen(msg);
```

### Step 1.2: Implement Command Handlers in bot.js

Three new functions in the same file:

```javascript
async function handleBlockDates(msg) {
  // Parse: /block_dates blue-dream 2026-02-01 2026-02-05
  // Validate dates
  // Call komohaven worker
  // Respond to Telegram
}

async function handleUnblockDates(msg) {
  // Parse: /unblock_dates blue-dream 2026-02-01 2026-02-05
  // Call komohaven worker
  // Respond to Telegram
}

async function handleStatus(msg) {
  // Optional: show current blocked + booked dates
  // Call komohaven worker
  // Respond to Telegram
}
```

### Step 1.3: Add Environment Variables to .env

**File**: `~/dev/ai-assistant/.env`

```bash
# Existing (keep as-is):
TELEGRAM_BOT_TOKEN=...
LM_STUDIO_API_URL=...
LM_STUDIO_MODEL=...
ALLOWED_USER_IDS=...

# NEW for Komohaven:
KOMOHAVEN_WORKER_URL=https://komohaven.pages.dev
KOMOHAVEN_AUTH_TOKEN=<secret-token-for-worker>
```

The auth token prevents random people from calling your worker endpoints.

### Step 1.4: Test Command Parsing

**Input to test:**
```
/block_dates blue-dream 2026-02-01 2026-02-05
/block_dates studio-9 2026-03-10 2026-03-15
/unblock_dates blue-dream 2026-02-01 2026-02-05
/status
```

**Expected parsing:**
```javascript
{
  command: 'block_dates',
  slug: 'blue-dream',
  start: '2026-02-01',
  end: '2026-02-05'
}
```

---

## Phase 2: Build Komohaven Worker Endpoints

### Step 2.1: Create `/api/blocked-dates/add` Endpoint

**Location**: `~/dev/komohaven/functions/api/blocked-dates-add.js`

**Input:**
```json
{
  "slug": "blue-dream",
  "start": "2026-02-01",
  "end": "2026-02-05",
  "token": "<KOMOHAVEN_AUTH_TOKEN>"
}
```

**Logic:**
1. Validate auth token
2. Validate slug (blue-dream or studio-9)
3. Validate dates (start < end, valid format)
4. Fetch current `blocked:{slug}:dates` from KV
5. Add new range to array
6. Merge overlapping ranges (use existing merge logic from avail-sync worker)
7. Write back to KV
8. Return merged array

**Output:**
```json
{
  "ok": true,
  "slug": "blue-dream",
  "blocked": [
    { "start": "2026-02-01", "end": "2026-02-05" },
    { "start": "2026-02-10", "end": "2026-02-15" }
  ]
}
```

### Step 2.2: Create `/api/blocked-dates/remove` Endpoint

**Location**: `~/dev/komohaven/functions/api/blocked-dates-remove.js`

**Input:**
```json
{
  "slug": "blue-dream",
  "start": "2026-02-01",
  "end": "2026-02-05",
  "token": "<KOMOHAVEN_AUTH_TOKEN>"
}
```

**Logic:**
1. Validate auth token
2. Fetch current `blocked:{slug}:dates`
3. Remove the range (subtract it from overlapping blocks)
4. Write back to KV
5. Return merged array

**Output:**
```json
{
  "ok": true,
  "slug": "blue-dream",
  "blocked": [
    { "start": "2026-02-10", "end": "2026-02-15" }
  ]
}
```

### Step 2.3: Create `/api/availability.ics` Endpoint

**Location**: `~/dev/komohaven/functions/api/availability.ics.js`

**Input:**
```
GET /api/availability.ics?slug=blue-dream
```

**Logic:**
1. Fetch `avail:{slug}:booked` (bookings from Airbnb + Booking)
2. Fetch `blocked:{slug}:dates` (your manual blocks)
3. Merge both arrays (single authoritative date ranges)
4. Convert to iCal VEVENT format
5. Return with proper headers (`Content-Type: text/calendar`)

**Output:**
```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//KomoHaven//Property Availability//EN
BEGIN:VEVENT
DTSTART:20260201
DTEND:20260205
SUMMARY:Blocked - Maintenance
TRANSP:OPAQUE
END:VEVENT
BEGIN:VEVENT
DTSTART:20260210
DTEND:20260215
SUMMARY:Booked - Guest Reservation
TRANSP:OPAQUE
END:VEVENT
END:VCALENDAR
```

### Step 2.4: Add Auth Token to Komohaven Secrets

Create a new secret in Cloudflare:

```bash
KOMOHAVEN_AUTH_TOKEN=<generate-random-string>
```

Store same value in `~/dev/ai-assistant/.env` so bot can authenticate.

---

## Phase 3: Connect Bot to Worker

### Step 3.1: Update bot.js Command Handlers

```javascript
async function handleBlockDates(msg) {
  const parsed = parseBlockCommand(msg.text); // /block_dates blue-dream 2026-02-01 2026-02-05
  
  if (!parsed) {
    bot.sendMessage(msg.chat.id, "❌ Format: /block_dates <slug> <start> <end>\nExample: /block_dates blue-dream 2026-02-01 2026-02-05");
    return;
  }
  
  try {
    bot.sendChatAction(msg.chat.id, 'typing');
    
    const response = await axios.post(
      `${process.env.KOMOHAVEN_WORKER_URL}/api/blocked-dates/add`,
      {
        slug: parsed.slug,
        start: parsed.start,
        end: parsed.end,
        token: process.env.KOMOHAVEN_AUTH_TOKEN
      }
    );
    
    if (response.data.ok) {
      const count = response.data.blocked.length;
      bot.sendMessage(msg.chat.id, `✅ Blocked ${parsed.slug} from ${parsed.start} to ${parsed.end}\n\nTotal blocked ranges: ${count}`);
    } else {
      bot.sendMessage(msg.chat.id, `❌ Error: ${response.data.error}`);
    }
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Failed to block dates: ${err.message}`);
  }
}
```

### Step 3.2: Test Each Command

**Test 1: Block dates**
```
Telegram: /block_dates blue-dream 2026-02-01 2026-02-05
Expected response: ✅ Blocked blue-dream from 2026-02-01 to 2026-02-05
Expected KV: blocked:blue-dream:dates = [{ start: "2026-02-01", end: "2026-02-05" }]
```

**Test 2: Block overlapping dates**
```
Telegram: /block_dates blue-dream 2026-02-03 2026-02-10
Expected response: ✅ Blocked blue-dream...
Expected KV: blocked:blue-dream:dates = [{ start: "2026-02-01", end: "2026-02-10" }] (merged!)
```

**Test 3: Unblock dates**
```
Telegram: /unblock_dates blue-dream 2026-02-01 2026-02-05
Expected response: ✅ Unblocked blue-dream...
Expected KV: blocked:blue-dream:dates = [] (empty)
```

**Test 4: Check iCal endpoint**
```
Curl: curl https://komohaven.pages.dev/api/availability.ics?slug=blue-dream
Expected: iCal file with merged bookings + blocks
```

---

## Phase 4: Integration Test (Full Loop)

### Step 4.1: Block dates via Telegram

```
You: /block_dates blue-dream 2026-02-01 2026-02-05
Bot: ✅ Blocked blue-dream from 2026-02-01 to 2026-02-05
```

### Step 4.2: Verify KV Updated

```bash
# Via komohaven MCP:
Claude: "Show me blocked dates for blue-dream"
→ Returns: [{ start: "2026-02-01", end: "2026-02-05" }]
```

### Step 4.3: Check iCal File

```bash
curl https://komohaven.pages.dev/api/availability.ics?slug=blue-dream
# Should contain VEVENT for 2026-02-01 to 2026-02-05
```

### Step 4.4: Import to Airbnb/Booking

1. Copy iCal URL: `https://komohaven.pages.dev/api/availability.ics?slug=blue-dream`
2. Go to Airbnb calendar settings → "Import Calendar"
3. Paste URL
4. Do same for Booking.com
5. Wait 1-6 hours
6. Check: Date range shows unavailable on both platforms

---

## Phase 5: Documentation & Deployment

### Step 5.1: Update CLAUDE.md in ai-assistant

Add Komohaven commands to documentation:

```markdown
## Komohaven Commands (NEW)

### Block Dates
/block_dates <slug> <start> <end>
Example: /block_dates blue-dream 2026-02-01 2026-02-05

### Unblock Dates
/unblock_dates <slug> <start> <end>
Example: /unblock_dates blue-dream 2026-02-01 2026-02-05

### Check Status
/status [slug]
Example: /status blue-dream
```

### Step 5.2: Update Komohaven CLAUDE.md

Add blocked dates section:

```markdown
## Blocked Dates Management

Block dates via Telegram bot:
/block_dates blue-dream 2026-02-01 2026-02-05

Blocked dates are stored in KV and merged with bookings.
iCal endpoint: /api/availability.ics?slug=blue-dream
```

### Step 5.3: Commit Changes

**ai-assistant commit:**
```
feat: Add Komohaven blocking commands

- /block_dates <slug> <start> <end>
- /unblock_dates <slug> <start> <end>
- /status [slug] (optional: show current blocks)

Calls Komohaven worker endpoints for KV operations.
Auth via KOMOHAVEN_AUTH_TOKEN.
```

**komohaven commit:**
```
feat: Add blocked dates management

- POST /api/blocked-dates/add
- POST /api/blocked-dates/remove
- GET /api/availability.ics (merged bookings + blocks)

Blocked dates stored in KV, synced to Airbnb/Booking via iCal.
```

---

## Timeline Estimate

| Phase | Task | Duration |
|-------|------|----------|
| 1 | bot.js commands | 30 min |
| 2 | worker endpoints | 60 min |
| 3 | connect bot to worker | 30 min |
| 4 | integration test | 30 min |
| 5 | documentation | 15 min |
| **Total** | | **~2.5 hours** |

---

## Key Files to Create/Modify

### ai-assistant (extend existing bot)
- `~/dev/ai-assistant/telegram-bot/bot.js` — Add command router + handlers
- `~/dev/ai-assistant/.env` — Add KOMOHAVEN_* vars
- `~/dev/ai-assistant/CLAUDE.md` — Document new commands

### komohaven (add new endpoints)
- `~/dev/komohaven/functions/api/blocked-dates-add.js` — NEW
- `~/dev/komohaven/functions/api/blocked-dates-remove.js` — NEW
- `~/dev/komohaven/functions/api/availability.ics.js` — NEW (merges booked + blocked)
- `~/dev/komohaven/CLAUDE.md` — Add blocked dates section

### Cloudflare
- Add secret: `KOMOHAVEN_AUTH_TOKEN`

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Airbnb/Booking don't honor external iCal blocks | Dates not synced | Test early (Phase 4.4); fallback to manual blocking |
| iCal format incorrect | Platforms reject feed | Validate with curl before importing |
| Auth token exposed | Security breach | Use strong random token; rotate if needed |
| Bot crashes | Commands unavailable | Add error handling + logs |
| KV merge logic broken | Overlapping blocks not merged | Reuse existing merge from avail-sync worker |

---

## Success Criteria

✅ Phase 1 complete: Bot receives `/block_dates` command  
✅ Phase 2 complete: Worker endpoints store/merge blocked dates  
✅ Phase 3 complete: Bot calls worker, receives response  
✅ Phase 4 complete: Full loop tested (Telegram → KV → iCal)  
✅ Phase 5 complete: Documented; committed to git  

**Final validation:** Import iCal to Airbnb/Booking, wait 1-6 hours, verify dates show unavailable.

---

## Next Steps

1. Review this plan
2. Approve timeline
3. Execute Phase 1 (bot.js commands)
4. Execute Phase 2 (worker endpoints)
5. Execute Phase 3-5 (integration, test, docs)

---

**Last Updated**: 2026-01-27  
**Author**: Stamatis + Claude  
**Status**: Planning → Ready for Execution
