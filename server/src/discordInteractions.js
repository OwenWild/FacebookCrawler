import http from "http";
import {
  verifyKey,
  InteractionType,
  InteractionResponseType,
} from "discord-interactions";
import { runKeywordRadiusSearch } from "./searchSweep.js";
import { summarizeDealsWithOpenAI } from "./aiRank.js";

function opt(options, name) {
  const o = (options || []).find((x) => x.name === name);
  return o?.value;
}

function formatListingLine(line, i) {
  const { listing, deal, distanceMi } = line;
  const dist =
    distanceMi != null && Number.isFinite(distanceMi)
      ? `${distanceMi.toFixed(1)} mi`
      : "?";
  const title = (listing.title || "").slice(0, 120);
  return `${i + 1}. **${deal.score}** · ${listing.price || "—"} · ${dist} — ${title}\n${listing.url}`;
}

/** Split into Discord-safe message chunks (max ~2000; use 1900). */
function splitDiscordMessages(text, maxLen = 1900) {
  const lines = String(text).split("\n");
  const chunks = [];
  let buf = "";
  for (const line of lines) {
    const next = buf ? `${buf}\n${line}` : line;
    if (next.length <= maxLen) {
      buf = next;
      continue;
    }
    if (buf) chunks.push(buf);
    if (line.length <= maxLen) {
      buf = line;
      continue;
    }
    for (let i = 0; i < line.length; i += maxLen) {
      chunks.push(line.slice(i, i + maxLen));
    }
    buf = "";
  }
  if (buf) chunks.push(buf);
  return chunks.length ? chunks : [""];
}

async function patchOriginal(applicationId, token, payload) {
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Discord PATCH ${res.status}: ${t.slice(0, 400)}`);
  }
}

async function createFollowup(applicationId, token, payload) {
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${token}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Discord followup ${res.status}: ${t.slice(0, 400)}`);
  }
}

async function runSearchInteraction(cfg, body) {
  const options = body.data?.options || [];
  const query = opt(options, "query");
  const location = opt(options, "location");
  const miles = opt(options, "miles");
  const useAi = opt(options, "ai") === true;

  const applicationId = body.application_id;
  const token = body.token;

  try {
    const result = await runKeywordRadiusSearch(cfg, {
      query,
      refTown: location,
      miles,
    });

    let aiText = "";
    if (useAi) {
      if (!process.env.OPENAI_API_KEY?.trim()) {
        aiText =
          "\n\n_AI skipped: set `OPENAI_API_KEY` (API key from platform.openai.com — ChatGPT Plus is separate.)_";
      } else {
        try {
          aiText =
            "\n\n**AI notes (experimental)**\n" +
            (await summarizeDealsWithOpenAI(result.lines, {
              query: result.query,
              refTown: result.refTown,
              miles: result.miles,
            }));
        } catch (e) {
          aiText = `\n\n_AI error: ${e.message}_`;
        }
      }
    }

    const header =
      `**Search:** "${result.query}" near **${result.refTown}** · **${result.miles}** mi radius\n` +
      `**Found:** ${result.lines.length} with location inside radius (sorted by heuristic score)\n` +
      `${aiText}\n`;

    const listingBlock =
      result.lines.length === 0
        ? "_No listings with a parseable location in range (Marketplace tiles often omit distance)._"
        : result.lines.map((line, i) => formatListingLine(line, i)).join("\n\n");

    const full = `${header}\n${listingBlock}`;
    const chunks = splitDiscordMessages(full, 1900);

    await patchOriginal(applicationId, token, { content: chunks[0] || "(empty)" });
    for (let i = 1; i < chunks.length; i++) {
      await new Promise((r) => setTimeout(r, 400));
      await createFollowup(applicationId, token, { content: chunks[i] });
    }
  } catch (e) {
    const msg = e?.message || String(e);
    await patchOriginal(applicationId, token, {
      content: `**Search failed:** ${msg.slice(0, 1800)}`,
    });
  }
}

/**
 * @param {object} cfg loaded config
 */
export function startInteractionServer(cfg) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY?.trim();
  if (!publicKey) {
    console.warn(
      "[discord-interactions] DISCORD_PUBLIC_KEY not set — slash /search disabled"
    );
    return;
  }

  const port = Number(process.env.DISCORD_INTERACTIONS_PORT || 3847);

  const server = http.createServer(async (req, res) => {
    const path = (req.url || "").split("?")[0];
    if (req.method !== "POST" || path !== "/interactions") {
      res.writeHead(404);
      res.end();
      return;
    }

    const chunks = [];
    try {
      for await (const ch of req) chunks.push(ch);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    const rawBody = Buffer.concat(chunks);

    const sig = req.headers["x-signature-ed25519"];
    const ts = req.headers["x-signature-timestamp"];
    const ok = await verifyKey(rawBody, sig, ts, publicKey);
    if (!ok) {
      res.writeHead(401);
      res.end("invalid signature");
      return;
    }

    let body;
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }

    if (body.type === InteractionType.PING) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ type: InteractionResponseType.PONG }));
      return;
    }

    if (body.type === InteractionType.APPLICATION_COMMAND) {
      const name = body.data?.name;
      if (name === "search") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
          })
        );
        runSearchInteraction(cfg, body).catch((e) =>
          console.error("[discord-interactions] search async", e)
        );
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: "Unknown command" },
        })
      );
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: "Unsupported interaction type" },
      })
    );
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(
      `[discord-interactions] listening on 0.0.0.0:${port} POST /interactions`
    );
  });

  server.on("error", (e) => {
    console.error("[discord-interactions] server error", e);
  });
}
