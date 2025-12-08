# Komo haven — Komotini Rentals Website

A multilingual static website for two rental properties in Komotini, Greece:

- **Blue Dream** (center, 1BR, 2 guests)
- **Studio 9** (studio, 2 guests)

The site is built with **HTML, CSS, and JS**, and hosted on **Cloudflare Pages**.
It includes **direct booking options**, **map integrations**, and **multi-language support** (EN, EL, TR, BG).

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

- Hosted on **Cloudflare Pages** (free static hosting).
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
- Add FAQ section for common guest queries.

---

## 🗂 Asset Organization

- Property-specific media sits alongside each page in `properties/<slug>/assets/`, so everything needed for Blue Dream or Studio 9 is self-contained.

---

## 🙏 Acknowledgment

This project was the **first ever live website** built for my business.
It marks the starting point of combining **cloud, Git, and web skills** into a real-world digital asset.

---

### Maintainers

For deployment runbooks (availability feed refresh, form endpoints, etc.) see [`AGENT.md`](AGENT.md).
