// Scheduled Worker: sync Airbnb + Booking iCal feeds into KV for availability.
// KV schema (do not change):
// - avail:studio-9:booked
// - avail:blue-dream:booked
// - avail:{slug}:last_sync
// - avail:{slug}:sync_status
// booked shape: [{ start: "YYYY-MM-DD", end: "YYYY-MM-DD" }] (half-open)
// sync_status: { ok: bool, ts, message, source: "airbnb+booking", booking_hash?, changed, feeds: {airbnb: {...}, booking: {...}} }

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // Manual sync endpoint: GET /sync or POST /sync
    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/sync") {
      const kv = env.AVAIL_KV;
      if (!kv || typeof kv.put !== "function") {
        return jsonResponse({ ok: false, error: "KV binding AVAIL_KV missing" }, 500);
      }

      const props = [
        {
          slug: "blue-dream",
          feeds: [
            { source: "airbnb", url: env.BLUE_DREAM_ICAL_URL_AIRBNB },
            { source: "booking", url: env.BLUE_DREAM_ICAL_URL_BOOKING },
          ],
        },
        {
          slug: "studio-9",
          feeds: [
            { source: "airbnb", url: env.STUDIO_9_ICAL_URL_AIRBNB },
            { source: "booking", url: env.STUDIO_9_ICAL_URL_BOOKING },
          ],
        },
      ];

      const results = {};
      for (const prop of props) {
        try {
          await syncProperty(prop, kv, env);
          results[prop.slug] = { ok: true };
        } catch (err) {
          results[prop.slug] = { ok: false, error: err?.message || String(err) };
        }
      }

      return jsonResponse({ ok: true, synced: results });
    }

    // Default: show help message
    url.pathname = "/__scheduled";
    url.searchParams.append("cron", "* * * * *");
    return new Response(
      `Availability sync worker.\n\nEndpoints:\n- GET /sync — Manually trigger sync for all properties\n- POST /sync — Same as GET\n\nScheduled sync runs every 15 minutes (*/15 * * * *).\n`
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
        feeds: [
          { source: "airbnb", url: env.BLUE_DREAM_ICAL_URL_AIRBNB },
          { source: "booking", url: env.BLUE_DREAM_ICAL_URL_BOOKING },
        ],
      },
      {
        slug: "studio-9",
        feeds: [
          { source: "airbnb", url: env.STUDIO_9_ICAL_URL_AIRBNB },
          { source: "booking", url: env.STUDIO_9_ICAL_URL_BOOKING },
        ],
      },
    ];

    for (const prop of props) {
      await syncProperty(prop, kv, env);
    }
  },
};

