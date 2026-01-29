# KomoHaven Copilot Instructions

**Project:** Multilingual short-stay rental marketing site (Blue Dream & Studio 9) hosted on Cloudflare Pages.  
**Stack:** Static HTML/CSS/JS + Cloudflare Workers (availability sync) + KV Storage (bookings, availability, blocked dates)  
**Production branch:** `lean` (auto-deploys from GitHub push)

---

## Architecture Overview

### Data Flow: Availability Management
```
Airbnb/Booking iCal feeds → Worker (avail-sync, every 15 min) → KV Storage
  ↓
/api/availability endpoint → Frontend (availability.js ES module) → Calendar widget
  ↓
Display with relative timestamp ("3 mins ago")
```

**Critical detail:** Static `availability.json` pipeline **retired Jan 27, 2026**. KV is now the single source of truth. Frontend reads exclusively from `/api/availability?slug={blue-dream|studio-9}`.

### Admin System (New: Jan 29)
- **Login:** `/admin` (password auth, localStorage session token, 24h expiry)
- **Dashboard:** `/admin/dashboard` (property selector + 3-month calendar view)
- **Features:** Color-coded date states (red=Airbnb, blue=Booking, green=manual blocks), click to block/unblock date ranges
- **Endpoints:** `POST /api/blocked-dates/{add,remove}`, `GET /api/blocked-dates/status`
- **Storage:** KV namespace `blocked:{slug}:dates` (same format as availability: `[{start, end}]`)

### Payment System
- **Flow:** Select property + dates → `/payments/pay.html` → Stripe Checkout (collects name, phone) → Success/cancel pages
- **Backend:** `POST /api/create-checkout-session` (functions routing), webhook stores in KV
- **Notification:** Stripe webhook → Telegram bot alert

---

## Key Conventions & Patterns

### URL Slug Normalization
- Valid slugs: `"blue-dream"`, `"studio-9"` (hyphenated, lowercase)
- Used in: HTML `data-availability-slug`, KV keys `avail:{slug}:booked`, `blocked:{slug}:dates`, API queries
- **Slugs are case-insensitive but must normalize to canonical form**

### Availability Data Format
Half-open intervals (ISO date strings): `[{ start: "YYYY-MM-DD", end: "YYYY-MM-DD" }]`  
Example: `[{ start: "2026-01-29", end: "2026-02-05" }]` = blocked Jan 29–Feb 4 (Feb 5 available)

### KV Namespace & Keys
```
AVAIL_KV (id: 41508b8af57d4e58869ed023c03f6348)
  avail:{slug}:booked      → merged Airbnb + Booking ranges
  avail:{slug}:last_sync   → ISO timestamp of last worker sync
  avail:{slug}:sync_status → worker status object (changed, hash, error)

PAYMENTS_KV (id: 61499baaa55942a0a38458dc0cd3de84)
  [reserved for future booking records]

blocked:{slug}:dates       → manual blocked date ranges (same KV as avail)
```

### Multi-Language Sync Rules
All four HTML files (`index.html`, `index-{gr,tr,bg}.html`) **must keep identical structure**:
- Same section IDs (`id="contact"`, `id="map"`, etc.)
- Same `data-*` attributes (`data-availability-slug`, `data-prefill-rental`, etc.)
- Same CSS classes and Leaflet hooks
- **Only text content, JSON-LD, and meta tags differ per language**

When editing layout/features: update all four files simultaneously or structure will break.

### Contact & Map Configuration
Defined once in `script.js` (lines ~5–25):
```javascript
const CONTACT = { phoneE164, whatsappNumber, email };
const MAP_LINKS = { "blue-dream": "...", "studio-9": "..." };
const MAP_EMBEDS = { ... }; // optional embed URLs
const NIGHTLY_RATES_CENTS = { "blue-dream": 5000, "studio-9": 4000 };
```

HTML uses `data-contact="phone|whatsapp|email"` and `data-map-link="slug"` hooks. **Never hardcode contact/map URLs in HTML.**

### CSS Organization
`styles.css` uses `/* #region */` markers for editor collapsing:
- CSS variables (theme colors) at top
- Layout sections (hero, availability, map, etc.)
- Responsive breakpoints at bottom
- Grid-heavy design; verify responsive behavior after structural changes

---

## Critical Developer Workflows

### Check Availability Status
```bash
# Via CLI (requires Python + .env with iCal URLs)
python availability/compare_availability.py --property blue-dream --days 30

# Via Claude + Cloudflare MCP
Claude: "Show me blue-dream's current booked dates"
Claude: "When was studio-9 last synced?"
```

