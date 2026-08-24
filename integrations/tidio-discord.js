const fs = require('fs');
const path = require('path');
const { createTicket, askLyro } = require('../services/tidio');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MAP_FILE = path.join(DATA_DIR, 'tidio-tickets.json');

function loadMap() {
  try {
    return JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveMap(map) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));
}

function isTicketChannel(channel) {
  const prefix = process.env.TICKET_CHANNEL_PREFIX || 'ticket-';
  return channel?.isTextBased?.() && channel?.name?.toLowerCase().startsWith(prefix.toLowerCase());
}

function installTidioDiscordBridge(client) {
  const map = loadMap();

  client.on('messageCreate', async (message) => {
    if (message.author.bot || !isTicketChannel(message)) return;
    if (!process.env.TIDIO_CLIENT_ID || !process.env.TIDIO_CLIENT_SECRET) return;

    // Only the first user message of a Discord ticket is sent to Lyro.
    // Tidio's current Lyro ticket endpoint is limited to the first ticket message.
    if (map[message.channel.id]) return;

    const emailDomain = process.env.TIDIO_DISCORD_EMAIL_DOMAIN || 'discord.local';
    const email = `${message.author.id}@${emailDomain}`;
    const subject = `Discord ticket - #${message.channel.name}`;
    const name = message.member?.displayName || message.author.globalName || message.author.username;

    try {
      await message.channel.sendTyping();

      const ticketId = await createTicket({
        email,
        name,
        subject,
        message: message.content || '[attachment]'
      });

      if (!ticketId) throw new Error('Tidio did not return a ticket ID');

      map[message.channel.id] = {
        ticketId,
        discordUserId: message.author.id,
        createdAt: new Date().toISOString()
      };
      saveMap(map);

      const result = await askLyro({
        ticketId,
        subject,
        email,
        name,
        message: message.content || '[attachment]'
      });

      const answer = result?.answer ?? result?.message ?? result?.content ?? result;
      if (typeof answer === 'string' && answer.trim()) {
        await message.channel.send(`🤖 **Tidio:** ${answer.trim()}`);
      } else {
        await message.channel.send('🤖 Tidio לא הצליח לענות על השאלה. הצוות יכול לטפל בטיקט.');
      }
    } catch (error) {
      console.error('Tidio bridge error:', error?.data || error);
      await message.channel.send('⚠️ הייתה בעיה בחיבור ל-Tidio. הצוות יכול לטפל בטיקט ידנית.').catch(() => {});
    }
  });
}

module.exports = { installTidioDiscordBridge };
