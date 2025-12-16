# KomoHaven Development Skill

You are an expert assistant for the KomoHaven project—a production multilingual static website for two short-stay rental properties (Blue Dream & Studio 9) in Komotini, Greece.

## Quick Reference

| Property | Slug | Rate | Min Nights |
|----------|------|------|------------|
| Blue Dream | `blue-dream` | €40/night (4000 cents) | 2 |
| Studio 9 | `studio-9` | €30/night (3000 cents) | 3 |

**Languages**: EN (index.html), EL (index-gr.html), TR (index-tr.html), BG (index-bg.html)
**Branch**: `lean` (production)
**Hosting**: Cloudflare Pages (auto-deploy on push)

---

## Repository Structure

```
komohaven/
├── index.html, index-{gr,tr,bg}.html    # Multilingual landing pages
├── styles.css                            # Global styles (CSS variables)
├── config.js                             # Contact, maps, rates, minNights
├── script.js                             # Core behaviors (lightbox, maps, contacts)
├── properties/
│   ├── blue-dream/index.html + assets/
│   └── studio-9/index.html + assets/
├── availability/
│   ├── build_availability_json.py        # iCal → JSON converter
│   ├── availability.js                   # Frontend calendar widget
│   ├── availability.json                 # Generated booking data
│   └── push_availability.sh              # Quick refresh script
├── payments/
│   ├── pay.html, success.html, cancel.html
│   ├── payments.js, status.js, slug.js
├── functions/api/
│   ├── availability.js                   # KV-backed endpoint
│   ├── create-checkout-session.js        # Stripe checkout
│   └── stripe-webhook.js                 # Payment webhooks
└── .github/workflows/availability.yml    # Auto-update every 30 min
```

---

## Critical Rules

### 1. Language Synchronization (MANDATORY)

All four landing pages MUST maintain **identical DOM structure**. When making changes:

1. Make the change in `index.html` first
2. Apply the **same structural change** to `index-gr.html`, `index-tr.html`, `index-bg.html`
3. Only translate text content—keep all IDs, classes, and data attributes identical
4. Update hreflang tags in all four files if adding/removing language variants

**Checklist before committing landing page changes:**
- [ ] All four files have identical structure
- [ ] All data attributes match (data-contact, data-map-link, data-prefill-rental)
- [ ] hreflang tags are synchronized
- [ ] Language switcher updated in all files

### 2. Half-Open Interval Semantics

Booking ranges use **[start, end)** — the end date is NOT included in the booking.

```javascript
// CORRECT: Guest checks in on start, checks out on end
isBooked = (date >= start && date < end)

// Example: booked {start: "2025-01-15", end: "2025-01-18"}
// Jan 15, 16, 17 are BOOKED
// Jan 18 is FREE (checkout day)
```

### 3. Configuration-Driven Data

**Never hardcode** contact info, map links, or rates in HTML. Use `config.js`:

```javascript
// Contact info
CONTACT.phoneE164, CONTACT.whatsappNumber, CONTACT.email

// Map links
maps["blue-dream"].profile, maps["blue-dream"].embed

// Rates (in cents)
ratesCents["blue-dream"], ratesCents["studio-9"]

// Minimum nights
minNights["blue-dream"], minNights["studio-9"]
```

### 4. Data Attribute Conventions

| Attribute | Purpose | Values |
|-----------|---------|--------|
| `data-contact` | Contact link injection | `phone`, `whatsapp`, `email` |
| `data-map-link` | Map URL injection | `blue-dream`, `studio-9` |
| `data-prefill-rental` | Booking form prefill | `Blue Dream`, `Studio 9` |
| `data-availability-slug` | Calendar widget root | `blue-dream`, `studio-9` |
| `data-property-label` | Override property label | Any string |

---

## Common Tasks

### Update Availability Feeds
```bash
./availability/push_availability.sh
# OR manually:
python3 availability/build_availability_json.py
git add availability/availability.json && git commit -m "chore: update availability" && git push
```

### Update Contact Information
Edit `config.js` → changes apply immediately via JS injection (no HTML changes needed)

### Update Pricing
Edit `config.js` → `ratesCents` object (values in cents: 4000 = €40)

### Update Minimum Nights
Edit `config.js` → `minNights` object

### Add New Property Image
1. Add image to `properties/<slug>/assets/`
2. Update gallery in `properties/<slug>/index.html`
3. Lightbox works automatically

### Local Development
```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

---

## Availability System

### Data Flow
```
iCal Feeds (Airbnb/Booking)
    ↓ build_availability_json.py
availability.json
    ↓ availability.js (or /api/availability KV endpoint)
3-month calendar widget
    ↓ User selects dates
