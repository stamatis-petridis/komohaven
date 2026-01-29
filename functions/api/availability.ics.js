// GET /api/availability.ics?slug=blue-dream&blocked-only=1&booked-only=1
// Returns iCal (VEVENT) file with booked + blocked dates
// Query params:
//   - blocked-only=1 : Only manual blocks
//   - booked-only=1 : Only platform bookings

export async function onRequest({ request, env }) {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const kv = env.AVAIL_KV;
  if (!kv) {
    return new Response("KV not available", { status: 500 });
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
    // Fetch booked dates
    const bookedKey = `avail:${slug}:booked`;
    const bookedRaw = await kv.get(bookedKey) || "[]";
    const booked = JSON.parse(bookedRaw);

    // Fetch blocked dates
    const blockedKey = `blocked:${slug}:dates`;
    const blockedRaw = await kv.get(blockedKey) || "[]";
    const blocked = JSON.parse(blockedRaw);

    // Filter based on query params
    let ranges = [];

    if (!blockedOnly) {
      // Include booked dates with source field
      ranges.push(...booked.map(r => ({ ...r, type: "booked" })));
    }

    if (!bookedOnly) {
      // Include blocked dates (manual blocks have no source, mark as manual)
      ranges.push(...blocked.map(r => ({ ...r, type: "blocked", source: "manual" })));
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

function normalizeSlug(value) {
  if (!value) return "";
  const raw = String(value).trim().toLowerCase();
  if (raw === "studio9" || raw === "studio-9") return "studio-9";
  if (raw === "blue-dream") return "blue-dream";
  return raw.replace(/\s+/g, "-");
}

function mergeRanges(ranges) {
  if (!ranges || ranges.length === 0) return [];

  const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start));
  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      // Overlapping - extend end date, keep first source encountered
      if (current.end > last.end) {
        last.end = current.end;
      }
      if (current.source && !last.source) {
        last.source = current.source;
      }
    } else {
      merged.push(current);
    }
  }

  return merged;
}

function dateToIcalFormat(dateStr) {
  // Convert YYYY-MM-DD to YYYYMMDD for iCal
  return dateStr.replace(/-/g, "");
}

function getSummary(event) {
  // Generate SUMMARY based on event type and source
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
  // Build description with all available metadata
  let desc = `Date range unavailable for booking (${event.type}`;
  
  if (event.source) {
    desc += ` - ${event.source}`;
  }
  
  // Add reservation ID if available
  if (event.reservation_id) {
    desc += `\nReservation ID: ${event.reservation_id}`;
  }
  
  // Add phone if available
  if (event.phone) {
    desc += `\nPhone: ${event.phone}`;
  }
  
  // Add original reservation URL if available
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

  // Add VEVENT for each unavailable range
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