async function syncProperty(prop, kv, env) {
  const { slug, feeds } = prop;
  const statusKey = `avail:${slug}:sync_status`;
  const bookedKey = `avail:${slug}:booked`;
  const lastKey = `avail:${slug}:last_sync`;

  // Track per-feed status
  const feedsStatus = {};
  const allRanges = [];
  let feedHashParts = [];
  let feedCount = 0;
  let successCount = 0;

  // Process each feed
  for (const feed of feeds) {
    const { source, url } = feed;
    feedsStatus[source] = { ok: false };

    if (!url) {
      feedsStatus[source].error = "missing_url";
      console.warn("feed_missing_url", { slug, source });
      continue;
    }

    feedCount++;
    let icsText;
    let feedHash;

    // Fetch with timeout
    try {
      icsText = await fetchWithTimeout(url, 8000);
      feedHash = await sha256Hex(icsText);
      feedsStatus[source].feed_hash = `sha256:${feedHash}`;
      feedHashParts.push(`${source}\n${feedHash}`);
    } catch (err) {
      feedsStatus[source].error = err?.message || String(err);
      console.error("feed_fetch_error", { slug, source, msg: feedsStatus[source].error });
      continue;
    }

    // Parse and normalize
    let ranges;
    try {
      ranges = normalizeRanges(parseICS(icsText));
      allRanges.push(...ranges);
      feedsStatus[source].ok = true;
      successCount++;
    } catch (err) {
      feedsStatus[source].error = err?.message || String(err);
      console.error("feed_parse_error", { slug, source, msg: feedsStatus[source].error });
      continue;
    }
  }

  // If no feeds succeeded, fail the property
  if (successCount === 0) {
    await writeStatus(
      kv,
      statusKey,
      false,
      "airbnb+booking",
      "all_feeds_failed",
      null,
      false,
      feedsStatus
    );
    await sendTelegram(env, `❌ Availability sync failed for ${slug}: all feeds failed`);
    return;
  }

  // Merge all ranges (union)
  let mergedRanges;
  try {
    mergedRanges = normalizeRanges(allRanges);
  } catch (err) {
    console.error("merge_error", { slug, msg: err?.message || String(err) });
    await writeStatus(
      kv,
      statusKey,
      false,
      "airbnb+booking",
      "merge_error",
      null,
      false,
      feedsStatus
    );
    await sendTelegram(env, `❌ Availability sync failed for ${slug}: merge error`);
    return;
  }

  // Compute booking hash
  let bookingHash;
  try {
    bookingHash = await sha256Hex(JSON.stringify(mergedRanges));
  } catch (err) {
    console.error("hash_error", { slug, msg: err?.message || String(err) });
    await writeStatus(
      kv,
      statusKey,
      false,
      "airbnb+booking",
      "hash_error",
      null,
      false,
      feedsStatus
    );
    await sendTelegram(env, `❌ Availability sync failed for ${slug}: hash_error`);
    return;
  }

  // Compute combined feed hash deterministically
  let combinedFeedHash;
  try {
    feedHashParts.sort();
    combinedFeedHash = await sha256Hex(feedHashParts.join("\n"));
  } catch (err) {
    console.error("feed_hash_error", { slug, msg: err?.message || String(err) });
    combinedFeedHash = null;
  }

  // Check if booking content is unchanged
  try {
    const previousStatusJson = await kv.get(statusKey);
    const previousStatus = previousStatusJson ? JSON.parse(previousStatusJson) : null;
    const previousBookingHash = previousStatus?.booking_hash?.replace("sha256:", "");

    const changed = previousBookingHash !== bookingHash;
    const message = successCount < feedCount ? "partial" : "ok";

    if (!changed) {
      // Bookings unchanged, skip booked/last_sync writes
      await writeStatus(
        kv,
        statusKey,
        true,
        "airbnb+booking",
        "unchanged",
        bookingHash,
        false,
        feedsStatus,
        combinedFeedHash
      );
      console.info("sync_unchanged", { slug, feedsSuccess: successCount, feedsTotal: feedCount });
    } else {
      // Bookings changed or first sync, write booked ranges
      await kv.put(bookedKey, JSON.stringify(mergedRanges));
      await kv.put(lastKey, new Date().toISOString());
      await writeStatus(
        kv,
        statusKey,
        true,
        "airbnb+booking",
        message,
        bookingHash,
        true,
        feedsStatus,
        combinedFeedHash
      );
      console.info("sync_ok", { slug, count: mergedRanges.length, feedsSuccess: successCount, feedsTotal: feedCount });
    }
  } catch (err) {
    console.error("kv_write_error", { slug, msg: err?.message || String(err) });
    await writeStatus(
      kv,
      statusKey,
      false,
      "airbnb+booking",
      "kv_write_error",
      null,
      false,
      feedsStatus,
      combinedFeedHash
    );
    await sendTelegram(env, `❌ Availability sync failed for ${slug}: kv_write_error`);
  }
}

async function writeStatus(
  kv,
  key,
  ok,
  source,
  message,
  bookingHash = null,
  changed = false,
  feedsStatus = null,
  combinedFeedHash = null
) {
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
  if (combinedFeedHash) {
    payload.feed_hash = `sha256:${combinedFeedHash}`;
  }
  if (feedsStatus && Object.keys(feedsStatus).length > 0) {
    payload.feeds = feedsStatus;
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
    if (r.start < last.end) {
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

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
