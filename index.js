// ---- Render fix: יצירת שרת PORT כדי שהבוט ירוץ ----
const http = require("http");
http.createServer((req, res) => {
  res.end("Bot is running");
}).listen(process.env.PORT || 3000);

// -----------------------------------------------------

require('dotenv').config();
const { Client, GatewayIntentBits, Collection, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, Events, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ------ טעינת פקודות (כולל createmute) ------
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath);
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const cmd = require(path.join(commandsPath, file));
  if (cmd.name && cmd.execute) client.commands.set(cmd.name, cmd);
}

// ------ קונפיג / רולים ------
const TEAM_ROLE_ID = '1439948657670754324';
const DEV_ROLE_ID = '1442556761541447720';

// ------ מילים לא יפות ------
const badWords = ["חרא", "מניאק", "זונה", "בן זונה", "דפוק", "מטומטם", "מפגר"];
const warnings = new Map();

// ------ START ------
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity('!help | Ticket automation');
});

// ------ Commands ------
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/\s+/);
  const name = args.shift().toLowerCase();
  const command = client.commands.get(name);
  if (!command) return;

  try {
    await command.execute(message, args, client);
  } catch (err) {
    console.error('Command error:', err);
    message.reply('❌ שגיאה בהרצת הפקודה.');
  }
});

// ------ סינון מילים ------
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const content = message.content.toLowerCase();
  const found = badWords.some(w => content.includes(w));
  if (!found) return;

  const userId = message.author.id;
  let c = warnings.get(userId) || 0;
  c++;
  warnings.set(userId, c);

  await message.reply(`⚠️ שפה לא מתאימה (${c}/3).`);

  if (c >= 3) {
    warnings.delete(userId);

    let muted = message.guild.roles.cache.find(r => r.name === 'Muted');
    if (!muted) {
      muted = await message.guild.roles.create({
        name: 'Muted',
        permissions: []
      });

      for (const [, ch] of message.guild.channels.cache) {
        try {
          await ch.permissionOverwrites.edit(muted, {
            SendMessages: false,
            AddReactions: false,
            Speak: false,
          });
        } catch {}
      }
      console.log('✔ Muted role created and permissions updated.');
    }

    const member = await message.guild.members.fetch(userId).catch(() => null);
    if (member) {
      await member.roles.add(muted).catch(() => {});
      await message.channel.send(`🔇 ${message.author} הושתק עקב 3 אזהרות. המיוט יוסר אוטומטית בעוד 10 דקות.`);

      setTimeout(async () => {
        try {
          await member.roles.remove(muted);
          try {
            await member.send(`🔈 היי! המיוט שלך הוסר עכשיו. אנא הקפד לשמור על שפה מתאימה 😊`);
          } catch {}
        } catch (err) {
          console.log('❌ שגיאה בהסרת המיוט:', err);
        }
      }, 10 * 60 * 1000);
    }
  }
});

// ------ Tickets ------
client.on('channelCreate', async channel => {
  try {
    if (!channel || !channel.name) return;
    if (!channel.name.startsWith('ticket-')) return;

    const select = new StringSelectMenuBuilder()
      .setCustomId('ticket_main_select')
      .setPlaceholder('בחר סוג פנייה...')
      .addOptions([
        { label: 'קבלה לצוות', value: 'apply_team', description: 'טופס קבלה לצוות' },
        { lab
