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

  try {
    const { updated, booked } = await fetchAvailability(slug);
    const ranges = normalizeRanges(booked);
    renderCalendar(calendarEl, ranges);
    ensureLegend(root);
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
    ? `Booked dates are highlighted below. Updated ${updatedLabel || "recently"}.`
    : `No bookings on the calendar yet. Updated ${updatedLabel || "recently"}.`;

  noteEls.forEach((el) => {
    el.textContent = message;
  });
}

// Render a multi-month calendar highlighting booked ranges.
function renderCalendar(container, ranges, { months = 4 } = {}) {
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

// Initialize widgets once the DOM is ready.
if (document.readyState === "loading") {
  // Wait for DOMContentLoaded if the script loads in <head>.
  document.addEventListener("DOMContentLoaded", initAvailabilityBlocks, {
    once: true,
  });
} else {
  initAvailabilityBlocks();
}
