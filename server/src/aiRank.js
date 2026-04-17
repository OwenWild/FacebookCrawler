/**
 * Optional OpenAI ranking (API key from https://platform.openai.com — not the same as ChatGPT Plus).
 * Uses a small/cheap model by default.
 */

const DEFAULT_MODEL = "gpt-4o-mini";

function listingSummary(line, i) {
  const { listing, deal, distanceMi } = line;
  const dist =
    distanceMi != null && Number.isFinite(distanceMi)
      ? `${distanceMi.toFixed(1)} mi`
      : "?";
  return [
    `${i + 1}. ${listing.title}`,
    `   Price: ${listing.price || "—"} | Loc: ${listing.location || "—"} | Dist: ${dist} | Heuristic: ${deal.score}`,
    `   Snippet: ${(listing.snippet || "").slice(0, 400).replace(/\s+/g, " ")}`,
  ].join("\n");
}

/**
 * @param {Array<{ listing: object, deal: object, distanceMi: number | null }>} lines
 * @param {{ query: string, refTown: string, miles: number }} meta
 * @returns {Promise<string>} Short markdown-friendly commentary
 */
export async function summarizeDealsWithOpenAI(lines, meta) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return "";
  }

  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  const top = lines.slice(0, 35);
  const body = top.map(listingSummary).join("\n\n");

  const prompt = `You help a reseller spot Facebook Marketplace listings that may have profit potential (flip, arbitrage, undervalued). The user searched "${meta.query}" near ${meta.refTown} within ${meta.miles} miles.

Listings (title, price, distance, heuristic score, snippet):
${body || "(none)"}

Reply in under 400 words:
1) Top 3 IDs to open first (by array number 1..N) with one line each why.
2) 2–4 red flags to skip.
3) Note that you cannot verify sold prices or authenticity.

Be concise. Plain text, no JSON.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 600,
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI HTTP ${res.status}: ${t.slice(0, 500)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  return text || "(no AI text)";
}
