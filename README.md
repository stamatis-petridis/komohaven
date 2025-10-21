# Blue Dream & Studio 9 — Komotini Rentals Website

A multilingual static website for two rental properties in Komotini, Greece:

- **Blue Dream** (near center, 1BR, 2 guests)
- **Studio 9** (central studio, 1–2 guests)

The site is built with **HTML, CSS, and JS**, and hosted via **GitHub Pages**.
It includes **direct booking options**, **map integrations**, and **multi-language support** (EN, EL, TR, BG).

---

## 🔁 Quick Availability Refresh

- Activate your virtual environment (`source .venv/bin/activate` or similar).
- From the repo root run:
  ```bash
  ./push_availability.sh
  ```
  The helper script installs requirements, rebuilds `availability/availability.json`, commits, and pushes so Cloudflare Pages redeploys. Run `chmod +x push_availability.sh` once if it is not yet executable.

---

## ✨ Features

- Responsive design with hero image and property galleries.
- Direct booking form (mailto: flow).
- Contact buttons: **Call, WhatsApp, Email**.
- Integrated Google Maps:
  - Blue Dream → [Google Maps Business Profile](https://maps.app.goo.gl/4yh65CaNSKpPbDjH8)
  - Studio 9 → [Google Maps Business Profile](https://maps.app.goo.gl/UnqJnzg1pjv87f8z8)
- Location map embed of Komotini.
- Multi-language versions:
  - 🇬🇧 English (`index.html`)
  - 🇬🇷 Greek (`index-gr.html`)
  - 🇹🇷 Turkish (`index-tr.html`)
  - 🇧🇬 Bulgarian (`index-bg.html`)
- Language switcher with emoji flags.

---

## 🛠 Development

This project was built step by step as a **learning journey**:

1. Setup with **VS Code** and Live Server.
2. Version control with **Git** and publishing with **GitHub**.
3. Iterative commits with semantic messages (`feat:`, `fix:`, `chore:`).
4. Image optimization and gallery layout improvements.
5. Adding maps, hreflang tags, and localized content.

---

## 🚀 Deployment

- Hosted on **GitHub Pages** (free static hosting).
- To update:
  ```bash
  git add -A
  git commit -m "feat: update site content"
  git push
  ```
- Pages auto-refresh on push.

---

## 📌 Next Steps

- Add SEO meta tags per language with local keywords.
- Optimize images for faster load.
- Add FAQ section for common guest queries.
- Consider lightbox for gallery images.

---

## 📅 Availability Toolkit

- The `availability/` workspace pulls live iCal feeds (Airbnb, Booking, …) defined in `.env` and produces the JSON consumed by the property pages.
- Install dependencies once (inside a virtualenv if you prefer):
  ```bash
  cd availability
  python -m pip install -r requirements.txt
  ```
- Populate `availability/.env` with the export URLs (already in place) and regenerate the JSON when bookings change, then commit and push so Cloudflare Pages redeploys:
  ```bash
  python -m pip install -r availability/requirements.txt
  python availability/build_availability_json.py
  git add availability/availability.json
  git commit -m "chore: update availability feeds"
  git push
  ```
  which writes `availability/availability.json`. Property pages fetch this file to render the availability calendar widget.
- Shortcut: run the helper script from the repo root to execute the same steps in one go:
  ```bash
  chmod +x push_availability.sh  # first time only
  ./push_availability.sh
  ```

---

## 🗂 Asset Organization

- Shared site assets (e.g. hero, favicon) live under `assets/`.
- Property-specific media sits alongside each page in `properties/<slug>/assets/`, so everything needed for Blue Dream or Studio 9 is self-contained.

---

## 🙏 Acknowledgment

This project was the **first ever live website** built for my business.
It marks the starting point of combining **cloud, Git, and web skills** into a real-world digital asset.
