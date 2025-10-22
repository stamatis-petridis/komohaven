# Blue Dream & Studio 9 — Autonomous Agent Guide

This document orients an autonomous agent that maintains or extends the Komotini rentals marketing site contained in this repository.

## 1. Project Snapshot

- **Type:** Static multilingual marketing site for two short-stay rentals (Blue Dream and Studio 9).
- **Stack:** Hand-authored HTML, shared CSS (`styles.css`), vanilla JS (`script.js`), and static assets in `assets/`.
- **Hosting:** GitHub Pages serving files from the repository root; no build or bundling step.
- **Languages:** English (`index.html`) plus Greek (`index-gr.html`), Turkish (`index-tr.html`), Bulgarian (`index-bg.html`).

## 2. Repository Layout

- `index.html` — canonical English landing page; all other language pages mirror this structure and IDs.
- `index-*.html` — localized variants. Keep section IDs, data attributes, and structural markup identical to the English version to preserve styling and JS hooks.
- `styles.css` — global styling; single file, no preprocessor. Theme colors defined as CSS variables at top of file.
- `script.js` — lightweight behavior:
  - Prefills the rental selector from CTA buttons (`data-prefill-rental`).
  - Generates a `mailto:` URL on booking form submit.
  - Injects current year into footer element with `id="year"`.
  - Initializes a Leaflet map; expects Leaflet CSS/JS loaded in the HTML template and `div#map` present.
- `properties/blue-dream/`, `properties/studio-9/` — dedicated property pages, each with an `assets/` folder that houses localised media for that property.
- `availability/` — toolkit for aggregating Airbnb/Booking iCal feeds and emitting the public availability JSON/JS; see Section 11 for details.
- `privacy.html`, `terms.html` — simple legal pages sharing the main stylesheet.
- `assets/` — shared site assets (hero image, favicon).
- `README.md` — high-level overview and wishlist.

## 3. Workflow Expectations

- **Local preview:** Open HTML files directly in a browser or use a lightweight static server (e.g., VS Code Live Server). No package manager or build commands are required.
- **Cross-language parity:** When editing layout or features, update every localized HTML file to keep markup synchronized. Text content should be translated while preserving anchors, IDs, aria attributes, `data-prefill-rental` values, and link targets.
- **Contact & booking CTAs:** Ensure any new CTA button linking to `#contact` includes `data-prefill-rental="Blue Dream"` (or `"Studio 9"`) and `data-prefill-target` so the prefill continues to work.
- **Map section:** The map depends on Leaflet; confirm script and stylesheet tags remain present and that `div#map` is retained across translations.

## 4. Content Editing Guidelines

- **Meta & SEO:** Title, description, and Open Graph tags exist per page. Follow language-specific keywords when expanding SEO work (see README “Next Steps”).
- **JSON-LD schema:** Present in `index.html`; replicate schema changes across localized pages if structured data needs translation or additions.
- **Accessibility:** Maintain heading hierarchy (`h1` only once per page), descriptive `alt` text for gallery images, and meaningful button labels.
- **Typography:** Flag emojis in the language switcher must remain; they are the only non-ASCII characters currently in use.

## 5. JavaScript Considerations

- The `mailto:` builder concatenates form data; keep field `name` attributes stable unless you update `script.js`.
- Default recipient email is `rodipasx@gmail.com`; change in both form copy and `script.js` when updating contact info.
- `L` (Leaflet global) must be available before `script.js` runs. When adding new pages, include Leaflet assets or gate map code accordingly.

## 6. Styling Notes

- Dark theme defined through CSS variables. For new components, derive colors from existing variables to keep brand consistency.
- Layout uses CSS grid extensively; verify responsive behavior around tablet/phone widths after structural edits.
- Avoid inline styles except for intentional overrides already present (e.g., hero image sizing, language pill margin).

## 7. Deployment & Version Control

- GitHub Pages auto-deploys from default branch on push. Use semantic commit messages (`feat:`, `fix:`, etc.) to match existing history.
- Standard workflow:
  ```bash
  git status
  git add <files>
  git commit -m "feat: <concise summary>"
  git push
  ```
- No automated tests; manual verification (section below) is required before pushing.

## 8. QA Checklist Before Shipping

1. Open all four language landing pages locally; confirm layout, hero image, and galleries render identically.
2. Test each CTA button to ensure the booking form appears and the rental dropdown preselects correctly.
3. Submit the form to verify the generated mailto link includes all fields and opens a draft email.
4. Confirm Leaflet map loads, both markers render, and attribution link is present.
5. Ensure footer year updates automatically.
6. Validate accessibility basics (focus states on buttons/links, alt text present).
7. Spot-check `privacy.html` and `terms.html` for stylistic consistency after any global style changes.

## 9. Backlog & Opportunities (from README)

- Add localized SEO meta tags (per language).
- Optimize images (compress hero and gallery photos; add modern formats if desired).
- Introduce an FAQ section for pre-booking questions.
- Implement a gallery lightbox for better image viewing experience.

## 10. Working Notes for Agents

- No external dependencies are installed via npm/pnpm; adding libraries means including CDN links manually in HTML.
- Favor semantic HTML and minimal JS to keep the site lightweight.
- When replacing assets, optimize offline and keep file names stable if possible to avoid updating multiple references.
- Record any open questions or assumptions directly in PR descriptions or future task notes so human collaborators can respond.

## 11. Calendar Availability Toolkit (`availability/`)

- **Purpose:** Fetches live booking feeds (Airbnb/Booking) and outputs the JSON consumed by property pages.
- **Secrets:** `availability/.env` holds the export URLs; treat as sensitive and avoid committing changes unless instructed.
- **Dependencies:** Install/update Python packages from `availability/requirements.txt` (currently `python-dotenv`) before running scripts.
- **Workflow:** From the repo root run:
  ```bash
  python -m pip install -r availability/requirements.txt
  python availability/build_availability_json.py
  git add availability/availability.json
  git commit -m "chore: update availability feeds"
  git push
  ```
  Pushing to `main` triggers the Cloudflare Pages deploy (repository `komohaven`).
- **Shortcut:** Execute `./push_availability.sh` from the repo root to perform the full sequence (install, rebuild, commit, push) automatically (run `chmod +x push_availability.sh` once if needed).
- **Front-end:** Property detail pages fetch `/availability/availability.json` and render it via `/availability/availability.js`.
- **Usage notes:** Environment keys must follow `<PROPERTY>_ICAL_URL_<SOURCE>` so the script can auto-discover feeds. Keep the toolkit lightweight (stdlib Python + vanilla JS) and update this guide when workflows change to stay in sync with the main site.
Use this guide as the operational reference when planning changes, triaging tasks, or validating updates.
