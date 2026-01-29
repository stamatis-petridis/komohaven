// GET /api/availability.ics?slug=blue-dream
// Returns iCal (VEVENT) file with merged booked + blocked dates
// This feed can be imported into Airbnb/Booking to sync availability

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

    // Merge booked + blocked
    const allRanges = [...booked, ...blocked];
    const merged = mergeRanges(allRanges);

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
      last.end = current.end > last.end ? current.end : last.end;
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
    const uid = `${slug}-blocked-${idx}-${now}@komohaven.pages.dev`;

    icalContent += `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${now}
DTSTART;VALUE=DATE:${dtStart}
DTEND;VALUE=DATE:${dtEnd}
SUMMARY:Unavailable
DESCRIPTION:Date range unavailable for booking
TRANSP:OPAQUE
STATUS:CONFIRMED
END:VEVENT
`;
  });

  icalContent += `END:VCALENDAR
`;

  return icalContent;
}