### Manually Trigger Worker Sync
```bash
curl https://avail-sync.rodipasx.workers.dev/sync
# Worker runs every 15 min by default; use /sync for immediate re-run
```

### Update Blocked Dates (Admin API)
```bash
# Requires KOMOHAVEN_AUTH_TOKEN secret
POST /api/blocked-dates/add
  { slug: "blue-dream", ranges: [{ start: "2026-02-01", end: "2026-02-05" }] }

POST /api/blocked-dates/remove
  { slug: "blue-dream", ranges: [{ start: "2026-02-01", end: "2026-02-05" }] }

GET /api/blocked-dates/status?slug=blue-dream
  # Returns: { ok: true, blocked: [...] }
```

### Deploy to Production
```bash
git add <files>
git commit -m "feat: <description>"  # Use semantic prefixes
git push origin lean
# → Auto-deploys in ~30s via Cloudflare Pages
```

### Debug Calendar Widget
Check browser console for:
- `resolveAvailabilitySource()` decision logs (KV vs fallback)
- Fetch errors from `/api/availability`
- Last sync timestamp parsing in `formatUpdatedLabel()`
- See [availability/availability.js](availability/availability.js) for calendar logic

---

## Files & Their Purposes

| File | Purpose |
|------|---------|
| `index.html` | English landing page (canonical) |
| `index-{gr,tr,bg}.html` | Localized variants (sync structure with English) |
| `script.js` | Contact links, booking form, map init, prefill logic |
| `styles.css` | Single global stylesheet (no preprocessor) |
| `config.js` | Optional runtime config override (deprecated; use `window.KOMO_CONFIG`) |
| `functions/api/availability.js` | KV-backed read endpoint; returns booked dates + last_sync |
| `functions/api/blocked-dates/{add,remove,status}.js` | Manual date blocking API |
| `functions/api/create-checkout-session.js` | Stripe Checkout initiation |
| `functions/api/stripe-webhook.js` | Webhook handler (stores booking in KV) |
| `workers/avail-sync/src/index.js` | 15-min cron worker; fetches iCal feeds, merges, writes to KV |
| `availability/availability.js` | Frontend ES module; reads from `/api/availability`, renders calendar |
| `availability/compare_availability.py` | Verification script (compares live iCals vs KV state) |
| `payments/pay.html` | Stripe Checkout page (receives slug, dates, calculates total) |
| `admin.css` | Light-mode design system for admin pages |
| `functions/admin/{index,dashboard}.js` | Login + dashboard rendering |

---

## Common Patterns to Follow

**Form submission → mailto generation:**
```javascript
// In script.js: Booking form collect fields, build mailto: on submit
const mailtoUrl = `mailto:${CONTACT.email}?subject=...&body=...`;
```

**Gallery lightbox:**
```html
<div class="gallery">
  <img src="..." alt="..." />
  <!-- Auto-attached click handler in script.js -->
</div>
```

**Booking CTA prefill:**
```html
<button data-prefill-rental="Blue Dream" ...>Reserve</button>
<!-- script.js reads data-prefill-rental and sets form dropdown -->
```

**Availability fetch with fallback:**
```javascript
// availability.js: KV-first, static file fallback (legacy_avail param)
const source = await resolveAvailabilitySource(slug);
// Returns { booked: [...], last_sync: "..." } or error
```

---

## QA Checklist Before Shipping

1. ✅ All four language pages render identically (structure + layout)
2. ✅ Booking form prefill works; CTA buttons trigger correct property selection
3. ✅ Calendar widget displays; dates are correctly disabled/enabled
4. ✅ Footer year auto-updates
5. ✅ Map loads (Leaflet CSS/JS present, markers render, attribution visible)
6. ✅ Contact buttons generate correct tel://, https://wa.me/, mailto: links
7. ✅ Admin login/dashboard accessible; calendar blocking UI functional
8. ✅ Stripe Checkout flow works (test card: 4242 4242 4242 4242)
9. ✅ Deployment successful: `git push origin lean` auto-deploys

---

## Recent Context (Jan 2026)

- **Jan 29:** Admin system + calendar blocking completed (new core feature)
- **Jan 27:** Static pipeline retired; KV is now exclusively the source of truth
- **Jan 1:** Cloudflare MCP server integrated (available in Claude Desktop)
- **Dec 28:** Phase 2.5 added real timestamps to availability footer

See [CHANGELOG.md](CHANGELOG.md) for full phase history and migration details.
