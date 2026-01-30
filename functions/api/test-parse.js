export async function onRequest({ request, env }) {
  try {
    const text = await fetch(env.STUDIO_9_ICAL_URL_AIRBNB).then(r => r.text());
    const events = parseICS(text);
    return new Response(JSON.stringify(events, null, 2), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
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
          
          const description = current.DESCRIPTION || "";
          
          const reservationMatch = description.match(/\/details\/([A-Z0-9]+)/);
          if (reservationMatch) {
            event.reservation_id = reservationMatch[1];
          }
          
          const phoneMatch = description.match(/Phone Number[^:]*:\s*(.+?)(?:\n|\\n|$)/);
          if (phoneMatch) {
            event.phone = phoneMatch[1].trim();
          }
          
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
  if (/^\d{8}$/.test(v)) {
    return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  }
  if (/^\d{8}T\d{4}Z?$/.test(v) || /^\d{8}T\d{6}Z?$/.test(v)) {
    return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  }
  const parsed = new Date(v);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
