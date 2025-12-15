export async function onRequest({ request, env }) {
  try {
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
        status: 405,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    if (!env || !env.AVAIL_KV) {
      return new Response(JSON.stringify({ ok: false, error: "missing_AVAIL_KV_binding" }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    const ts = new Date().toISOString();
    await env.AVAIL_KV.put("health:last", ts);
    const read = await env.AVAIL_KV.get("health:last");

    return new Response(JSON.stringify({ ok: true, wrote: ts, read }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || String(err) }),
      { status: 500, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }
}
