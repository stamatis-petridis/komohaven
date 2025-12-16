# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KomoHaven is a static multilingual marketing site for two short-stay rental properties in Komotini, Greece: **Blue Dream** and **Studio 9**. The site is hosted on Cloudflare Pages and deploys automatically on push to `main`.

## Stack

- **Frontend**: Hand-authored HTML, vanilla CSS (`styles.css`), vanilla JS (`script.js`)
- **Availability System**: Python script fetches iCal feeds → JSON → JS calendar widget
- **Hosting**: Cloudflare Pages (auto-deploy on push)
- **No build step**: Open HTML files directly or use a static server

## Common Commands

```bash
# Refresh availability feed (installs deps, rebuilds JSON, commits, pushes)
./availability/push_availability.sh

# Manual availability refresh
python3 -m pip install -r availability/requirements.txt
python3 availability/build_availability_json.py

# Local preview
python3 -m http.server 8000
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
  build_availability_json.py  # Fetches iCal feeds → availability.json
  availability.js             # Frontend calendar widget (ES module)
  availability.json           # Generated booking data
  .env                        # iCal URLs (not committed)
.github/workflows/
  availability.yml      # Runs every 30 min to auto-update feeds
```

## Architecture

### Multi-language Pages
All four language versions (`index.html`, `index-gr.html`, `index-tr.html`, `index-bg.html`) must maintain identical structure—same section IDs, `data-*` attributes, and CSS class hooks. Only text content differs.

### Contact & Map Configuration
Contact info and map links are centralized in `script.js`:
```javascript
const CONTACT = { phoneE164: "...", whatsappNumber: "...", email: "..." };
const MAP_LINKS = { "blue-dream": "...", "studio-9": "..." };
```
HTML elements use `data-contact="phone|whatsapp|email"` and `data-map-link="blue-dream|studio-9"` attributes that JS populates at runtime.

### Booking Form
Form submission builds a `mailto:` URL from form data. Field `name` attributes must remain stable: `rental`, `checkin`, `checkout`, `guests`, `name`, `email`, `message`.

### Availability System
1. **Data flow**: iCal feeds (Airbnb/Booking) → `build_availability_json.py` → `availability.json` → `availability.js` widget
2. **Environment keys**: Must follow pattern `<PROPERTY>_ICAL_URL_<SOURCE>` (e.g., `BLUE_DREAM_ICAL_URL_AIRBNB`)
3. **GitHub Action**: Runs every 30 minutes, only commits when booking data actually changes (ignores timestamp-only diffs)
4. **Widget**: Property pages include `data-availability-slug="blue-dream"` attribute; widget auto-discovers and renders calendar

### Leaflet Map
Requires Leaflet CSS/JS loaded in HTML. Map initializes on `div#map` or `[data-map="leaflet"]`. Markers are defined in `initLeafletMap()` in `script.js`.

## Key Conventions

- **CTA prefill**: Booking buttons use `data-prefill-rental="Blue Dream"` to auto-select property in form
- **Lightbox**: Gallery images in `.gallery img` are automatically made clickable
- **Footer year**: Element with `id="year"` auto-updates to current year
- **Styling regions**: `styles.css` uses `/* #region */` markers for organization

## Secrets & Sensitive Data

- `availability/.env` contains iCal export URLs—treat as sensitive
- GitHub Actions uses repository secrets for the same URLs
- Never commit `.env` files or log booking URLs

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
