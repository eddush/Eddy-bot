const fs = require('fs');
const path = require('path');
const { askGroq } = require('../services/groq');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'groq-tickets.json');

function loadMemory() {
  try { return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch { return {}; }
}

function saveMemory(memory) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

function isTicketChannel(channel) {
  if (!channel?.isTextBased?.() || !channel?.guild) return false;
  return typeof channel.name === 'string' && channel.name.toLowerCase().startsWith('ticket');
}

function splitDiscordMessage(text, maxLength = 1900) {
  const chunks = [];
  let remaining = String(text || '').trim();
  while (remaining.length > maxLength) {
    let cut = remaining.lastIndexOf('\n', maxLength);
    if (cut < 500) cut = remaining.lastIndexOf(' ', maxLength);
    if (cut < 1) cut = maxLength;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function getUsableRoles(guild) {
  return guild.roles.cache
    .filter(role => !role.managed && role.name !== '@everyone')
    .sort((a, b) => b.position - a.position)
    .map(role => role.name);
}

function parseAiResult(raw) {
  try {
    const cleaned = String(raw)
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return JSON.parse(cleaned);
  } catch {
    return { roleName: null, answer: String(raw || '').trim() };
  }
}

function findRole(guild, roleName) {
  if (!roleName || typeof roleName !== 'string') return null;
  const wanted = roleName.trim().toLowerCase();
  return guild.roles.cache.find(role =>
    !role.managed && role.name !== '@everyone' && role.name.toLowerCase() === wanted
  ) || null;
}

function installGroqDiscordBridge(client) {
  const memory = loadMemory();

  client.on('messageCreate', async (message) => {
    if (message.author.bot || !isTicketChannel(message.channel)) return;
    if (!process.env.GROQ_API_KEY) {
      console.error('[Groq] GROQ_API_KEY is missing');
      return;
    }

    const channelId = message.channel.id;
    if (!memory[channelId]) {
      memory[channelId] = { createdAt: new Date().toISOString(), messages: [] };
    }

    const history = memory[channelId].messages;
    history.push({
      role: 'user',
      content: `${message.member?.displayName || message.author.username}: ${message.content || '[attachment]'}`
    });
    memory[channelId].messages = history.slice(-20);
    saveMemory(memory);

    const roles = getUsableRoles(message.guild);
    const roleList = roles.length ? roles.map(name => `- ${name}`).join('\n') : '(no usable roles)';

    const systemPrompt = process.env.GROQ_SYSTEM_PROMPT ||
      'You are Eddy Bot support AI. Answer Discord ticket users clearly and politely. Reply in the same language as the user. If you do not know the answer, say that a staff member should handle the ticket.';

    const messages = [
      {
        role: 'system',
        content: `${systemPrompt}\n\nYou must also choose a Discord role for this request from the EXISTING roles listed below. Never invent a role name. Choose the single most relevant role based on the user\'s problem and the conversation. If no role is appropriate, use null.\n\nEXISTING DISCORD ROLES:\n${roleList}\n\nReturn ONLY valid JSON in this exact format:\n{"roleName":"exact existing role name or null","answer":"your helpful answer to the user"}`
      },
      ...memory[channelId].messages.map(item => ({ role: item.role, content: item.content }))
    ];

    try {
      await message.channel.sendTyping();
      const raw = await askGroq(messages);
      const result = parseAiResult(raw);
      const answer = result.answer || raw;
      const role = findRole(message.guild, result.roleName);

      if (role) {
        await message.channel.send({
          content: `<@&${role.id}>`,
          allowedMentions: { roles: [role.id] }
        });
        console.log(`[Groq] Ticket ${channelId}: selected role "${role.name}" (${role.id})`);
      } else {
        console.log(`[Groq] Ticket ${channelId}: no matching role selected`);
      }

      if (answer) {
        const chunks = splitDiscordMessage(`🤖 **Eddy AI:** ${answer}`);
        for (const chunk of chunks) {
          await message.channel.send(chunk);
        }
      }

      memory[channelId].messages.push({ role: 'assistant', content: answer });
      memory[channelId].messages = memory[channelId].messages.slice(-20);
      saveMemory(memory);
    } catch (error) {
      console.error('[Groq bridge error]', error?.stack || error?.message || error?.data || error);
      await message.channel.send('⚠️ ה־AI לא הצליח לענות כרגע. צוות התמיכה יכול לטפל בטיקט.').catch(() => {});
    }
  });
}

module.exports = { installGroqDiscordBridge };
