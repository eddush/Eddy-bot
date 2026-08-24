const fs = require('fs');
const path = require('path');
const { PermissionFlagsBits } = require('discord.js');
const { askGroq } = require('../services/groq');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'groq-tickets.json');
const STAFF_ROLE_IDS = new Set([
  '1439948657670754324',
  '1442556761541447720',
  '1531588090588823614',
  '1439948877183582208'
]);

function loadMemory() {
  try { return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch { return {}; }
}

function saveMemory(memory) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

// Do NOT identify tickets by their name. The existing ticket system creates
// channels with its own names. A ticket is detected from Discord's channel
// permission overwrites: @everyone cannot view the channel while a regular
// member has an explicit ViewChannel allow.
function isTicketChannel(channel) {
  if (!channel?.isTextBased?.() || !channel?.guild || !channel?.permissionOverwrites?.cache) return false;

  const everyoneOverwrite = channel.permissionOverwrites.cache.get(channel.guild.roles.everyone.id);
  if (!everyoneOverwrite?.deny?.has(PermissionFlagsBits.ViewChannel)) return false;

  return channel.permissionOverwrites.cache.some(overwrite => {
    if (overwrite.type !== 1) return false; // Member overwrite
    return overwrite.allow?.has(PermissionFlagsBits.ViewChannel);
  });
}

function isStaff(member) {
  return member?.roles?.cache?.some(role => STAFF_ROLE_IDS.has(role.id)) || false;
}

function installGroqDiscordBridge(client) {
  const memory = loadMemory();

  client.on('messageCreate', async (message) => {
    if (message.author.bot || !isTicketChannel(message.channel)) return;
    if (isStaff(message.member)) return;
    if (!process.env.GROQ_API_KEY) return;

    const channelId = message.channel.id;
    if (!memory[channelId]) {
      memory[channelId] = {
        createdAt: new Date().toISOString(),
        messages: []
      };
    }

    const history = memory[channelId].messages;
    history.push({
      role: 'user',
      content: `${message.member?.displayName || message.author.username}: ${message.content || '[attachment]'}`
    });
    memory[channelId].messages = history.slice(-20);
    saveMemory(memory);

    const systemPrompt = process.env.GROQ_SYSTEM_PROMPT ||
      'You are Eddy Bot support AI. Answer Discord ticket users clearly and politely. Reply in the same language as the user. If you do not know the answer, say that a staff member should handle the ticket. Do not claim to have performed actions you cannot perform.';

    const messages = [
      { role: 'system', content: systemPrompt },
      ...memory[channelId].messages.map(item => ({ role: item.role, content: item.content }))
    ];

    try {
      await message.channel.sendTyping();
      const answer = await askGroq(messages);
      if (!answer) return;

      await message.channel.send(`🤖 **Eddy AI:** ${answer}`);
      memory[channelId].messages.push({ role: 'assistant', content: answer });
      memory[channelId].messages = memory[channelId].messages.slice(-20);
      saveMemory(memory);
    } catch (error) {
      console.error('Groq bridge error:', error?.data || error);
      await message.channel.send('⚠️ ה־AI לא הצליח לענות כרגע. צוות התמיכה יכול לטפל בטיקט.').catch(() => {});
    }
  });
}

module.exports = { installGroqDiscordBridge };
