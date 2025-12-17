// Scheduled Worker: sync Airbnb iCal feeds into KV for availability.
// KV schema (do not change):
// - avail:studio-9:booked
// - avail:blue-dream:booked
// - avail:{slug}:last_sync
// - avail:{slug}:sync_status
// booked shape: [{ start: "YYYY-MM-DD", end: "YYYY-MM-DD" }] (half-open)
// sync_status: { ok: bool, ts, message, source, booking_hash?, feed_hash? }

export default {
  async fetch(req) {
    const url = new URL(req.url);
    url.pathname = "/__scheduled";
    url.searchParams.append("cron", "* * * * *");
    return new Response(
      `To test the scheduled handler, run curl "${url.href}" after enabling --test-scheduled.`
    );
  },

  async scheduled(_event, env) {
    const kv = env.AVAIL_KV;
    if (!kv || typeof kv.put !== "function") {
      console.error("KV binding AVAIL_KV missing");
      return;
    }

    const props = [
      {
        slug: "blue-dream",
        url: env.BLUE_DREAM_ICAL_URL_AIRBNB,
        source: "airbnb",
      },
      {
        slug: "studio-9",
        url: env.STUDIO_9_ICAL_URL_AIRBNB,
        source: "airbnb",
      },
    ];

    for (const prop of props) {
      await syncProperty(prop, kv, env);
    }
  },
};

async function syncProperty(prop, kv, env) {
  const { slug, url, source } = prop;
  const statusKey = `avail:${slug}:sync_status`;
  const bookedKey = `avail:${slug}:booked`;
  const lastKey = `avail:${slug}:last_sync`;

  if (!url) {
    await writeStatus(kv, statusKey, false, source, "missing_url");
    await sendTelegram(env, `❌ Availability sync failed for ${slug}: missing URL`);
    return;
  }

  let icsText;
  let feedHash = null;
  try {
    icsText = await fetchWithTimeout(url, 8000);
    feedHash = await sha256Hex(icsText);
  } catch (err) {
    console.error("fetch_error", { slug, msg: err?.message || String(err) });
    await writeStatus(kv, statusKey, false, source, "fetch_error");
    await sendTelegram(env, `❌ Availability sync failed for ${slug}: fetch_error`);
    return;
  }

  let ranges;
  try {
    ranges = normalizeRanges(parseICS(icsText));
  } catch (err) {
    console.error("parse_error", { slug, msg: err?.message || String(err) });
    await writeStatus(kv, statusKey, false, source, "parse_error", null, feedHash);
    await sendTelegram(env, `❌ Availability sync failed for ${slug}: parse_error`);
    return;
  }

  let bookingHash;
  try {
    bookingHash = await sha256Hex(JSON.stringify(ranges));
  } catch (err) {
    console.error("hash_error", { slug, msg: err?.message || String(err) });
    await writeStatus(kv, statusKey, false, source, "hash_error", null, feedHash);
    await sendTelegram(env, `❌ Availability sync failed for ${slug}: hash_error`);
    return;
  }

  try {
    // Check if booking content is unchanged
    const previousStatusJson = await kv.get(statusKey);
    const previousStatus = previousStatusJson ? JSON.parse(previousStatusJson) : null;
    const previousBookingHash = previousStatus?.booking_hash?.replace("sha256:", "");

    const changed = previousBookingHash !== bookingHash;

    if (!changed) {
      // Bookings unchanged, skip booked/last_sync writes
      await writeStatus(kv, statusKey, true, source, "unchanged", bookingHash, feedHash, false);
      console.info("sync_unchanged", { slug });
    } else {
      // Bookings changed or first sync, write booked ranges
      await kv.put(bookedKey, JSON.stringify(ranges));
      await kv.put(lastKey, new Date().toISOString());
      await writeStatus(kv, statusKey, true, source, "ok", bookingHash, feedHash, true);
      console.info("sync_ok", { slug, count: ranges.length });
    }
  } catch (err) {
    console.error("kv_write_error", { slug, msg: err?.message || String(err) });
    await writeStatus(kv, statusKey, false, source, "kv_write_error", null, feedHash, false);
    await sendTelegram(env, `❌ Availability sync failed for ${slug}: kv_write_error`);
  }
}

async function writeStatus(kv, key, ok, source, message, bookingHash = null, feedHash = null, changed = false) {
  const payload = {
    ok,
    ts: new Date().toISOString(),
    message,
    source,
    changed,
  };
  if (bookingHash) {
    payload.booking_hash = `sha256:${bookingHash}`;
  }
  if (feedHash) {
    payload.feed_hash = `sha256:${feedHash}`;
  }
  await kv.put(key, JSON.stringify(payload));
}

async function fetchWithTimeout(url, ms) {
  const backoffs = [0, 250, 750];
  let lastErr;
  for (let attempt = 0; attempt < backoffs.length; attempt += 1) {
    if (backoffs[attempt] > 0) {
      await new Promise((r) => setTimeout(r, backoffs[attempt]));
    }
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok) {
        clearTimeout(t);
        return await res.text();
      }
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        clearTimeout(t);
        continue;
      }
      // other 4xx: do not retry
      clearTimeout(t);
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
      clearTimeout(t);
      // Fail immediately on non-retryable HTTP errors (4xx)
      if (err.message.startsWith("HTTP ")) {
        break;
      }
      // Retry on network/abort errors if not on last attempt
      if (attempt === backoffs.length - 1) break;
    }
  }
  throw lastErr || new Error("fetch failed");
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
          events.push({ start, end });
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
  // Fallback for ISO-like strings; use UTC parts to avoid TZ shifts.
  const parsed = new Date(v);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatUTC(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeRanges(ranges) {
  const sorted = (ranges || [])
    .filter((r) => r && r.start && r.end)
    .map((r) => ({ start: r.start, end: r.end }))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  const merged = [];
  for (const r of sorted) {
    if (!merged.length) {
      merged.push(r);
      continue;
    }
    const last = merged[merged.length - 1];
    if (r.start <= last.end) {
      if (r.end > last.end) {
        last.end = r.end;
      }
    } else {
      merged.push(r);
    }
  }

  // Deduplicate identical ranges
  const deduped = [];
  let prev = null;
  for (const r of merged) {
    if (!prev || prev.start !== r.start || prev.end !== r.end) {
      deduped.push(r);
      prev = r;
    }
  }

  return deduped;
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text || "");
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sendTelegram(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
    });
  } catch (_err) {
    // best-effort
  }
}