WhatsApp inquiry OR Stripe checkout
```

### Environment Variables
Pattern: `<PROPERTY>_ICAL_URL_<SOURCE>`
- `BLUE_DREAM_ICAL_URL_AIRBNB`
- `BLUE_DREAM_ICAL_URL_BOOKING`
- `STUDIO9_ICAL_URL_AIRBNB`
- `STUDIO9_ICAL_URL_BOOKING`

### Calendar States
| Class | Meaning |
|-------|---------|
| `.free-day` | Available, selectable |
| `.booked` | Booked, not selectable |
| `.past` | Past date, not selectable |
| `.today` | Current date marker |
| `.range-start` | Start of selection |
| `.range-mid` | Middle of selection |
| `.range-end` | End of selection |
| `.range-single` | Single day selection |

---

## CSS Architecture

### Theme Variables
```css
--bg: #0b0b0c      /* Deep black background */
--fg: #f5f7fa      /* Light gray text */
--muted: #a7adba   /* Secondary text */
--brand: #4ad1ff   /* Cyan accent (CTAs) */
--card: #121316    /* Card backgrounds */
--line: #1d1f24    /* Borders */
```

### Key Components
- `.container` — Max-width 1100px wrapper
- `.nav` — Sticky navigation
- `.hero` — Full-height image section
- `.btn` — Primary CTA (brand cyan)
- `.btn.outline` — Secondary button
- `.listing` — Property cards
- `.gallery` — Image grid
- `.lightbox` — Fullscreen overlay

### Region Markers
CSS uses `/* #region */` comments for organization. Maintain these when editing.

---

## Payment System (Stripe)

### Flow
1. User selects dates in calendar
2. `availability:range-selected` event fired
3. "Reserve" button becomes active
4. Click → `/payments/pay.html` with booking context
5. "Pay Now" → POST `/api/create-checkout-session`
6. Redirect to Stripe Checkout
7. Success/Cancel → return pages
8. Webhook → stores booking in KV, Telegram alert

### Custom Events
```javascript
// Fired when range selected
document.addEventListener('availability:range-selected', (e) => {
  const { slug, startISO, endISO, nights, rateCents } = e.detail;
});

// Fired when selection cleared
document.addEventListener('availability:range-cleared', (e) => {
  const { slug, summaryElement } = e.detail;
});
```

### Stripe Environment
- `STRIPE_SECRET_KEY` — For checkout sessions
- `STRIPE_WEBHOOK_SECRET` — For webhook verification

---

## Cloudflare Configuration

### KV Namespaces
- `PAYMENTS_KV` — Booking records, webhook deduplication
- `AVAIL_KV` — Availability data cache

### Functions
| Endpoint | Purpose |
|----------|---------|
| `/api/availability?slug=` | KV-backed availability read |
| `/api/avail-health` | KV health check |
| `/api/create-checkout-session` | Stripe session creation |
| `/api/stripe-webhook` | Payment webhook handler |

---

## Troubleshooting

### Calendar not showing bookings
1. Check `availability.json` was updated recently
2. Verify iCal URLs are valid in `.env`
3. Check browser console for fetch errors
4. Try `?kv_avail=0` to force JSON file fallback

### Contact links not working
1. Verify `config.js` is loaded before `script.js`
2. Check data attributes match: `data-contact="phone|whatsapp|email"`
3. Inspect console for errors in `setContactLinks()`

### Payment fails
1. Check Stripe keys in Cloudflare env
2. Verify webhook secret matches endpoint
3. Check Functions logs in Cloudflare dashboard
4. Review Telegram alerts for error context

### Language variant out of sync
1. Diff the HTML files: `diff index.html index-gr.html`
2. Look for missing data attributes or changed IDs
3. Ensure hreflang tags reference all four variants

---

## Best Practices

1. **Test locally first** — `python3 -m http.server 8000`
2. **Run availability refresh** — Before committing if testing calendar
3. **Check all languages** — Use browser to verify each variant
4. **Preserve data attributes** — They're the JS integration points
5. **Keep config.js updated** — Single source of truth for business data
6. **Use semantic commits** — `feat:`, `fix:`, `chore:`, `docs:`
7. **Monitor GitHub Actions** — Availability workflow runs every 30 min

---

## File Quick Reference

| Task | File(s) to Edit |
|------|-----------------|
| Change contact info | `config.js` |
| Change pricing | `config.js` |
| Change map links | `config.js` |
| Update landing page copy | `index.html` + all language variants |
| Update property page | `properties/<slug>/index.html` |
| Fix calendar bugs | `availability/availability.js` |
| Fix styling | `styles.css` |
| Fix contact/map/lightbox | `script.js` |
| Fix payment flow | `payments/*.js`, `functions/api/*.js` |
| Change availability fetch | `availability/build_availability_json.py` |
| Adjust auto-refresh schedule | `.github/workflows/availability.yml` |
