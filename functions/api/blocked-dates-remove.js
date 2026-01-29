// POST /api/blocked-dates/remove
// Remove a blocked date range from a property
// Body: { slug, start, end, token }

export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method" }, 405);
  }

  const kv = env.AVAIL_KV;
  if (!kv) {
    return jsonResponse({ ok: false, error: "kv_missing" }, 500);
  }

  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const { slug, start, end, token } = body;

  // Validate auth token
  if (token !== env.KOMOHAVEN_AUTH_TOKEN) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  // Validate slug
  const normalized = normalizeSlug(slug);
  if (!normalized || (normalized !== "blue-dream" && normalized !== "studio-9")) {
    return jsonResponse({ ok: false, error: "invalid_slug" }, 400);
  }

  // Validate dates
  if (!isValidDate(start) || !isValidDate(end)) {
    return jsonResponse({ ok: false, error: "invalid_date_format" }, 400);
  }

  if (start >= end) {
    return jsonResponse({ ok: false, error: "start_after_end" }, 400);
  }

  try {
    const key = `blocked:${normalized}:dates`;
    const currentRaw = await kv.get(key) || "[]";
    let current = JSON.parse(currentRaw);

    // Remove/subtract the range
    current = subtractRange(current, { start, end });

    // Write back to KV
    await kv.put(key, JSON.stringify(current));

    return jsonResponse({
      ok: true,
      slug: normalized,
      blocked: current,
    });
  } catch (err) {
    console.error("Block remove error:", err);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

function normalizeSlug(value) {
  if (!value) return "";
  const raw = String(value).trim().toLowerCase();
  if (raw === "studio9" || raw === "studio-9") return "studio-9";
  if (raw === "blue-dream") return "blue-dream";
  return raw.replace(/\s+/g, "-");
}

function isValidDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr + "T00:00:00Z");
  return d instanceof Date && !isNaN(d.getTime());
}

function subtractRange(ranges, toRemove) {
  if (!ranges || ranges.length === 0) return [];

  const result = [];

  for (const range of ranges) {
    // No overlap: keep the range as-is
    if (range.end <= toRemove.start || range.start >= toRemove.end) {
      result.push(range);
      continue;
    }

    // Partial overlap: split the range
    if (range.start < toRemove.start) {
      result.push({ start: range.start, end: toRemove.start });
    }

    if (range.end > toRemove.end) {
      result.push({ start: toRemove.end, end: range.end });
    }
  }

  return result;
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}
