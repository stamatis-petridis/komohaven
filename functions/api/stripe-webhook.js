// Stripe webhook handler for Telegram alerts + KV booking persistence.
// Important: Stripe signing secrets are per-endpoint and per-mode (test/live).
// If STRIPE_WEBHOOK_SECRET does not match the active webhook endpoint, verification
// will now fail loudly (HTTP 400) with structured logs and an optional Telegram alert.
// Required env secrets/bindings:
// - STRIPE_WEBHOOK_SECRET
// - TELEGRAM_BOT_TOKEN
// - TELEGRAM_CHAT_ID
// - PAYMENTS_KV (optional; used for idempotency + booking storage)

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const processedInMemory = new Set();

export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const rawBuffer = await request.arrayBuffer();
  const payload = decoder.decode(rawBuffer);
  const sig = request.headers.get("stripe-signature");
  const signingSecret = env.STRIPE_WEBHOOK_SECRET;

  if (!signingSecret) {
    return jsonResponse({ error: "Missing STRIPE_WEBHOOK_SECRET" }, 500);
  }

  if (!sig) {
    console.error(
      JSON.stringify({
        scope: "stripe_webhook_missing_sig",
        host: safeHost(request.url),
        cfRay: request.headers.get("cf-ray") || null,
      })
    );
    await bumpCounter(env, "webhook:missing_signature");
    return new Response("Missing Stripe signature", { status: 400 });
  }

  let event;
  try {
    event = await constructEvent(payload, sig, signingSecret);
  } catch (err) {
    const sigPrefix = typeof sig === "string" ? sig.slice(0, 24) : "none";
    const secretPrefix =
      typeof signingSecret === "string" ? signingSecret.slice(0, 12) : "none";
    console.error(
      JSON.stringify({
        scope: "stripe_webhook_sigfail",
        host: safeHost(request.url),
        cfRay: request.headers.get("cf-ray") || null,
        msg: err?.message || String(err),
        sigPrefix,
        secretPrefix,
        contentLengthBytes:
          typeof rawBuffer?.byteLength === "number" ? rawBuffer.byteLength : payload.length || 0,
      })
    );
    await bumpCounter(env, "webhook:bad_signature");
    await sendTelegram(
      env,
      `🚨 Stripe webhook signature FAIL\nhost=${safeHost(
        request.url
      )}\ncf-ray=${request.headers.get("cf-ray") || "unknown"}\nmsg=${
        err?.message || String(err)
      }`
    );
    return new Response("Invalid signature", { status: 400 });
  }

  await bumpCounter(env, "webhook:ok");

  // Only handle successful Checkout payments.
  if (!shouldNotify(event)) {
    return jsonResponse({ received: true });
  }

  const eventId = event.id;
  if (await hasProcessed(env, eventId)) {
    return jsonResponse({ received: true });
  }

  const session = event.data?.object || {};
  const meta = session.metadata || {};
  const currency = (session.currency || "eur").toUpperCase();
  const nights =
    parseIntSafe(meta.nights) ?? deriveNightsFromDates(meta.startISO, meta.endISO);
  const amountCents = Number(session.amount_total) || 0;
  const propertyLabel = resolvePropertyLabel(meta, session.client_reference_id);
  const checkIn = meta.startISO || "";
  const checkOut = meta.endISO || "";
  const customer = session.customer_details || {};
  const fullName =
    getCustomField(session.custom_fields, "full_name") ||
    customer.name ||
    "Unknown guest";

  const message = buildMessage({
    propertyLabel,
    amountCents,
    currency,
    nights,
    checkIn,
    checkOut,
    name: fullName,
    email: customer.email || "",
    phone: customer.phone || "",
  });

  try {
    await persistBooking(env, {
      slug: meta.slug || session.client_reference_id || propertyLabel,
      startISO: checkIn,
      endISO: checkOut,
      nights,
      amountCents,
      currency,
      propertyLabel,
      customer: {
        name: fullName,
        email: customer.email || "",
        phone: customer.phone || "",
      },
      stripe: {
        sessionId: session.id,
        paymentIntent: session.payment_intent || null,
        created: session.created || null,
        livemode: session.livemode ?? null,
      },
    });
    await sendTelegram(env, message);
    await markProcessed(env, eventId);
  } catch (err) {
    console.error("Notification error", err);
  }
  return jsonResponse({ received: true });
}

function shouldNotify(event) {
  if (!event || event.type !== "checkout.session.completed") return false;
  const session = event.data?.object;
  return session && session.payment_status === "paid";
}

async function constructEvent(payload, sigHeader, secret) {
  if (!sigHeader || !secret) {
    throw new Error("Missing signature or secret");
  }
  const parts = parseStripeSigHeader(sigHeader);
  if (!parts.timestamp || !parts.signature) {
    throw new Error("Malformed Stripe-Signature header");
  }
  const signedPayload = `${parts.timestamp}.${payload}`;
  const expectedSig = await signPayload(signedPayload, secret);
  if (!timingSafeEqual(expectedSig, parts.signature)) {
    throw new Error("Signature mismatch");
  }
  return JSON.parse(payload);
}

async function signPayload(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );
  return bufferToHex(signatureBuffer);
}

function parseStripeSigHeader(header) {
  const out = { timestamp: null, signature: null };
  header.split(",").forEach((part) => {
    const [k, v] = part.split("=", 2);
    if (k === "t") out.timestamp = v;
    if (k === "v1") out.signature = v;
  });
  return out;
}

