require('dotenv').config();
const { Client, GatewayIntentBits, Collection, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, Events, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { registerRoutes: registerMinecraftApiRoutes } = require('./minecraftApi');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath);
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const cmd = require(path.join(commandsPath, file));
  if (cmd.name && cmd.execute) client.commands.set(cmd.name, cmd);
}

const TEAM_ROLE_ID = '1439948657670754324';
const DEV_ROLE_ID = '1442556761541447720';
const badWords = ["חרא", "מניאק", "זונה", "בן זונה", "דפוק", "מטומטם", "מפגר"];
const warnings = new Map();

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity('!help | !balance <MinecraftName>');
});

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
      muted = await message.guild.roles.create({ name: 'Muted', permissions: [] });
      for (const [, ch] of message.guild.channels.cache) {
        try { await ch.permissionOverwrites.edit(muted, { SendMessages: false, AddReactions: false, Speak: false }); } catch {}
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
          try { await member.send(`🔈 היי! המיוט שלך הוסר עכשיו. אנא הקפד לשמור על שפה מתאימה 😊`); } catch {}
        } catch (err) { console.log('❌ שגיאה בהסרת המיוט:', err); }
      }, 10 * 60 * 1000);
    }
  }
});

client.on('channelCreate', async channel => {
  try {
    if (!channel || !channel.name) return;
    if (!channel.name.startsWith('ticket-')) return;
    const select = new StringSelectMenuBuilder()
      .setCustomId('ticket_main_select')
      .setPlaceholder('בחר סוג פנייה...')
      .addOptions([
        { label: 'קבלה לצוות', value: 'apply_team', description: 'טופס קבלה לצוות ותיווג רול צוות' },
        { label: 'באגים', value: 'bugs', description: 'דוח על באגים - בוט/שרת' },
        { label: 'אחר', value: 'other', description: 'פנייה כללית ותיווג צוות' },
      ]);
    const row = new ActionRowBuilder().addComponents(select);
    const embed = new EmbedBuilder()
      .setTitle('<:ticketsolidfull:1442833730548006962> ברוכים הבאים לטיקט')
      .setDescription('בחר את סוג הפנייה כדי שנוכל לטפל בה מהר יותר.')
      .setColor(0x5865F2);
    await channel.send({ embeds: [embed], components: [row] });
    console.log(`✔ Sent ticket menu to ${channel.name}`);
  } catch (err) { console.error('channelCreate error:', err); }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_main_select') {
      await interaction.deferUpdate();
      const choice = interaction.values[0];
      const channel = interaction.channel;
      if (!channel) return;
      if (choice === 'apply_team') {
        const modal = new ModalBuilder().setCustomId(`apply_modal|${interaction.user.id}`).setTitle('טופס קבלה לצוות');
        const nameInput = new TextInputBuilder().setCustomId('fullName').setLabel('שם מלא').setStyle(TextInputStyle.Short).setRequired(true);
        const aboutInput = new TextInputBuilder().setCustomId('about').setLabel('למה אתה רוצה להצטרף לצוות? (קצת עליך)').setStyle(TextInputStyle.Paragraph).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(aboutInput));
        await interaction.showModal(modal);
        return;
      }
      if (choice === 'bugs') {
        const bugSelect = new StringSelectMenuBuilder().setCustomId('bug_type_select').setPlaceholder('בחר סוג באג...').addOptions([
          { label: 'באג של בוט', value: 'bug_bot', description: 'דווח על באג בבוט' },
          { label: 'באג בשרת', value: 'bug_guild', description: 'דווח על באג שקשור לשרת' },
        ]);
        await channel.send({ content: `${interaction.user} בחרת ב"באגים" — בחר סוג:`, components: [new ActionRowBuilder().addComponents(bugSelect)] });
        return;
      }
      if (choice === 'other') {
        await channel.send({ content: `<@&${TEAM_ROLE_ID}> פנייה מסוג "אחר" נפתחה. אנא בדקו.` });
        return;
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'bug_type_select') {
      await interaction.deferUpdate();
      const val = interaction.values[0];
      const channel = interaction.channel;
      if (!channel) return;
      if (val === 'bug_guild') {
        await channel.send({ content: `<@&${DEV_ROLE_ID}> דווח על באג בשרת. אנא פרט/צרף תמונות.` });
        return;
      }
      if (val === 'bug_bot') {
        let bots = [];
        try {
          await channel.guild.members.fetch();
          bots = channel.guild.members.cache.filter(m => m.user.bot).map(m => ({ label: m.user.username, value: `bot_${m.id}` }));
        } catch (err) { console.error('fetch members error:', err); }
        if (!bots.length) { await channel.send('לא נמצאו בוטים בשרת לדיווח. אנא ציין את שם הבוט בהודעה.'); return; }
        bots = bots.slice(0, 25);
        const options = bots.map(b => new StringSelectMenuOptionBuilder().setLabel(b.label).setValue(b.value));
        const botSelect = new StringSelectMenuBuilder().setCustomId('bug_bot_select').setPlaceholder('בחר את הבוט המדווח...').addOptions(options);
        await channel.send({ content: 'בחר את הבוט ממנו ראית את הבאג:', components: [new ActionRowBuilder().addComponents(botSelect)] });
        return;
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'bug_bot_select') {
      await interaction.deferUpdate();
      const botId = interaction.values[0].split('_')[1];
      const channel = interaction.channel;
      if (!channel) return;
      await channel.send({ content: `<@&${DEV_ROLE_ID}> דיווח על באג בבוט <@${botId}>. אנא פרטו מה קרה וצירפו לוגים/סקרינשוטים.` });
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('apply_modal')) {
      await interaction.deferReply({ ephemeral: true });
      const applicantId = interaction.user.id;
      const fullName = interaction.fields.getTextInputValue('fullName');
      const about = interaction.fields.getTextInputValue('about');
      const channel = interaction.channel;
      if (!channel) return interaction.followUp({ content: 'שגיאה: לא ניתן למצוא את הערוץ.', ephemeral: true });
      const embed = new EmbedBuilder().setTitle('טופס קבלה חדש').addFields(
        { name: 'מועמד', value: `<@${applicantId}>`, inline: true },
        { name: 'שם מלא', value: fullName, inline: true },
        { name: 'למה רוצה להצטרף', value: about }
      ).setColor(0x00AE86);
      await channel.send({ content: `<@&${TEAM_ROLE_ID}> נפתחה בקשת קבלה לצוות.`, embeds: [embed] });
      await interaction.followUp({ content: 'הטופס נשלח בהצלחה! תודה 🙏', ephemeral: true });
      return;
    }
  } catch (err) { console.error('interaction handler error:', err); }
});

const PORT = process.env.PORT || 3000;
const app = express();
app.get('/', (req, res) => res.send('Eddy Bot is online!'));
app.get('/health', (req, res) => res.status(200).send('OK'));
registerMinecraftApiRoutes(app);
app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Web server running on port ${PORT}`));

client.login(process.env.TOKEN);