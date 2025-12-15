// KV-backed availability read endpoint.

export async function onRequest({ request, env }) {
  if (request.method !== "GET") {
    return jsonResponse({ ok: false, error: "method" }, 405);
  }

  const kv = env.AVAIL_KV;
  if (!kv || typeof kv.get !== "function") {
    return jsonResponse({ ok: false, error: "kv_missing" }, 500);
  }

  const url = new URL(request.url);
  const rawSlug = url.searchParams.get("slug") || "";
  const slug = normalizeSlug(rawSlug);
  if (!slug || (slug !== "blue-dream" && slug !== "studio-9")) {
    return jsonResponse({ ok: false, error: "invalid_slug" }, 400);
  }

  const key = `avail:${slug}:booked`;
  let bookedRaw = "[]";
  try {
    const stored = await kv.get(key);
    if (stored) {
      bookedRaw = stored;
    }
  } catch (_err) {
    return jsonResponse({ ok: false, error: "kv_read_failed" }, 500);
  }

  let booked;
  try {
    booked = JSON.parse(bookedRaw);
  } catch (_err) {
    return jsonResponse({ ok: false, error: "parse_error" }, 500);
  }

  return jsonResponse(
    { ok: true, slug, key, booked },
    200,
    {
      "Cache-Control": "public, max-age=60",
      Vary: "Accept-Encoding",
    }
  );
}

function normalizeSlug(value) {
  if (!value) return "";
  const raw = String(value).trim().toLowerCase();
  if (raw === "studio9" || raw === "studio-9") return "studio-9";
  if (raw === "blue-dream") return "blue-dream";
  return raw.replace(/\s+/g, "-");
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
