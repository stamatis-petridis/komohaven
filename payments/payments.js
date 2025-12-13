// Lightweight payment helper for availability selections.
// Listens for availability selection events and appends a total price to the summary.

(() => {
  if (typeof document === "undefined") return;

  const baseSummaryText = new WeakMap();
  const formatterCache = new Map();

  const getRates = () =>
    (typeof window !== "undefined" && window.KOMO_RATES) || {};

  const getCurrency = () => getRates().currency || "EUR";

  const getNightlyRateCents = (slug) => {
    const rates = getRates();
    const key = (slug || "").toLowerCase();
    if (typeof rates.getNightlyRateCents === "function") {
      const value = rates.getNightlyRateCents(key);
      if (typeof value === "number") return value;
    }
    if (rates && typeof rates === "object") {
      const raw = rates[key];
      if (typeof raw === "number") return raw;
    }
    return null;
  };

  const calculateNights = (startDate, endDate) => {
    if (!(startDate instanceof Date) || !(endDate instanceof Date)) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(12, 0, 0, 0);
    end.setHours(12, 0, 0, 0);
    const diff = Math.round(
      (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)
    );
    return Math.max(1, diff);
  };

  const formatTotal = (amountCents, currency) => {
    if (typeof amountCents !== "number") return null;
    const cacheKey = `${currency}-0`;
    const formatter =
      formatterCache.get(cacheKey) ||
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    formatterCache.set(cacheKey, formatter);
    return formatter.format(amountCents / 100);
  };

  const stripPriceSuffix = (text) => {
    if (!text) return "";
    return text.replace(/\s+Total\s+.+$/i, "").trim();
  };

  const resolveSummaryElement = (eventDetail, target) => {
    if (eventDetail && eventDetail.summaryElement instanceof Element) {
      return eventDetail.summaryElement;
    }
    if (target instanceof Element) {
      return target.querySelector("[data-availability-summary]");
    }
    return null;
  };

  const handleSelected = (event) => {
    const detail = event.detail || {};
    const summaryEl = resolveSummaryElement(detail, event.target);
    if (!summaryEl) return;

    const baseText =
      stripPriceSuffix(summaryEl.textContent || "") ||
      baseSummaryText.get(summaryEl) ||
      "";
    baseSummaryText.set(summaryEl, baseText);

    const startDate = detail.startDate ? new Date(detail.startDate) : null;
    const endDate = detail.endDate ? new Date(detail.endDate) : null;
    const detailNights =
      typeof detail.nights === "number" && Number.isFinite(detail.nights)
        ? detail.nights
        : null;
    const nights =
      detailNights && detailNights > 0
        ? detailNights
        : calculateNights(startDate, endDate);
    const minNights =
      typeof detail.minNights === "number" ? detail.minNights : null;

    if (minNights && nights < minNights) {
      summaryEl.textContent = baseText;
      return;
    }

    const nightlyRate =
      typeof detail.rateCents === "number"
        ? detail.rateCents
        : getNightlyRateCents(detail.slug);

    if (!nightlyRate || nights <= 0) {
      summaryEl.textContent = baseText;
      return;
    }

    const total = formatTotal(nightlyRate * nights, detail.currency || getCurrency());
    if (!total) {
      summaryEl.textContent = baseText;
      return;
    }

    const trimmedBase = baseText.trimEnd();
    summaryEl.textContent = trimmedBase
      ? `${trimmedBase} Total ${total}`
      : `Total ${total}`;
  };

  const handleCleared = (event) => {
    const summaryEl = resolveSummaryElement(event.detail, event.target);
    if (!summaryEl) return;
    const baseText =
      baseSummaryText.get(summaryEl) ||
      stripPriceSuffix(summaryEl.textContent || "");
    summaryEl.textContent = baseText;
  };

  document.addEventListener("availability:range-selected", handleSelected);
  document.addEventListener("availability:range-cleared", handleCleared);
})();
