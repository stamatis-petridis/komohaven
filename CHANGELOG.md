# Changelog

All notable changes to KomoHaven rental platform are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### In Progress
- Phase 2.5: Extend `/api/availability` to return `last_sync` and `status` metadata
- Phase 3: Retire static pipeline (disable GitHub Actions cron, keep file as reference)

---

## [Phase 2] - 2025-12-28 - KV as Default Availability Source

### Added
- **Frontend source resolver** (`resolveAvailabilitySource()`): Decides KV-first vs legacy file per page load
- **Query parameter override**: `?legacy_avail=1` forces static file fallback (useful for emergency debugging)
- **Explicit source logging**: `[avail] source_select { slug, mode, reason }` shows routing decision

### Changed
- **Default behavior inverted**: KV is now the primary source; static file is fallback
- Removed global `USE_KV` flag (was module-load-time decision, now per-request)
- Simplified `fetchAvailabilityWithKV()`: removed internal flag check (now only does KV attempt + fallback)

### Verified (Production)
- ✅ Both properties (blue-dream, studio-9) resolve to KV by default
- ✅ Legacy escape hatch (`?legacy_avail=1`) works correctly
- ✅ Calendar dates match across both sources (KV vs file)
- ✅ KV data verified fresh via `wrangler kv key get`
- ✅ No user-facing errors, clean fallback on KV failure

### Notes
- Phase 1 (10 days of ✓ SYNC VERIFIED) preceded this change
- Static file (`availability.json`) remains in git as fallback reference
- Phase 2.5 planned: extend API with `last_sync` metadata for UI visibility

---

## [Phase 4] - 2025-12-18 - Multi-Feed Availability Sync

### Added
- **Multi-feed merge architecture**: Worker now fetches and merges both Airbnb and Booking iCal feeds into single canonical `avail:{slug}:booked` KV entry
- **Dual-hash deduplication system**:
  - `booking_hash` (SHA256 of normalized ranges) for change detection
  - `feed_hash` (SHA256 of combined feed metadata) for observability
  - Skips KV writes when availability unchanged despite feed metadata churn
- **Per-feed observability**: `sync_status.feeds` object tracks success/error for each source
- **Resilient multi-source handling**: Fails property only if all feeds fail; marks as "partial" if some feeds fail
- **GitHub Actions auto-deploy**: Workflow triggers on push to `lean` for files under `workers/avail-sync/`; uses Node.js 20 + Wrangler
- **Helper scripts**:
  - `add_icals.sh`: Deterministically upload all iCal URLs from `.env` to Cloudflare secrets
  - `verify_icals.sh`: List and verify iCal URLs

### Fixed
- **Retry semantics**: Fail-fast on non-retryable HTTP 4xx errors; only retry on network errors, 429 (rate limit), and 5xx
- **Fetch timeout handling**: Guaranteed cleanup of AbortController + setTimeout; backoff array [0, 250, 750]ms
- **CI/CD**: Require Node.js 20 for Wrangler (v4.55+); previous Node.js 18 caused deployment failures

### Changed
- Moved from single-source (Airbnb only) to merged availability from both platforms
- `sync_status.source` now stable string `"airbnb+booking"` instead of per-feed

---

## [Phase 2b] - 2025-12-15 to 2025-12-17 - Stripe Checkout & KV Availability

### Added
- **KV-backed availability storage**:
  - `avail:{slug}:booked` (array of half-open date ranges)
  - `avail:{slug}:last_sync` (ISO timestamp of last sync)
  - `avail:{slug}:sync_status` (sync status with metadata)
- **Availability read API** (`/api/availability`): Dual-read with feature flag
  - `?kv_avail=1` prioritizes KV storage
  - Falls back to static `availability.json` if KV unavailable
- **Frontend dual-read logic**: JavaScript detects flag, logs source (KV vs file)
- **Cache headers**: Availability endpoint returns 1-hour cache directive
- **Health check endpoint** (`/api/avail-health`): Simple KV read/write test
- **Stripe integration**:
  - Checkout page with date range selection + guest count
  - Stripe Checkout flow with phone + name collection
  - Success/cancel redirect pages
  - Webhook storage for booking records
- **Telegram notifications**: Stripe checkout success → Telegram alert
- **Payment success/cancel pages**: Confirmation and return-to-home links

### Fixed
- Payment webhook validation: Fail loud on bad signature, never return 500 after verification
- Studio-9 slug mapping deduplication in payment logic

### Changed
- Availability now computed from iCal feeds (Airbnb only at this phase)
- Booking intent flow: Select dates → Reserve button → Stripe Checkout

---

## [Phase 2a] - 2025-12-15 - Config Consolidation & Payments Foundation

### Added
- Centralized configuration in `config.js`:
  - Contact info (phone, WhatsApp, email)
  - Map links per property
  - Per-property pricing and minimum nights
- Pricing calculator: Emits availability events with night count
- Price display in booking CTA summary

### Fixed
- Removed hardcoded property contact forms
- Centralized map and contact link handling via `data-*` attributes

