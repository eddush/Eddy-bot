const fs = require('fs');
const path = require('path');
const { askGroq } = require('../services/groq');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

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
    return { shouldRespond: true, needsStaff: false, roleName: null, answer: String(raw || '').trim(), buttons: [] };
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

function buildButtons(buttons, openerId) {
  if (!Array.isArray(buttons) || !buttons.length) return null;
  const allowed = new Set(['staff', 'close', 'info']);
  const builders = [];

  for (const item of buttons.slice(0, 5)) {
    if (!item || !allowed.has(item.action)) continue;
    const label = String(item.label || '').slice(0, 80);
    if (!label) continue;
    const customId = `eddy_ai:${item.action}:${openerId}`;
    builders.push(
      new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(item.style === 'danger' ? ButtonStyle.Danger : ButtonStyle.Primary)
    );
  }

  return builders.length ? new ActionRowBuilder().addComponents(builders) : null;
}

function installGroqDiscordBridge(client) {
  const memory = loadMemory();

  client.on('messageCreate', async (message) => {
    await learnFromStaffMessage(message);
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot || !isTicketChannel(message.channel)) return;
    if (!process.env.GROQ_API_KEY) {
      console.error('[Groq] GROQ_API_KEY is missing');
      return;
    }

    const channelId = message.channel.id;
    if (!memory[channelId]) {
      memory[channelId] = { createdAt: new Date().toISOString(), openerId: null, openerName: null, staffActive: false, messages: [] };
    }

    // Once a real staff member speaks in a ticket, the AI goes completely silent.
    if (isStaffMember(message.member)) {
      memory[channelId].staffActive = true;
      saveMemory(memory);
      console.log(`[Groq] Ticket ${channelId}: staff member ${message.author.tag} joined; AI paused.`);
      return;
    }

    if (memory[channelId].staffActive) return;

    // Record the first non-staff participant as the ticket opener.
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
    const knowledgeText = knowledge.length ? knowledge.map(x => `- ${x.knowledge}`).join('\n') : '(no learned staff knowledge yet)';

    const systemPrompt = process.env.GROQ_SYSTEM_PROMPT ||
      'You are Eddy Bot support AI. Answer only genuine support requests in Discord tickets. Do not answer casual conversation, jokes, greetings, random questions unrelated to support, or messages that do not need a response. If a message is casual or irrelevant, set shouldRespond=false. Reply in the same language as the user. If you do not know the answer, escalate to staff.';

    const messages = [
      {
        role: 'system',
        content: `${systemPrompt}\n\nTICKET OPENER: ${openerName} (<@${openerId}>)\nAddress the ticket opener directly.\n\nLEARNED STAFF KNOWLEDGE:\n${knowledgeText}\nUse this knowledge when relevant, but do not invent facts.\n\nSTAFF ESCALATION:\nDo NOT notify/tag staff on every message. Set needsStaff=true ONLY when a staff member genuinely needs to intervene. For ordinary support questions you can solve, set needsStaff=false.\n\nEXISTING DISCORD ROLES:\n${roleList}\n\nDISCORD ACTIONS:\nYou may optionally suggest up to 2 buttons. Only use actions: staff (request staff), close (request closing the ticket), info (show useful information). Do not invent custom IDs.\n\nReturn ONLY valid JSON:\n{"shouldRespond":true,"needsStaff":false,"roleName":null,"answer":"answer for the ticket opener","buttons":[{"label":"Request staff","action":"staff","style":"primary"}]}\nFor casual/irrelevant messages use shouldRespond=false and answer="".`
      },
      ...memory[channelId].messages.map(item => ({ role: item.role, content: item.content }))
    ];

    try {
      await message.channel.sendTyping();
      const raw = await askGroq(messages);
      const result = parseAiResult(raw);

      if (result.shouldRespond === false) return;

      const answer = result.answer || '';
      const role = result.needsStaff === true ? findRole(message.guild, result.roleName) : null;

      if (role) {
        await message.channel.send({
          content: `<@&${role.id}>`,
          allowedMentions: { roles: [role.id] }
        });
        console.log(`[Groq] Ticket ${channelId}: staff needed, selected role "${role.name}" (${role.id})`);
      }

      const buttonRow = buildButtons(result.buttons, openerId);
      if (answer) {
        const openerMention = `<@${openerId}>`;
        const chunks = splitDiscordMessage(`${openerMention}\n🤖 **Eddy AI:** ${answer}`);
        for (let i = 0; i < chunks.length; i++) {
          await message.channel.send({
            content: chunks[i],
            allowedMentions: { users: [openerId] },
            components: i === chunks.length - 1 && buttonRow ? [buttonRow] : []
          });
        }
      } else if (buttonRow) {
        await message.channel.send({ components: [buttonRow] });
      }

      if (answer) {
        memory[channelId].messages.push({ role: 'assistant', content: answer });
        memory[channelId].messages = memory[channelId].messages.slice(-20);
        saveMemory(memory);
      }
    } catch (error) {
      console.error('[Groq bridge error]', error?.stack || error?.message || error?.data || error);
      await message.channel.send('⚠️ ה־AI לא הצליח לענות כרגע. צוות התמיכה יכול לטפל בטיקט.').catch(() => {});
    }
  });

  // Handle the controlled AI-generated buttons.
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() || !interaction.customId.startsWith('eddy_ai:')) return;

    const [, action, openerId] = interaction.customId.split(':');
    if (interaction.user.id !== openerId && !isStaffMember(interaction.member)) {
      await interaction.reply({ content: 'הכפתור הזה מיועד לפותח הטיקט או לצוות.', ephemeral: true });
      return;
    }

    if (action === 'staff') {
      await interaction.reply({ content: '👥 בקשת צוות נשלחה. צוות התמיכה יכול להיכנס לטיקט.', ephemeral: true });
      return;
    }

    if (action === 'info') {
      await interaction.reply({ content: 'ℹ️ אם הבעיה לא נפתרה, אפשר לבקש מצוות התמיכה להצטרף לטיקט.', ephemeral: true });
      return;
    }

    if (action === 'close') {
      await interaction.reply({ content: '🔒 בקשת סגירת הטיקט נשלחה. צוות יכול לסגור את הטיקט.', ephemeral: true });
      return;
    }
  });
}

module.exports = { installGroqDiscordBridge };
