const fs = require('fs');
const path = require('path');
const { askGroq } = require('../services/groq');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'groq-tickets.json');
const KNOWLEDGE_FILE = path.join(DATA_DIR, 'groq-staff-knowledge.json');

function loadJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}

function saveJson(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function loadMemory() { return loadJson(MEMORY_FILE); }
function saveMemory(memory) { saveJson(MEMORY_FILE, memory); }

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
    return { needsStaff: false, roleName: null, answer: String(raw || '').trim() };
  }
}

function findRole(guild, roleName) {
  if (!roleName || typeof roleName !== 'string') return null;
  const wanted = roleName.trim().toLowerCase();
  return guild.roles.cache.find(role =>
    !role.managed && role.name !== '@everyone' && role.name.toLowerCase() === wanted
  ) || null;
}

function isStaffMember(member) {
  if (!member) return false;
  return member.permissions.has('Administrator') ||
    member.permissions.has('ManageGuild') ||
    member.permissions.has('ManageMessages') ||
    member.permissions.has('ManageChannels') ||
    member.permissions.has('ModerateMembers');
}

function isLikelyUsefulStaffMessage(content) {
  const text = String(content || '').trim();
  if (text.length < 15) return false;
  if (/^([!/.?]|<@!?\d+>)/.test(text)) return false;
  if (/^(lol|ok|okay|yes|no|כן|לא|סבבה|אוקיי|חח|חחח)$/i.test(text)) return false;
  return true;
}

async function learnFromStaffMessage(message) {
  if (message.author.bot || !message.guild || !isStaffMember(message.member)) return;
  const content = String(message.content || '').trim();
  if (!isLikelyUsefulStaffMessage(content)) return;
  if (!process.env.GROQ_API_KEY) return;

  try {
    const raw = await askGroq([
      {
        role: 'system',
        content: 'You maintain a support knowledge base for a Discord server. Decide whether a staff message contains reusable factual/helpful information that an AI support bot should remember for future tickets. Ignore casual conversation, greetings, opinions, private/personal information, and one-off instructions. Return ONLY JSON: {"important":true/false,"knowledge":"short reusable fact or null"}. Never include secrets, tokens, passwords, or personal data.'
      },
      { role: 'user', content }
    ]);

    let result;
    try {
      const cleaned = String(raw).replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
      result = JSON.parse(cleaned);
    } catch {
      return;
    }

    if (result.important !== true || !result.knowledge) return;

    const knowledge = loadJson(KNOWLEDGE_FILE);
    const guildId = message.guild.id;
    if (!Array.isArray(knowledge[guildId])) knowledge[guildId] = [];

    const item = {
      knowledge: String(result.knowledge).slice(0, 1000),
      channel: message.channel.name || 'unknown',
      savedAt: new Date().toISOString()
    };

    const duplicate = knowledge[guildId].some(x =>
      String(x.knowledge).toLowerCase() === item.knowledge.toLowerCase()
    );
    if (!duplicate) {
      knowledge[guildId].push(item);
      // Keep the knowledge base bounded while retaining the newest 500 facts.
      knowledge[guildId] = knowledge[guildId].slice(-500);
      saveJson(KNOWLEDGE_FILE, knowledge);
      console.log(`[Groq] Learned staff knowledge: ${item.knowledge}`);
    }
  } catch (error) {
    console.error('[Groq learning error]', error?.message || error);
  }
}

function getKnowledge(guildId) {
  const knowledge = loadJson(KNOWLEDGE_FILE);
  return Array.isArray(knowledge[guildId]) ? knowledge[guildId].slice(-100) : [];
}

function installGroqDiscordBridge(client) {
  const memory = loadMemory();

  // Learn reusable support information from staff messages in ANY channel.
  client.on('messageCreate', async (message) => {
    await learnFromStaffMessage(message);
  });

  // Existing ticket AI behavior.
  client.on('messageCreate', async (message) => {
    if (message.author.bot || !isTicketChannel(message.channel)) return;
    if (!process.env.GROQ_API_KEY) {
      console.error('[Groq] GROQ_API_KEY is missing');
      return;
    }

    const channelId = message.channel.id;
    if (!memory[channelId]) {
      memory[channelId] = {
        createdAt: new Date().toISOString(),
        openerId: message.author.id,
        openerName: message.member?.displayName || message.author.username,
        messages: []
      };
    }

    if (!memory[channelId].openerId) {
      memory[channelId].openerId = message.author.id;
      memory[channelId].openerName = message.member?.displayName || message.author.username;
    }

    const openerId = memory[channelId].openerId;
    const openerName = memory[channelId].openerName || message.author.username;

    memory[channelId].messages.push({
      role: 'user',
      content: `${message.member?.displayName || message.author.username}: ${message.content || '[attachment]'}`
    });
    memory[channelId].messages = memory[channelId].messages.slice(-20);
    saveMemory(memory);

    const roles = getUsableRoles(message.guild);
    const roleList = roles.length ? roles.map(name => `- ${name}`).join('\n') : '(no usable roles)';
    const knowledge = getKnowledge(message.guild.id);
    const knowledgeText = knowledge.length
      ? knowledge.map(x => `- ${x.knowledge}`).join('\n')
      : '(no learned staff knowledge yet)';

    const systemPrompt = process.env.GROQ_SYSTEM_PROMPT ||
      'You are Eddy Bot support AI. Answer Discord ticket users clearly and politely. Reply in the same language as the user. If you do not know the answer, say that a staff member should handle the ticket.';

    const messages = [
      {
        role: 'system',
        content: `${systemPrompt}\n\nTICKET OPENER: ${openerName} (<@${openerId}>)\nAddress the ticket opener directly.\n\nLEARNED STAFF KNOWLEDGE:\n${knowledgeText}\nUse this knowledge when relevant, but do not invent facts.\n\nSTAFF ESCALATION:\nDo NOT notify or tag staff on every message. Set needsStaff=true ONLY when a staff member genuinely needs to intervene. For ordinary questions you can answer, set needsStaff=false and roleName=null.\n\nIf needsStaff=true, choose one relevant role from the EXISTING roles below. Never invent a role.\n\nEXISTING DISCORD ROLES:\n${roleList}\n\nReturn ONLY valid JSON:\n{"needsStaff":true,"roleName":"exact existing role name or null","answer":"your helpful answer to the ticket opener"}`
      },
      ...memory[channelId].messages.map(item => ({ role: item.role, content: item.content }))
    ];

    try {
      await message.channel.sendTyping();
      const raw = await askGroq(messages);
      const result = parseAiResult(raw);
      const answer = result.answer || raw;
      const role = result.needsStaff === true ? findRole(message.guild, result.roleName) : null;

      if (role) {
        await message.channel.send({
          content: `<@&${role.id}>`,
          allowedMentions: { roles: [role.id] }
        });
        console.log(`[Groq] Ticket ${channelId}: staff needed, selected role "${role.name}" (${role.id})`);
      }

      if (answer) {
        const openerMention = `<@${openerId}>`;
        for (const chunk of splitDiscordMessage(`${openerMention}\n🤖 **Eddy AI:** ${answer}`)) {
          await message.channel.send({
            content: chunk,
            allowedMentions: { users: [openerId] }
          });
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