---

## [Phase 1b] - 2025-10-21 to 2025-12-14 - Availability System Phase 1

### Added
- **Static availability system**:
  - `availability/build_availability_json.py` fetches iCal feeds → JSON
  - `availability.js` ES module calendar widget
  - GitHub Actions workflow: Auto-update every 30 minutes
- **Logical diff detection**: Workflow compares against last committed version, ignoring `.updated` timestamp
  - Only commits when booking data actually changes
- **Push helper script**: `availability/push_availability.sh` automates fetch-build-commit-push
- **Interactive date selection**: Clickable calendar → WhatsApp inquiry
- **Accessibility**: Keyboard navigation for date picker

### Fixed
- Trimmed far-future bookings from feeds (Oct 28)

### Changed
- Moved availability workflow to lean branch only
- Auto-update now intelligent (logical diff, not timestamp-based)

---

## [Phase 1a] - 2025-10-15 to 2025-10-23 - Gallery, Maps & UI Polish

### Added
- **Gallery lightbox overlay**: Click images → modal carousel
- **Interactive map**: Leaflet.js map embed with property markers
- **Deep-linking**: Google Maps coordinates + business profile links per property
- **Gallery images**: Optimized JPEGs (1.jpeg, 2.jpeg, 3.jpeg, 4.jpeg per property)
- **Region headers in script.js**: Organized code flow for maintainability

### Fixed
- Image optimization: Removed large originals, kept optimized versions
- Hero image preload and responsive sizing
- Tel link normalization

### Changed
- Property pages now include photo galleries with lightbox
- Centralized map initialization logic

---

## [Phase 0] - 2025-08-10 to 2025-10-14 - i18n & Initial Site Launch

### Added
- **Multilingual site**: English (index.html), Greek (index-gr.html), Turkish (index-tr.html), Bulgarian (index-bg.html)
- **Language switcher**: Flag-based navigation between 4 language variants
- **Hreflang metadata**: Proper SEO for multilingual content
- **Property pages**: Blue Dream and Studio 9 with individual gallery sections
- **Contact links**: Centralized phone, WhatsApp, email in config
- **Hero image**: Full-width banner (hero.jpg, 1600px optimized)
- **Responsive design**: Mobile-first CSS with flexbox layout
- **Privacy & terms pages**: Legal compliance pages

### Fixed
- Relative asset and property links (no hardcoded absolute paths)
- Contact form removed in favor of pre-filled inquiry links

### Known Issues (Early Phase)
- Initial deployment to Cloudflare Pages
- Manual availability updates

---

## Architecture Timeline

```
Aug 2025      Phase 0: Base site + i18n
Oct 2025      Phase 1a: Gallery, maps, UI polish
Oct 2025      Phase 1b: Static availability (Python + GA workflow)
Dec 15 2025   Phase 2a: Config consolidation, pricing
Dec 15-16     Phase 2b: KV storage, Stripe checkout
Dec 17-18     Phase 4: Multi-feed sync worker + GitHub Actions deploy
Dec 18-28     Phase 1: Parallel verification (10 days ✓ SYNC VERIFIED)
Dec 28 2025   Phase 2 (Final): Frontend KV-first, file fallback via ?legacy_avail=1
```

---

## Deployment Notes

### Current Stack (lean branch)
- **Frontend**: Cloudflare Pages (auto-deploy on push)
- **Availability**: Scheduled Cloudflare Worker (avail-sync, runs every 15 min)
- **Storage**: Cloudflare KV for availability + checkout records
- **Payments**: Stripe Checkout integration
- **Notifications**: Telegram bot for payment alerts
- **CI/CD**: GitHub Actions for worker deployment

### iCal Sources
- Airbnb: `BLUE_DREAM_ICAL_URL_AIRBNB`, `STUDIO_9_ICAL_URL_AIRBNB`
- Booking.com: `BLUE_DREAM_ICAL_URL_BOOKING`, `STUDIO_9_ICAL_URL_BOOKING`
- All stored as Cloudflare secrets (not committed)

### Key Endpoints
- `/api/avail-health` - KV connectivity test
- `/api/availability?slug=blue-dream&kv_avail=1` - Availability read (KV-first)
- `/reserve` - Checkout intent page
- `/success` - Payment success confirmation
- `/cancel` - Payment cancellation

---

## Development Workflow

**Refresh availability manually:**
```bash
./availability/push_availability.sh
```

**Deploy worker changes:**
```bash
cd workers/avail-sync
npx wrangler deploy
```

**Watch worker logs:**
```bash
npx wrangler tail avail-sync
```

**Add iCal URLs to secrets:**
```bash
workers/avail-sync/add_icals.sh
```

---

## Known Limitations & Future Work

- [ ] Phase 5: Direct booking confirmation (no manual intervention)
- [ ] Test KV deduplication at scale (multi-property scenario)
- [ ] Monitor cron reliability (currently */15 * * * *)
- [ ] Add analytics for booking flow conversion
- [ ] Consolidate frontend availability widget with new KV-backed system
