import nodemailer from "nodemailer";

function buildPayload(listing, deal, meta) {
  return {
    v: 1,
    at: new Date().toISOString(),
    listing,
    deal,
    meta,
  };
}

export async function notifyListing(cfg, listing, deal, meta = {}) {
  const payload = buildPayload(listing, deal, meta);
  const listed =
    listing.listedFor?.trim() ||
    (listing.listedAgeHours != null && Number.isFinite(listing.listedAgeHours)
      ? `~${Math.round(listing.listedAgeHours)}h ago (est.)`
      : "");
  const text = [
    `Score ${deal.score} (${deal.label}): ${listing.title}`,
    listing.price || "",
    listing.location || "",
    listed ? `Listed: ${listed}` : "",
    listing.cashOnly === true
      ? "Cash only / no trades: Yes"
      : "Cash only / no trades: No",
    listing.url,
    (deal.reasons || []).join(" · "),
  ]
    .filter(Boolean)
    .join("\n");

  if (cfg.notifyWebhookUrl) {
    const headers = {
      "Content-Type": "application/json",
      ...(cfg.notifyWebhookHeaders || {}),
    };
    const res = await fetch(cfg.notifyWebhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Webhook HTTP ${res.status}`);
    }
  }

  const em = cfg.notifyEmail;
  if (em?.enabled) {
    const pass = em.pass || (em.passEnv ? process.env[em.passEnv] : "") || "";
    const transporter = nodemailer.createTransport({
      host: em.host,
      port: em.port ?? 587,
      secure: !!em.secure,
      auth: em.user && pass ? { user: em.user, pass } : undefined,
    });
    await transporter.sendMail({
      from: em.from,
      to: em.to,
      subject: `[Marketplace] ${deal.score} · ${listing.title}`.slice(0, 200),
      text,
      html: `<pre style="font-family:system-ui,sans-serif">${text.replace(
        /</g,
        "&lt;"
      )}</pre><p><a href="${listing.url}">Open</a></p>`,
    });
  }

  if (!cfg.notifyWebhookUrl && !em?.enabled) {
    console.log("[notify] (no webhook/email configured)\n" + text);
  }
}
