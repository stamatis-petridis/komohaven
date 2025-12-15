// Stripe webhook handler for Telegram alerts.
// Required env secrets/bindings:
// - STRIPE_WEBHOOK_SECRET: signing secret from the Stripe webhook endpoint
// - TELEGRAM_BOT_TOKEN: Telegram bot token
// - TELEGRAM_CHAT_ID: Target chat ID for alerts
// - PAYMENTS_KV (optional): KV binding for idempotency; falls back to in-memory cache

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const processedInMemory = new Set();

export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const sig = request.headers.get("stripe-signature");
  const signingSecret = env.STRIPE_WEBHOOK_SECRET;
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;

  if (!signingSecret) {
    return jsonResponse({ error: "Missing STRIPE_WEBHOOK_SECRET" }, 500);
  }
  if (!botToken || !chatId) {
    return jsonResponse({ error: "Missing Telegram configuration" }, 500);
  }
  if (!sig) {
    return jsonResponse({ error: "Missing Stripe signature" }, 400);
  }

  const rawBody = await request.arrayBuffer();
  const rawString = decoder.decode(rawBody);

  const verified = await verifyStripeSignature(rawString, sig, signingSecret);
  if (!verified) {
    return jsonResponse({ error: "Invalid signature" }, 400);
  }

  let event;
  try {
    event = JSON.parse(rawString);
  } catch (err) {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

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
    parseIntSafe(meta.nights) ??
    deriveNightsFromDates(meta.startISO, meta.endISO);
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
      },
    });
    await sendTelegram(botToken, chatId, message);
    await markProcessed(env, eventId);
    return jsonResponse({ delivered: true });
  } catch (err) {
    console.error("Notification error", err);
    return jsonResponse({ error: "Failed to notify" }, 500);
  }
}

function shouldNotify(event) {
  if (!event || event.type !== "checkout.session.completed") return false;
  const session = event.data?.object;
  return session && session.payment_status === "paid";
}

async function verifyStripeSignature(payload, sigHeader, secret) {
  try {
    const parts = parseStripeSigHeader(sigHeader);
    if (!parts.timestamp || !parts.signature) return false;
    const signedPayload = `${parts.timestamp}.${payload}`;
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
      encoder.encode(signedPayload)
    );
    const expectedSig = bufferToHex(signatureBuffer);
    return timingSafeEqual(expectedSig, parts.signature);
  } catch (_err) {
    return false;
  }
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
  const nightsText = nights && nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "N/A";
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

async function sendTelegram(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
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
    throw new Error(`Telegram error: ${errText}`);
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
  await kv.put(key, JSON.stringify(data));

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
    await kv.put(indexKey, JSON.stringify(index));
  }
}

function normalizeSlug(value) {
  if (!value) return null;
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
