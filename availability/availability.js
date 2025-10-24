const AVAILABILITY_ENDPOINT = new URL("./availability.json", import.meta.url).toString();
// Cache the fetch promise so multiple widgets on the page reuse the same request.
let availabilityCachePromise;

// Fetch the availability payload and expose the subset for a specific slug.
export async function fetchAvailability(slug) {
  // Load the full JSON and pick the property bucket by slug.
  const data = await loadAvailabilityJSON();
  const key = String(slug || "").toLowerCase();
  const property = (data.properties && data.properties[key]) || { booked: [] };
  return {
    slug: key,
    updated: data.updated || null,
    booked: property.booked || [],
  };
}

// Convert raw booked entries into sorted half-open Date ranges.
export function normalizeRanges(booked) {
  // Convert raw entries into Date ranges and filter out malformed spans.
  const ranges = (booked || [])
    .map((entry) => {
      const startStr = entry.start || entry.check_in || entry.checkIn;
      const endStr = entry.end || entry.check_out || entry.checkOut;
      if (!startStr || !endStr) return null;
      const start = toLocalDate(startStr);
      const end = toLocalDate(endStr);
      if (!start || !end || end <= start) return null;
      return { start, end, source: entry.source || null };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  return ranges;
}

// Fetch and cache the JSON that backs the widget.
async function loadAvailabilityJSON() {
  if (!availabilityCachePromise) {
    availabilityCachePromise = fetch(AVAILABILITY_ENDPOINT, {
      headers: { Accept: "application/json" },
    })
      // Gracefully fallback to empty data so the UI still renders.
      .then((res) => (res.ok ? res.json() : { updated: null, properties: {} }))
      .catch(() => ({ updated: null, properties: {} }));
  }
  return availabilityCachePromise;
}

// Parse a string into a Date normalized to local midnight.
function toLocalDate(value) {
  // Accept YYYY-MM-DD or ISO timestamps; normalize to midnight.
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    date.setHours(0, 0, 0, 0);
    return date;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

// Discover all DOM blocks that declare a property slug and hydrate them.
function initAvailabilityBlocks() {
  // Find every block annotated with a property slug and hydrate it.
  const blocks = document.querySelectorAll("[data-availability-slug]");
  blocks.forEach((block) => {
    const slug = block.getAttribute("data-availability-slug");
    if (!slug) return;
    enhanceBlock(block, slug.toLowerCase());
  });
}

// Fetch, render, and annotate one availability block.
async function enhanceBlock(root, slug) {
  const noteEls = root.querySelectorAll("[data-availability-note]");
  const calendarEl = root.querySelector("[data-availability-calendar]");
  if (!calendarEl) return;

  // Seed the note before the async fetch resolves.
  noteEls.forEach((el) => {
    if (!el.dataset.noteInitialized) {
      el.textContent = "Loading availability…";
      el.dataset.noteInitialized = "true";
    }
  });

  // Load availability data, render the calendar UI, and wire up interactions.
  try {
    const { updated, booked } = await fetchAvailability(slug);
    const ranges = normalizeRanges(booked);
    const propertyLabel = getPropertyLabel(root, slug);
    renderCalendar(calendarEl, ranges);
    ensureLegend(root);
    setupRangeSelection(root, calendarEl, propertyLabel);
    updateNotes(noteEls, ranges, updated);
  } catch (error) {
    console.error("Availability error", error);
    // Fall back to a helpful message if the fetch fails.
    noteEls.forEach((el) => {
      el.textContent =
        "Availability could not be loaded right now. Please mention your dates in the message.";
    });
    calendarEl.innerHTML = "";
  }
}

// Update helper text below the calendar with last-updated info.
function updateNotes(noteEls, ranges, updated) {
  // Compose a friendly status message including last-updated date.
  const updatedLabel = updated
    ? new Date(updated).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;
  const hasBookings = ranges.length > 0;
  const message = hasBookings
    ? `Select your stay dates to message us on WhatsApp. Booked dates are highlighted below. Updated ${updatedLabel || "recently"}.`
    : `Select your stay dates to message us on WhatsApp. No bookings on the calendar yet. Updated ${updatedLabel || "recently"}.`;

  noteEls.forEach((el) => {
    el.textContent = message;
  });
}

// Render a multi-month calendar highlighting booked ranges.
function renderCalendar(container, ranges, { months = 3 } = {}) {
  container.innerHTML = "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Render a simple grid for the current and next N months.
  for (let offset = 0; offset < months; offset += 1) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const monthCard = document.createElement("div");
    monthCard.className = "availability-month";

    const heading = document.createElement("h3");
    heading.textContent = monthDate.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
    monthCard.appendChild(heading);

    const table = document.createElement("table");
    table.className = "availability-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    getWeekdays().forEach((day) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = day;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const daysInMonth = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      0
    ).getDate();
    const leadingBlanks = getWeekdayIndex(firstDay);
    const totalCells = leadingBlanks + daysInMonth;
    const trailingBlanks = (7 - (totalCells % 7)) % 7;
    const totalSlots = totalCells + trailingBlanks;
    let dayCounter = 1;

    // Iterate over each cell slot (including leading/trailing blanks).
    for (let slot = 0; slot < totalSlots; slot += 1) {
      if (slot % 7 === 0) {
        const row = document.createElement("tr");
        tbody.appendChild(row);
      }

      const row = tbody.lastElementChild;
      const td = document.createElement("td");
      if (slot < leadingBlanks || dayCounter > daysInMonth) {
        td.className = "empty";
      } else {
        const date = new Date(
          monthDate.getFullYear(),
          monthDate.getMonth(),
          dayCounter
        );
        td.textContent = String(dayCounter);
        applyDayState(td, date, today, ranges);
        dayCounter += 1;
      }
      row.appendChild(td);
    }

    table.appendChild(tbody);
    monthCard.appendChild(table);
    container.appendChild(monthCard);
  }
}

// Ensure a legend exists for the current block.
function ensureLegend(root) {
  if (!root) return;
  const existing = root.querySelector(".availability-legend");
  if (existing) return;
  const legend = createLegend();
  root.appendChild(legend);
}

// Apply CSS classes to indicate booking/past/today states for a cell.
function applyDayState(td, date, today, ranges) {
  // Flag each day cell based on booking status, past dates, and today.
  if (date < today) {
    td.classList.add("past");
    td.setAttribute("aria-label", `${dateLabel(date)} (past date)`);
    return;
  }
  if (isBooked(date, ranges)) {
    td.classList.add("booked");
    td.setAttribute("aria-label", `${dateLabel(date)} (booked)`);
  } else {
    decorateFreeDay(td, date);
    td.setAttribute("aria-label", `${dateLabel(date)} (available)`);
  }

  if (isSameDay(date, today)) {
    td.classList.add("today");
  }
}

// Determine whether a date falls inside any booked half-open range.
function isBooked(date, ranges) {
  return ranges.some(({ start, end }) => date >= start && date < end);
}

// Compare two dates ignoring the time portion.
function isSameDay(a, b) {
  // Strict comparison by calendar day (ignore time component).
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Format a date label for accessibility/tooltip text.
function dateLabel(date) {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Provide weekday abbreviations (Monday-first).
function getWeekdays() {
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
}

// Convert JS day-of-week (Sunday-first) to Monday-first index.
function getWeekdayIndex(date) {
  const day = date.getDay(); // 0 (Sun) - 6 (Sat)
  return (day + 6) % 7; // convert to Monday-first
}

// Build the legend UI showing booked/today states.
function createLegend() {
  // Small legend describing booked/today states.
  const legend = document.createElement("div");
  legend.className = "availability-legend";

  const booked = document.createElement("span");
  booked.className = "legend-item";
  booked.innerHTML =
    '<span class="legend-swatch booked"></span><span>Booked</span>';

  const today = document.createElement("span");
  today.className = "legend-item";
  today.innerHTML =
    '<span class="legend-swatch today"></span><span>Today</span>';

  legend.appendChild(booked);
  legend.appendChild(today);
  return legend;
}

// Derive a human-friendly property label from DOM attributes or fallback slug.
function getPropertyLabel(root, slug) {
  if (!root) return slug || "";
  const label = root.getAttribute("data-property-label");
  if (label) return label;
  if (!slug) return "";
  return slug
    .split(/[-_\s]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// Mark a day cell as selectable and annotate it with metadata for range selection.
function decorateFreeDay(td, date) {
  td.classList.add("free-day");
  td.setAttribute("role", "button");
  td.tabIndex = 0;
  td.setAttribute("data-start", formatISODate(date));
}

// Remove previously applied range highlight classes within a calendar.
function clearVisualRange(container) {
  if (!container) return;
  container
    .querySelectorAll(
      ".range-start, .range-mid, .range-end, .range-single"
    )
    .forEach((cell) => {
      cell.classList.remove(
        "range-start",
        "range-mid",
        "range-end",
        "range-single"
      );
    });
}

// Highlight the inclusive date range across free-day cells.
function markVisualRange(container, startISO, endISO) {
  if (!container || !startISO) return;
  const startDate = toLocalDate(startISO);
  const endDate = toLocalDate(endISO || startISO);
  if (!startDate || !endDate || endDate < startDate) return;

  const cells = [];
  const cursor = new Date(startDate);
  const final = new Date(endDate);

  while (cursor <= final) {
    const iso = formatISODate(cursor);
    const cell = container.querySelector(`.free-day[data-start="${iso}"]`);
    if (cell) cells.push(cell);
    cursor.setDate(cursor.getDate() + 1);
  }

  if (!cells.length) return;

  if (cells.length === 1) {
    cells[0].classList.add("range-single");
    return;
  }

  cells[0].classList.add("range-start");
  cells[cells.length - 1].classList.add("range-end");

  for (let i = 1; i < cells.length - 1; i += 1) {
    cells[i].classList.add("range-mid");
  }
}

const rangeSelectionStates = new WeakMap();

// Make sure the inline CTA bar exists (or create it) and return its controls.
function ensureAvailabilityCTA(root) {
  if (!root) return null;
  let bar = root.querySelector("[data-availability-cta]");
  const calendar = root.querySelector("[data-availability-calendar]");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "availability-cta";
    bar.setAttribute("data-availability-cta", "");
    bar.hidden = true;

    const summary = document.createElement("p");
    summary.className = "availability-cta-summary";
    summary.setAttribute("data-availability-summary", "");
    bar.appendChild(summary);

    const actions = document.createElement("div");
    actions.className = "availability-cta-actions";

    const sendBtn = document.createElement("button");
    sendBtn.type = "button";
    sendBtn.className = "btn";
    sendBtn.setAttribute("data-availability-send", "");
    sendBtn.textContent = "Send via WhatsApp";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn outline";
    cancelBtn.setAttribute("data-availability-cancel", "");
    cancelBtn.textContent = "Cancel";

    actions.appendChild(sendBtn);
    actions.appendChild(cancelBtn);
    bar.appendChild(actions);

    if (calendar && calendar.parentNode) {
      calendar.parentNode.insertBefore(bar, calendar);
    }
  }

  const summaryEl = bar.querySelector("[data-availability-summary]");
  const sendBtnEl = bar.querySelector("[data-availability-send]");
  const cancelBtnEl = bar.querySelector("[data-availability-cancel]");
  return {
    cta: bar,
    summaryEl,
    sendBtn: sendBtnEl,
    cancelBtn: cancelBtnEl,
  };
}

// Attach click/keyboard handlers that manage availability range selection.
function setupRangeSelection(root, calendarEl, propertyLabel) {
  if (!calendarEl) return;
  const ctaRefs = ensureAvailabilityCTA(root) || {};
  let state = rangeSelectionStates.get(calendarEl);
  if (!state) {
    state = {
      propertyLabel,
      startCell: null,
      endCell: null,
      startDate: null,
      endDate: null,
      cta: ctaRefs.cta || null,
      summaryEl: ctaRefs.summaryEl || null,
      sendBtn: ctaRefs.sendBtn || null,
      cancelBtn: ctaRefs.cancelBtn || null,
    };
    rangeSelectionStates.set(calendarEl, state);

    const hideCTA = () => {
      if (!state.cta) return;
      state.cta.hidden = true;
      state.cta.classList.remove("is-visible");
      if (state.summaryEl) {
        state.summaryEl.textContent = "";
      }
    };

    const showCTA = (startDate, endDate) => {
      if (!state.cta || !state.summaryEl) return;
      const label = state.propertyLabel || propertyLabel || "";
      const startLabel = formatReadableDate(startDate);
      const endLabel = formatReadableDate(endDate);
      state.summaryEl.textContent = `Inquire for ${label} from ${startLabel} to ${endLabel}`;
      state.cta.hidden = false;
      state.cta.classList.add("is-visible");
      if (state.sendBtn && !state.sendBtn.disabled) {
        state.sendBtn.focus({ preventScroll: true });
      }
    };

    const clearSelection = () => {
      clearVisualRange(calendarEl);
      state.startCell = null;
      state.endCell = null;
      state.startDate = null;
      state.endDate = null;
      hideCTA();
    };

    const handleActivation = (cell) => {
      if (!cell || !cell.dataset.start) return;
      const selectedDate = toLocalDate(cell.dataset.start);
      if (!selectedDate) return;
      const selectedISO = formatISODate(selectedDate);

      if (state.startDate && state.endDate) {
        clearSelection();
      }

      if (!state.startDate || selectedDate < state.startDate) {
        clearSelection();
        state.startCell = cell;
        state.startDate = selectedDate;
        clearVisualRange(calendarEl);
        markVisualRange(calendarEl, selectedISO, selectedISO);
        return;
      }

      const isContinuous = isContinuousFreeRange(
        calendarEl,
        state.startDate,
        selectedDate
      );

      if (!isContinuous) {
        clearSelection();
        state.startCell = cell;
        state.startDate = selectedDate;
        clearVisualRange(calendarEl);
        markVisualRange(calendarEl, selectedISO, selectedISO);
        return;
      }

      state.endCell = cell;
      state.endDate = selectedDate;
      clearVisualRange(calendarEl);
      markVisualRange(
        calendarEl,
        formatISODate(state.startDate),
        formatISODate(state.endDate)
      );
      showCTA(state.startDate, state.endDate);
    };

    calendarEl.addEventListener("click", (event) => {
      const target =
        event.target && typeof event.target.closest === "function"
          ? event.target.closest(".free-day")
          : null;
      if (target) {
        handleActivation(target);
        return;
      }

      const navTrigger =
        event.target && typeof event.target.closest === "function"
          ? event.target.closest("[data-availability-nav]")
          : null;
      if (navTrigger) {
        clearSelection();
      }
    });

    calendarEl.addEventListener("keydown", (event) => {
      const target =
        event.target && typeof event.target.closest === "function"
          ? event.target.closest(".free-day")
          : null;

      if (event.key === "Escape") {
        event.preventDefault();
        clearSelection();
        if (target) {
          target.classList.remove("is-selecting");
          if (typeof target.blur === "function") {
            target.blur();
          }
        }
        return;
      }

      if (!target) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleActivation(target);
      }
    });

    root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (typeof state.clearSelection === "function") {
        event.preventDefault();
        state.clearSelection();
      }
    });

    state.clearSelection = clearSelection;
    state.showCTA = showCTA;
    state.hideCTA = hideCTA;
  } else {
    state.cta = ctaRefs.cta || state.cta || null;
    state.summaryEl = ctaRefs.summaryEl || state.summaryEl || null;
    state.sendBtn = ctaRefs.sendBtn || state.sendBtn || null;
    state.cancelBtn = ctaRefs.cancelBtn || state.cancelBtn || null;
  }

  if (state.sendBtn && !state.sendBtn.dataset.availabilityBound) {
    state.sendBtn.dataset.availabilityBound = "true";
    state.sendBtn.addEventListener("click", () => {
      if (!state.startDate || !state.endDate) return;
      const label = state.propertyLabel || propertyLabel || "";
      const launched = openWhatsApp(label, state.startDate, state.endDate);
      if (!launched) {
        console.warn("WhatsApp contact number is not available.");
      }
      if (typeof state.clearSelection === "function") {
        state.clearSelection();
      }
    });
  }

  if (state.cancelBtn && !state.cancelBtn.dataset.availabilityBound) {
    state.cancelBtn.dataset.availabilityBound = "true";
    state.cancelBtn.addEventListener("click", () => {
      if (typeof state.clearSelection === "function") {
        state.clearSelection();
      }
    });
  }

  state.propertyLabel = propertyLabel;
  if (typeof state.clearSelection === "function") {
    state.clearSelection();
  }
}

// Ensure the chosen start and end dates cover an uninterrupted free-day span.
function isContinuousFreeRange(container, startDate, endDate) {
  if (!container || !startDate || !endDate) return false;
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const limit = new Date(endDate);
  limit.setHours(0, 0, 0, 0);

  while (cursor <= limit) {
    const selector = `.free-day[data-start="${formatISODate(cursor)}"]`;
    const cell = container.querySelector(selector);
    if (!cell) return false;
    cursor.setDate(cursor.getDate() + 1);
  }
  return true;
}

// Extract the WhatsApp number already wired into the contact link.
function resolveWhatsAppNumber() {
  const link = document.querySelector('[data-contact="whatsapp"]');
  if (!link) return null;
  const href = link.getAttribute("href") || "";
  const match = href.match(/wa\.me\/(\d+)/);
  if (match && match[1]) {
    return match[1];
  }
  const text = link.textContent || "";
  const digits = text.replace(/\D+/g, "");
  return digits || null;
}

// Launch a WhatsApp inquiry pre-filled with the selected property and dates.
function openWhatsApp(propertyLabel, startDate, endDate) {
  const number = resolveWhatsAppNumber();
  if (!number) return false;
  const labelText = propertyLabel || "your property";
  const startLabel = formatReadableDate(startDate);
  const endLabel = formatReadableDate(endDate);
  const message = [
    "Hello!",
    `I'm interested in ${labelText} for the period`,
    `- ${startLabel} to`,
    `- ${endLabel}`,
  ].join("\n");
  const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  const win = window.open(url, "_blank", "noopener");
  if (win && typeof win.opener !== "undefined") {
    win.opener = null;
  }
  return true;
}

// Convert a Date to a YYYY-MM-DD string used for data attributes.
function formatISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Render a Date in a human-readable "25 October 2025" format.
function formatReadableDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const day = date.getDate();
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

// Initialize widgets once the DOM is ready.
if (document.readyState === "loading") {
  // Wait for DOMContentLoaded if the script loads in <head>.
  document.addEventListener("DOMContentLoaded", initAvailabilityBlocks, {
    once: true,
  });
} else {
  initAvailabilityBlocks();
}
