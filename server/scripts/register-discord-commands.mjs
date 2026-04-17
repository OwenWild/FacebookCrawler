/**
 * One-time / when-you-change-commands: register the /search slash command.
 *
 * Needs env:
 *   DISCORD_BOT_TOKEN      — Bot token (Discord Developer Portal → Bot)
 *   DISCORD_APPLICATION_ID — Application ID (General Information)
 *
 * Optional:
 *   DISCORD_GUILD_ID       — if set, register to this guild only (instant). Else global (can take ~1h).
 *
 * Usage:
 *   cd server && node scripts/register-discord-commands.mjs
 */

const token = process.env.DISCORD_BOT_TOKEN?.trim();
const appId = process.env.DISCORD_APPLICATION_ID?.trim();
const guildId = process.env.DISCORD_GUILD_ID?.trim();

if (!token || !appId) {
  console.error("Set DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID");
  process.exit(1);
}

const command = {
  name: "search",
  description: "Search Facebook Marketplace by keyword within a radius of a town",
  options: [
    {
      type: 3,
      name: "query",
      description: "What to search for (e.g. computer, macbook)",
      required: true,
    },
    {
      type: 3,
      name: "location",
      description: "Center point (e.g. Potsdam, NY)",
      required: true,
    },
    {
      type: 10,
      name: "miles",
      description: "Radius in miles",
      required: true,
      min_value: 1,
      max_value: 500,
    },
    {
      type: 5,
      name: "ai",
      description: "Add cheap OpenAI summary (needs OPENAI_API_KEY on server)",
      required: false,
    },
  ],
};

const method = "POST";
const url = guildId
  ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
  : `https://discord.com/api/v10/applications/${appId}/commands`;

const res = await fetch(url, {
  method,
  headers: {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(command),
});

const t = await res.text();
if (!res.ok) {
  console.error("Failed:", res.status, t);
  process.exit(1);
}

console.log("Registered /search:", guildId ? `guild ${guildId}` : "global", t);
