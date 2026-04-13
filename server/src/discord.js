/**
 * Post a digest to a Discord channel webhook.
 * @see https://discord.com/developers/docs/resources/webhook
 */

const MAX_EMBEDS = 10;
/** Discord embed description hard limit is 4096 chars. */
const MAX_EMBED_DESC = 4096;

function truncate(s, n) {
  if (!s) return "";
  const t = String(s);
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

/**
 * @param {string} webhookUrl
 * @param {{ title: string, lines: { listing: object, deal: object, distanceMi: number | null }[] }} batch
 */
async function postWebhookBody(webhookUrl, body) {
  const u = new URL(webhookUrl);
  u.searchParams.set("wait", "true");
  const res = await fetch(u.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Discord webhook ${res.status}: ${t}`);
  }
}

function listingEmbed(line) {
  const { listing, deal, distanceMi } = line;
  const dist =
    distanceMi != null && Number.isFinite(distanceMi)
      ? `${distanceMi.toFixed(1)} mi`
      : "—";
  const listed =
    listing.listedFor?.trim() ||
    (listing.listedAgeHours != null && Number.isFinite(listing.listedAgeHours)
      ? "~" + Math.round(listing.listedAgeHours) + "h ago (est.)"
      : null);
  const cash =
    listing.cashOnly === true ? "Yes" : "No";
  const metaLines = [
    listing.price || "—",
    listing.location || "—",
    `Distance: ${dist}`,
    `Listed: ${listed || "—"}`,
    `Cash only / no trades: ${cash}`,
  ];
  const reasonsLine = (deal.reasons || []).length
    ? `Heuristics: ${deal.reasons.join(" · ")}`
    : "";
  const rawSnippet = (listing.snippet || "").trim() || "—";
  const parts = [
    metaLines.join("\n"),
    "",
    "**Description** (from card)",
    rawSnippet,
  ];
  if (reasonsLine) parts.push("", reasonsLine);
  const desc = truncate(parts.join("\n"), MAX_EMBED_DESC);
  return {
    title: truncate(listing.title, 250),
    url: listing.url,
    description: desc,
    color: deal.score >= 75 ? 0x3ba55c : deal.score >= 62 ? 0x5865f2 : 0x747f8d,
    footer: { text: `Score ${deal.score} · ${deal.label}` },
  };
}

/**
 * @param {string} webhookUrl
 * @param {{ title: string, lines: { listing: object, deal: object, distanceMi: number | null }[] }} payload
 */
export async function postDiscordDigest(webhookUrl, payload, options = {}) {
  if (!webhookUrl?.trim()) {
    throw new Error("discordWebhookUrl is empty");
  }
  const lines = payload.lines || [];
  if (lines.length === 0) {
    if (options.postWhenEmpty) {
      await postWebhookBody(webhookUrl, {
        content: `**${payload.title}**\n_No new listings this run._`,
      });
    }
    return;
  }

  const header = {
    content: `**${payload.title}** · ${lines.length} new (sorted by score, best first)`,
  };

  for (let i = 0; i < lines.length; i += MAX_EMBEDS) {
    const chunk = lines.slice(i, i + MAX_EMBEDS);
    const body =
      i === 0
        ? { ...header, embeds: chunk.map(listingEmbed) }
        : { embeds: chunk.map(listingEmbed) };
    await postWebhookBody(webhookUrl, body);
    if (i + MAX_EMBEDS < lines.length) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }
}
