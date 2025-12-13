// Cloudflare Pages Function: Create a Stripe Checkout Session

export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const secret = env.STRIPE_SECRET_KEY;
  if (!secret) {
    return jsonResponse({ error: "Stripe secret key not configured" }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (_err) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const validation = validatePayload(payload);
  if (!validation.valid) {
    return jsonResponse({ error: validation.error }, 400);
  }

  const {
    slug,
    propertyLabel,
    startISO,
    endISO,
    nights,
    totalCents,
    currency,
  } = validation.data;

  const origin = new URL(request.url).origin;
  const propertyPaths = {
    "blue-dream": "/properties/blue-dream/index.html",
    "studio9": "/properties/studio-9/index.html",
    "studio-9": "/properties/studio-9/index.html",
  };
  const fallbackPath = "/properties/blue-dream/index.html";
  const propertyPath = propertyPaths[slug] || fallbackPath;

  const successUrl = `${origin}${propertyPath}?checkout=success`;
  const cancelUrl = `${origin}${propertyPath}?checkout=cancel`;

  const params = new URLSearchParams();
  params.append("mode", "payment");
  params.append("success_url", successUrl);
  params.append("cancel_url", cancelUrl);
  params.append("payment_method_types[0]", "card");
  params.append("line_items[0][quantity]", "1");
  params.append("line_items[0][price_data][currency]", currency);
  params.append("line_items[0][price_data][unit_amount]", String(totalCents));
  params.append(
    "line_items[0][price_data][product_data][name]",
    `${propertyLabel} — ${startISO} to ${endISO}`
  );

  // Attach booking metadata to the Checkout Session.
  params.append("metadata[slug]", slug);
  params.append("metadata[propertyLabel]", propertyLabel);
  params.append("metadata[startISO]", startISO);
  params.append("metadata[endISO]", endISO);
  params.append("metadata[nights]", String(nights));

  try {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Stripe error", errText);
      return jsonResponse({ error: "Failed to create checkout session" }, 502);
    }

    const data = await response.json();
    if (!data || !data.url) {
      return jsonResponse({ error: "Checkout session missing URL" }, 502);
    }

    return jsonResponse({ url: data.url });
  } catch (error) {
    console.error("Checkout session error", error);
    return jsonResponse({ error: "Internal error creating checkout session" }, 500);
  }
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Missing payload" };
  }
  const errors = [];

  const slug = String(payload.slug || "").trim().toLowerCase();
  if (!slug) errors.push("slug");

  const propertyLabel = String(payload.propertyLabel || "").trim();
  if (!propertyLabel) errors.push("propertyLabel");

  const startISO = String(payload.startISO || "").trim();
  const endISO = String(payload.endISO || "").trim();
  if (!startISO) errors.push("startISO");
  if (!endISO) errors.push("endISO");

  const nights = Number(payload.nights);
  if (!Number.isFinite(nights) || nights <= 0) errors.push("nights");

  const totalCents = Number(payload.totalCents);
  if (!Number.isFinite(totalCents) || totalCents <= 0) errors.push("totalCents");

  const currency = String(payload.currency || "").trim().toUpperCase();
  if (!currency || currency.length !== 3) errors.push("currency");

  const validDates =
    !Number.isNaN(Date.parse(startISO)) && !Number.isNaN(Date.parse(endISO));
  if (!validDates) {
    errors.push("dates");
  }

  if (errors.length) {
    return { valid: false, error: `Invalid fields: ${errors.join(", ")}` };
  }

  return {
    valid: true,
    data: {
      slug,
      propertyLabel,
      startISO,
      endISO,
      nights,
      totalCents,
      currency,
    },
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
