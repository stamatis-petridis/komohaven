// ───────────────────────────── Config ─────────────────────────────
//#region Config

(() => {
  const CONFIG = window.KOMO_CONFIG || {};
  const CONTACT = CONFIG.contact || {
    phoneE164: "+306932647201",
    whatsappNumber: "306932647201",
    email: "rodipasx@gmail.com",
  };
  const CURRENCY = CONFIG.currency || "EUR";

  const MAP_LINKS = Object.fromEntries(
    Object.entries(CONFIG.maps || {}).map(([key, value]) => [
      key,
      value && value.profile ? value.profile : value,
    ])
  );

  const MAP_EMBEDS = Object.fromEntries(
    Object.entries(CONFIG.maps || {}).map(([key, value]) => [
      key,
      value && value.embed ? value.embed : null,
    ])
  );

  const NIGHTLY_RATES_CENTS = CONFIG.ratesCents || {};

  //#endregion
  // ───────────────────────────── DOM Ready ─────────────────────────────
  //#region DOM Ready

  const domReady = (fn) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  };

  //#endregion
  // ───────────────────────────── Rates API ─────────────────────────────
  //#region Rates API

  const getNightlyRateCents = (slug) => {
    if (!slug) return null;
    const key = String(slug).toLowerCase();
    return Object.prototype.hasOwnProperty.call(NIGHTLY_RATES_CENTS, key)
      ? NIGHTLY_RATES_CENTS[key]
      : null;
  };

  //#endregion
  // ───────────────────────────── Contact Links ─────────────────────────────
  //#region Contact Links

  const setContactLinks = () => {
    document.querySelectorAll('[data-contact="phone"]').forEach((el) => {
      el.setAttribute("href", `tel:${CONTACT.phoneE164}`);
      el.removeAttribute("target");
      el.removeAttribute("rel");
    });

    document
      .querySelectorAll('[data-contact="whatsapp"]').forEach((el) => {
        el.setAttribute("href", `https://wa.me/${CONTACT.whatsappNumber}`);
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener");
      });

    document.querySelectorAll('[data-contact="email"]').forEach((el) => {
      el.setAttribute("href", `mailto:${CONTACT.email}`);
      el.removeAttribute("target");
      el.removeAttribute("rel");
    });
  };

  const setMapLinks = () => {
    document.querySelectorAll("[data-map-link]").forEach((el) => {
      const key = el.dataset.mapLink;
      const href = MAP_LINKS[key] || "";
      const embed = MAP_EMBEDS[key] || null;
      if (!href && !embed) return;
      const tag = el.tagName.toLowerCase();
      if (tag === "iframe") {
        const src = embed || href;
        if (!src) return;
        el.setAttribute("src", src);
        el.setAttribute("loading", "lazy");
      } else {
        if (!href) return;
        el.setAttribute("href", href);
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener");
      }
    });
  };

  //#endregion
  // ───────────────────────────── Lightbox ─────────────────────────────
  //#region Lightbox

  const initLightbox = () => {
    const galleryImages = document.querySelectorAll(".gallery img");
    if (!galleryImages.length) return;

    const overlay = document.createElement("div");
    overlay.className = "lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <button type="button" class="lightbox__close" aria-label="Close photo">&times;</button>
      <img class="lightbox__image" alt="" />
    `;

    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector(".lightbox__close");
    const overlayImg = overlay.querySelector(".lightbox__image");
    let lastActiveImage = null;

    const closeLightbox = () => {
      overlay.classList.remove("is-active");
      overlay.setAttribute("aria-hidden", "true");
      overlayImg.src = "";
      overlayImg.alt = "";
      document.body.classList.remove("lightbox-open");
      if (lastActiveImage) {
        lastActiveImage.focus({ preventScroll: true });
      }
    };

    const openLightbox = (img) => {
      lastActiveImage = img;
      overlayImg.src = img.dataset.full || img.src;
      overlayImg.alt = img.alt || "";
      overlay.classList.add("is-active");
      overlay.setAttribute("aria-hidden", "false");
      document.body.classList.add("lightbox-open");
      closeBtn.focus({ preventScroll: true });
    };

    overlay.addEventListener("click", () => {
      closeLightbox();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && overlay.classList.contains("is-active")) {
        closeLightbox();
      }
    });

    galleryImages.forEach((img) => {
      img.setAttribute("tabindex", "0");
      img.addEventListener("click", () => openLightbox(img));
      img.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openLightbox(img);
        }
      });
    });
  };

  //#endregion
  // ───────────────────────────── Leaflet Map ─────────────────────────────
  //#region Leaflet Map

  const initLeafletMap = () => {
    if (typeof L === "undefined") return;
    const mapContainer =
      document.querySelector('[data-map="leaflet"]') ||
      (document.getElementById("map") instanceof HTMLDivElement
        ? document.getElementById("map")
        : null);
    if (!(mapContainer instanceof HTMLDivElement)) return;

    const center = [41.116112, 25.399783];
    const studio = [41.112899, 25.408472];

    const map = L.map(mapContainer).setView(center, 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    L.marker(center).addTo(map).bindPopup("Blue Dream").openPopup();
    L.marker(studio).addTo(map).bindPopup("Studio 9");
  };

  //#endregion
  // ───────────────────────────── Footer Year ─────────────────────────────
  //#region Footer Year

  const updateYear = () => {
    document.querySelectorAll("#year").forEach((el) => {
      el.textContent = String(new Date().getFullYear());
    });
  };

  //#endregion
  // ───────────────────────────── Boot ─────────────────────────────
  //#region Boot

  domReady(() => {
    setContactLinks();
    setMapLinks();
    initLightbox();
    updateYear();
    initLeafletMap();
  });

  //#endregion
  // ───────────────────────────── Global Exports (window.KOMO_RATES) ─────────────────────────────
  //#region Global Exports (window.KOMO_RATES)

  if (typeof window !== "undefined") {
    window.KOMO_RATES = {
      getNightlyRateCents,
      currency: CURRENCY,
    };
  }
})();

//#endregion
