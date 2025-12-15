import { normalizeSlug } from "./slug.js";

(() => {
  const params = new URLSearchParams(window.location.search);

  const slug = normalizeSlug(params.get("slug") || "");
  const startISO = params.get("startISO") || "";
  const endISO = params.get("endISO") || "";
  const nights = params.get("nights") || "";

  const slugToPath = {
    "blue-dream": "/properties/blue-dream/index.html",
    "studio-9": "/properties/studio-9/index.html",
  };

  const propertyPath = slugToPath[slug] || "/";
  const backLink = document.getElementById("back-link");
  if (backLink) {
    backLink.setAttribute("href", propertyPath);
  }

  const summaryBox = document.getElementById("booking-summary");
  const startEl = document.getElementById("summary-start");
  const endEl = document.getElementById("summary-end");
  const nightsEl = document.getElementById("summary-nights");

  const formatDate = (value) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const hasDates = Boolean(startISO || endISO || nights);
  if (hasDates && summaryBox && startEl && endEl && nightsEl) {
    summaryBox.hidden = false;
    startEl.textContent = formatDate(startISO) || "—";
    endEl.textContent = formatDate(endISO) || "—";
    nightsEl.textContent = nights ? String(nights) : "—";
  }
})();
