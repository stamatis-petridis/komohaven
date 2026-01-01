# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KomoHaven is a static multilingual marketing site for two short-stay rental properties in Komotini, Greece: **Blue Dream** and **Studio 9**. The site is hosted on Cloudflare Pages and deploys automatically on push to `lean` (production branch).

## Stack

- **Frontend**: Hand-authored HTML, vanilla CSS (`styles.css`), vanilla JS (`script.js`)
- **Availability**: Cloudflare Workers (avail-sync, every 15 min) → KV Storage → API → JS widget
- **Hosting**: Cloudflare Pages (auto-deploy on push to `lean` branch)
- **Payments**: Stripe Checkout + webhook handling
- **Storage**: Cloudflare KV (bookings, payment records, sync status)
- **No build step**: Open HTML files directly or use a static server

## Common Commands

```bash
# Local preview
python3 -m http.server 8000

# Check KV availability (via Cloudflare MCP in Claude)
Claude: "Show me blue-dream's booked dates"
Claude: "List komohaven deployments"

# Check worker logs
npx wrangler tail avail-sync --follow

# Manually sync availability
Curl: GET https://avail-sync.rodipasx.workers.dev/sync
```

## Repository Layout

```
index.html              # English landing page (canonical)
index-{gr,tr,bg}.html   # Greek, Turkish, Bulgarian variants
styles.css              # Global styles (CSS variables at top)
script.js               # Contact links, booking form, lightbox, Leaflet map
privacy.html, terms.html
properties/
  blue-dream/           # Property page + assets/
  studio-9/             # Property page + assets/
availability/
  build_availability_json.py  # Legacy: Fetches iCal feeds → JSON
  availability.js             # Frontend calendar widget (ES module, KV-first)
  availability.json           # Static fallback (not primary)
  .env                        # iCal URLs (not committed)
  TRANSITION.md               # Phase migration guide (Phase 1→2→3)
.github/workflows/
  availability.yml      # DISABLED: GitHub Actions cron (KV worker is primary)
functions/api/
  availability.js       # Returns KV data + last_sync timestamp
  avail-health.js       # KV connectivity test
```

## Architecture

### Availability System (Current — Phase 2.5)

**Data flow:**
```
Airbnb/Booking iCal feeds
         ↓
Cloudflare Worker (avail-sync, every 15 min)
         ↓
KV Storage (avail:{slug}:booked, avail:{slug}:last_sync)
         ↓
API endpoint (/api/availability?slug=...)
         ↓
Frontend (availability.js) — KV-first, file fallback
         ↓
Calendar widget + "Updated 3 mins ago" timestamp
```

**Key points:**
- Worker syncs both Airbnb + Booking feeds, merges ranges, stores in KV
- Frontend reads from `/api/availability` (which returns KV data + last_sync timestamp)
- Static `availability.json` is fallback only (accessed via `?legacy_avail=1`)
- GitHub Actions cron is **disabled** as of 2025-12-28 (was redundant)

**KV Namespace:**
- ID: `41508b8af57d4e58869ed023c03f6348` (komohaven-avail)
- Keys: `avail:blue-dream:booked`, `avail:blue-dream:last_sync`, `avail:blue-dream:sync_status`, etc.
- Data format: `[{ start: "YYYY-MM-DD", end: "YYYY-MM-DD" }]` (half-open intervals)

### Multi-language Pages
All four language versions (`index.html`, `index-gr.html`, `index-tr.html`, `index-bg.html`) must maintain identical structure—same section IDs, `data-*` attributes, and CSS class hooks. Only text content differs.

### Contact & Map Configuration
Contact info and map links are centralized in `script.js`:
```javascript
const CONTACT = { phoneE164: "...", whatsappNumber: "...", email: "..." };
const MAP_LINKS = { "blue-dream": "...", "studio-9": "..." };
```
HTML elements use `data-contact="phone|whatsapp|email"` and `data-map-link="blue-dream|studio-9"` attributes that JS populates at runtime.

### Booking Flow
1. Guest selects dates on property page (availability widget)
2. Clicks "Reserve" button
3. Redirected to `/payments/pay.html` with date params
4. Stripe Checkout (phone + name collection)
5. Success/cancel pages redirect to confirmation
6. Webhook stores payment record in KV

### Leaflet Map
Requires Leaflet CSS/JS loaded in HTML. Map initializes on `div#map` or `[data-map="leaflet"]`. Markers are defined in `initLeafletMap()` in `script.js`.

## Key Conventions