function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function parseIntSafe(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function deriveNightsFromDates(startISO, endISO) {
  if (!startISO || !endISO) return null;
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const diff =
    Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) || 0;
  return diff > 0 ? diff : null;
}

function resolvePropertyLabel(meta, clientReferenceId) {
  if (meta?.propertyLabel) return meta.propertyLabel;
  if (clientReferenceId) {
    const slug = String(clientReferenceId).toLowerCase();
    return slug
      .split(/[-_\s]/)
      .filter(Boolean)
      .map((p) => p[0]?.toUpperCase() + p.slice(1))
      .join(" ");
  }
  if (meta?.slug) {
    return String(meta.slug)
      .split(/[-_\s]/)
      .filter(Boolean)
      .map((p) => p[0]?.toUpperCase() + p.slice(1))
      .join(" ");
  }
  return "Booking";
}

function getCustomField(customFields, key) {
  if (!Array.isArray(customFields)) return null;
  const field = customFields.find((f) => f.key === key);
  const value = field?.text?.value || field?.text?.default_value;
  return value ? String(value).trim() : null;
}

function buildMessage({
  propertyLabel,
  amountCents,
  currency,
  nights,
  checkIn,
  checkOut,
  name,
  email,
  phone,
}) {
  const amount = formatCurrency(amountCents, currency);
  const nightsText =
    nights && nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "N/A";
  const startText = formatDate(checkIn);
  const endText = formatDate(checkOut);

  return [
    "💳 NEW PAYMENT RECEIVED",
    "",
    `🏠  ${propertyLabel || "Booking"}`,
    `💶  ${amount || "Amount TBD"} (${nightsText})`,
    `📅  Check-in: ${startText || "—"}`,
    `     Check-out: ${endText || "—"}`,
    "",
    `👤 ${name || "Unknown guest"}`,
    `📧 ${email || "N/A"}`,
    `📞 ${phone || "N/A"}`,
  ].join("\n");
}

function formatCurrency(amountCents, currency) {
  if (!Number.isFinite(amountCents)) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amountCents / 100);
  } catch (_err) {
    return `${amountCents / 100} ${currency || "EUR"}`;
  }
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

async function sendTelegram(env, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId || !text) return;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(
        JSON.stringify({
          scope: "telegram_error",
          msg: errText,
        })
      );
    }
  } catch (_err) {
    // swallow
  }
}

async function hasProcessed(env, eventId) {
  if (!eventId) return false;
  if (env.PAYMENTS_KV && env.PAYMENTS_KV.get) {
    const found = await env.PAYMENTS_KV.get(eventId);
    return Boolean(found);
  }
  return processedInMemory.has(eventId);
}

async function markProcessed(env, eventId) {
  if (!eventId) return;
  if (env.PAYMENTS_KV && env.PAYMENTS_KV.put) {
    await env.PAYMENTS_KV.put(eventId, "1", { expirationTtl: 60 * 60 * 24 * 30 });
    return;
  }
  processedInMemory.add(eventId);
}

async function persistBooking(env, record) {
  if (!record) return;
  const kv = env.PAYMENTS_KV;
  if (!kv || typeof kv.put !== "function" || typeof kv.get !== "function") {
    console.warn("PAYMENTS_KV not configured; skipping booking persistence.");
    return;
  }
  const slug = normalizeSlug(record.slug) || "unknown";
  const start = record.startISO || "unknown";
  const end = record.endISO || "unknown";
  const key = `booking:${slug}:${start}:${end}`;
  const data = {
    slug,
    propertyLabel: record.propertyLabel || slug,
    startISO: start,
    endISO: end,
    nights: record.nights ?? null,
    amountCents: record.amountCents ?? null,
    currency: record.currency || "EUR",
    customer: record.customer || {},
    stripe: record.stripe || {},
    createdAt: new Date().toISOString(),
  };
  try {
    await kv.put(key, JSON.stringify(data));
  } catch (err) {
    console.error(
      JSON.stringify({
        scope: "kv_write_error",
        key,
        err: err?.message || String(err),
      })
    );
  }

  const indexKey = `bookings:${slug}`;
  let index = [];
  try {
    const existing = await kv.get(indexKey);
    if (existing) {
      const parsed = JSON.parse(existing);
      if (Array.isArray(parsed)) {
        index = parsed;
      }
    }
  } catch (_err) {
    index = [];
  }
  if (!index.includes(key)) {
    index.push(key);
    try {
      await kv.put(indexKey, JSON.stringify(index));
    } catch (err) {
      console.error(
        JSON.stringify({
          scope: "kv_index_write_error",
          indexKey,
          err: err?.message || String(err),
        })
      );
    }
  }
}

function normalizeSlug(value) {
  if (!value) return null;
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch (_err) {
    return "unknown";
  }
}

async function bumpCounter(env, key) {
  const kv = env.PAYMENTS_KV;
  if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") {
    return;
  }
  try {
    const existing = await kv.get(key);
    const value = existing ? Number(existing) || 0 : 0;
    await kv.put(key, String(value + 1), { expirationTtl: 60 * 60 * 24 * 7 });
  } catch (_err) {
    // best-effort; swallow
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Test checklist:
// Local: wrangler pages dev ., stripe listen --forward-to http://localhost:8788/api/stripe-webhook, stripe trigger checkout.session.completed
// Prod: ensure STRIPE_WEBHOOK_SECRET matches the active endpoint; run a test payment, confirm Telegram + KV writes.
// Failure test: set STRIPE_WEBHOOK_SECRET to a wrong value; trigger event; expect 400, structured logs, Telegram alert, and bad_signature counter bump.
