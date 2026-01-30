// GET /api/availability.ics?slug=blue-dream&blocked-only=1&booked-only=1
// Returns iCal (VEVENT) file with booked + blocked dates
// Fetches fresh from platform iCals to preserve metadata
// Query params:
//   - blocked-only=1 : Only manual blocks
//   - booked-only=1 : Only platform bookings

export async function onRequest({ request, env }) {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const rawSlug = url.searchParams.get("slug") || "";
  const slug = normalizeSlug(rawSlug);
  const blockedOnly = url.searchParams.get("blocked-only") === "1";
  const bookedOnly = url.searchParams.get("booked-only") === "1";

  if (!slug || (slug !== "blue-dream" && slug !== "studio-9")) {
    return new Response("Invalid slug", { status: 400 });
  }

  try {
    let ranges = [];

    // Fetch platform bookings (fresh from sources)
    if (!blockedOnly) {
      const bookedRanges = await fetchPlatformBookings(slug, env);
      ranges.push(...bookedRanges);
    }

    // Fetch manual blocks from KV
    if (!bookedOnly) {
      const blockedRanges = await fetchManualBlocks(slug, env);
      ranges.push(...blockedRanges);
    }

    // Merge and sort
    const merged = mergeRanges(ranges);

    // Convert to iCal format
    const ical = generateIcal(slug, merged);

    return new Response(ical, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="availability-${slug}.ics"`,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    console.error("iCal generation error:", err);
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}

async function fetchPlatformBookings(slug, env) {
  const ranges = [];
  
  // Map slug to environment variables
  const airbnbKey = slug === "blue-dream" ? "BLUE_DREAM_ICAL_URL_AIRBNB" : "STUDIO_9_ICAL_URL_AIRBNB";
  const bookingKey = slug === "blue-dream" ? "BLUE_DREAM_ICAL_URL_BOOKING" : "STUDIO_9_ICAL_URL_BOOKING";
  
  // Fetch Airbnb
  if (env[airbnbKey]) {
    try {
      const text = await fetch(env[airbnbKey]).then(r => r.text());
      const events = parseICS(text);
      ranges.push(...events.map(e => ({ ...e, type: "booked", source: "airbnb" })));
    } catch (err) {
      console.error(`Failed to fetch Airbnb iCal for ${slug}:`, err);
    }
  }
  
  // Fetch Booking
  if (env[bookingKey]) {
    try {
      const text = await fetch(env[bookingKey]).then(r => r.text());
      const events = parseICS(text);
      ranges.push(...events.map(e => ({ ...e, type: "booked", source: "booking" })));
    } catch (err) {
      console.error(`Failed to fetch Booking iCal for ${slug}:`, err);
    }
  }
  
  return ranges;
}

async function fetchManualBlocks(slug, env) {
  try {
    const kv = env.AVAIL_KV;
    if (!kv) return [];
    
    const blockedKey = `blocked:${slug}:dates`;
    const blockedRaw = await kv.get(blockedKey) || "[]";
    const blocked = JSON.parse(blockedRaw);
    
    return blocked.map(r => ({ ...r, type: "blocked", source: "manual" }));
  } catch (err) {
    console.error(`Failed to fetch manual blocks for ${slug}:`, err);
    return [];
  }
}

function normalizeSlug(value) {
  if (!value) return "";
  const raw = String(value).trim().toLowerCase();
  if (raw === "studio9" || raw === "studio-9") return "studio-9";
  if (raw === "blue-dream") return "blue-dream";
  return raw.replace(/\s+/g, "-");
}

function parseICS(text) {
  const lines = unfold(text || "");
  const events = [];
  let current = {};
  
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "BEGIN:VEVENT") {
      current = {};
    } else if (line === "END:VEVENT") {
      if (current && !isCancelled(current)) {
        const start = extractDate(current, "DTSTART");
        const end = extractDate(current, "DTEND");
        if (start && end && end > start) {
          const event = { start, end };
          
          // Extract metadata from DESCRIPTION
          const description = current.DESCRIPTION || "";
          
          // Extract reservation ID from URL pattern
          const reservationMatch = description.match(/\/details\/([A-Z0-9]+)/);
          if (reservationMatch) {
            event.reservation_id = reservationMatch[1];
          }
          
          // Extract phone (after "Phone Number (Last 4 Digits): ")
          const phoneMatch = description.match(/Phone Number[^:]*:\s*(.+?)(?:\n|\\n|$)/);
          if (phoneMatch) {
            event.phone = phoneMatch[1].trim();
          }
          
          // Extract full reservation URL
          const urlMatch = description.match(/(https:\/\/[^\s\\n]+)/);
          if (urlMatch) {
            event.reservation_url = urlMatch[1];
          }
          
          events.push(event);
        }
      }
      current = {};
    } else {
      const [k, v] = line.split(":", 2);
      if (k && v) current[k] = v;
    }
  }
  return events;
}


function unfold(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function isCancelled(event) {
  return Object.keys(event).some((k) => k.startsWith("STATUS") && event[k] === "CANCELLED");
}

function extractDate(event, key) {
  const entryKey = Object.keys(event).find((k) => k.split(";")[0] === key);
  if (!entryKey) return null;
  return normalizeDate(event[entryKey]);
}

function normalizeDate(value) {
  const v = (value || "").trim();
  if (!v) return null;
  // Date-only
  if (/^\d{8}$/.test(v)) {
    return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  }
  // Date-time (tolerate HHMM or HHMMSS with optional Z)
  if (/^\d{8}T\d{4}Z?$/.test(v) || /^\d{8}T\d{6}Z?$/.test(v)) {
    return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  }
  // Fallback for ISO-like strings
  const parsed = new Date(v);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mergeRanges(ranges) {
  if (!ranges || ranges.length === 0) return [];

  const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start));
  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      // Overlapping - extend end date
      if (current.end > last.end) {
        last.end = current.end;
      }
      // Keep metadata from first range
      if (current.reservation_id && !last.reservation_id) {
        last.reservation_id = current.reservation_id;
      }
      if (current.phone && !last.phone) {
        last.phone = current.phone;
      }
      if (current.reservation_url && !last.reservation_url) {
        last.reservation_url = current.reservation_url;
      }
    } else {
      merged.push(current);
    }
  }

  return merged;
}

function getSummary(event) {
  if (event.type === "booked") {
    if (event.source === "airbnb") return "Booked (Airbnb)";
    if (event.source === "booking") return "Booked (Booking.com)";
    return "Booked";
  }
  if (event.type === "blocked") {
    return "Blocked (Your manual blocks)";
  }
  return "Unavailable";
}

function getDescription(event) {
  let desc = `Date range unavailable for booking (${event.type}`;
  
  if (event.source) {
    desc += ` - ${event.source}`;
  }
  
  if (event.reservation_id) {
    desc += `\nReservation ID: ${event.reservation_id}`;
  }
  
  if (event.phone) {
    desc += `\nPhone: ${event.phone}`;
  }
  
  if (event.reservation_url) {
    desc += `\nURL: ${event.reservation_url}`;
  }
  
  desc += ")";
  return desc;
}

function generateIcal(slug, ranges) {
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const productId = `//KomoHaven/${slug}//EN`;

  let icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-${productId}
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:${slug} Availability
X-WR-TIMEZONE:UTC
BEGIN:VTIMEZONE
TZID:UTC
BEGIN:STANDARD
DTSTART:19700101T000000Z
TZOFFSETFROM:+0000
TZOFFSETTO:+0000
TZNAME:UTC
END:STANDARD
END:VTIMEZONE
`;

  ranges.forEach((range, idx) => {
    const dtStart = dateToIcalFormat(range.start);
    const dtEnd = dateToIcalFormat(range.end);
    const uid = `${slug}-${range.type}-${idx}-${now}@komohaven.pages.dev`;
    const summary = getSummary(range);
    const description = getDescription(range);

    icalContent += `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${now}
DTSTART;VALUE=DATE:${dtStart}
DTEND;VALUE=DATE:${dtEnd}
SUMMARY:${summary}
DESCRIPTION:${description}
TRANSP:OPAQUE
STATUS:CONFIRMED
END:VEVENT
`;
  });

  icalContent += `END:VCALENDAR
`;

  return icalContent;
}

function dateToIcalFormat(dateStr) {
  return dateStr.replace(/-/g, "");
}