- **CTA prefill**: Booking buttons use `data-prefill-rental="Blue Dream"` to auto-select property in form
- **Lightbox**: Gallery images in `.gallery img` are automatically made clickable
- **Footer year**: Element with `id="year"` auto-updates to current year
- **Styling regions**: `styles.css` uses `/* #region */` markers for organization
- **Availability slug**: Pages use `data-availability-slug="blue-dream"` or `data-availability-slug="studio-9"`
- **Source resolution**: `resolveAvailabilitySource()` decides KV vs file based on `?legacy_avail=1` param
- **Timestamp format**: Footer shows relative time ("3 mins ago") via `formatUpdatedLabel()`

## Cloudflare MCP Server

**Location:** `/Users/stamatespetridis/dev/mcp/servers/komohaven/`

**What it does:** Provides Claude (Desktop + Chat) direct access to:
- KV Storage (read/write availability, payment records)
- Pages deployments (check status, trigger redeploys)
- Account settings (read-only)

**Available tools:**
```
✅ list_kv_keys(namespace_id, prefix?, limit?)
✅ get_kv_value(key, namespace_id)
✅ put_kv_value(key, value, namespace_id, confirm=true)
✅ delete_kv_value(key, namespace_id, confirm=true)
✅ list_pages_deployments(project_name)
✅ get_pages_deployment(project_name, deployment_id)
✅ trigger_pages_deployment(project_name, confirm=true)
✅ list_pages_projects()
✅ get_account_info()
```

**Example queries from Claude:**
```
"Show me blue-dream's current booked dates"
→ Fetches avail:blue-dream:booked from KV

"When was studio-9 last synced?"
→ Fetches avail:studio-9:last_sync from KV

"List the last 5 komohaven deployments"
→ Queries Pages deployment history

"Mark Jan 5-10 as booked for blue-dream"
→ Updates KV (requires confirm=true)

"Redeploy komohaven"
→ Triggers Pages rebuild (requires confirm=true)
```

**Setup:**
- Token: `komohaven-wrangler` (scoped, expires Nov 1, 2026)
- Config: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Status: ✅ Integrated and active in Claude Desktop

## Deployment & Git Workflow

**Production branch:** `lean` (not `main`)

**Deploy process:**
```bash
git add <files>
git commit -m "feat: description"
git push origin lean
# → Cloudflare Pages auto-deploys in ~30 seconds
```

**Verify deployment:**
```
Claude: "Check the latest komohaven deployment"
→ Shows all build stages and status
```

**Maintenance:**
- Static pipeline (GitHub Actions) is **disabled** (cron commented out)
- Worker is the source of truth (runs every 15 min)
- Fallback file (`availability.json`) updated manually if needed

## Secrets & Sensitive Data

- `availability/.env` contains iCal export URLs—treat as sensitive (not committed)
- Cloudflare secrets store the same URLs for worker access
- API token: `komohaven-wrangler` stored in Claude Desktop config
- Never commit `.env` files or log booking URLs
- All KV write operations require `confirm: true` for safety

## Claude Code Slash Commands

This project includes custom slash commands for common workflows:

| Command | Purpose |
|---------|---------|
| `/sync-languages` | Compare and sync all four language variants |
| `/update-availability` | Refresh availability data from iCal feeds |
| `/update-config` | Update contact info, pricing, or map links |
| `/add-property-image` | Add new gallery image to a property |
| `/debug-calendar` | Troubleshoot availability calendar issues |
| `/check-deployment` | Verify deployment status and configuration |

## Claude Code Skill

The `.claude/skills/komohaven.md` file contains comprehensive project knowledge including:
- Repository structure and file purposes
- Critical rules for language synchronization
- Half-open interval semantics for bookings
- CSS architecture and theming
- Payment system flow
- Troubleshooting guides

This skill is automatically available when working in this repository.

## Phase History

| Phase | Date | Status | What |
|-------|------|--------|------|
| Phase 0 | Aug-Oct 2025 | ✅ | Initial site + i18n |
| Phase 1a | Oct 2025 | ✅ | Gallery, maps, UI |
| Phase 1b | Oct-Dec 2025 | ✅ | Static availability pipeline |
| Phase 2a | Dec 15 2025 | ✅ | Config consolidation |
| Phase 2b | Dec 15-16 2025 | ✅ | Stripe + KV storage |
| Phase 4 | Dec 17-18 2025 | ✅ | Multi-feed worker sync |
| Phase 1 (Parallel) | Dec 18-28 2025 | ✅ | 10 days KV verification |
| Phase 2 | Dec 28 2025 | ✅ | KV-first frontend |
| Phase 2.5 | Dec 28 2025 | ✅ | Real timestamps |
| Phase 3 | TBD | ⏳ | Retire static pipeline |

See `availability/TRANSITION.md` and `CHANGELOG.md` for detailed migration guide.
