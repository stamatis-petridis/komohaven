// GET /api/blocked-dates/status?slug=studio-9
// Returns blocked dates for a property

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get('slug');

    if (!slug) {
      return jsonResponse({ ok: false, error: 'slug parameter required' }, 400);
    }

    // Validate slug
    if (!['blue-dream', 'studio-9'].includes(slug)) {
      return jsonResponse({ ok: false, error: 'Invalid slug' }, 400);
    }

    // Get KV namespace
    const kv = env.AVAIL_KV;
    if (!kv) {
      return jsonResponse({ ok: false, error: 'KV namespace not configured' }, 500);
    }

    // Fetch blocked dates from KV
    const key = `blocked:${slug}:dates`;
    const value = await kv.get(key);

    let blocked = [];
    if (value) {
      try {
        blocked = JSON.parse(value);
      } catch (err) {
        console.error(`Failed to parse blocked dates for ${slug}:`, err);
        blocked = [];
      }
    }

    return jsonResponse({
      ok: true,
      slug,
      blocked
    });
  } catch (err) {
    console.error('Error in blocked-dates status endpoint:', err);
    return jsonResponse({ ok: false, error: 'Internal server error' }, 500);
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
