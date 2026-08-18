require('dotenv').config();
const { Client, GatewayIntentBits, Collection, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, Events, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');

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

// ------ קונפיג / רולים שאתה נתת ------
const TEAM_ROLE_ID = '1439948657670754324';      // רול צוות
const DEV_ROLE_ID = '1442556761541447720';       // רול Developer

// ------ מילים לא יפות + אזהרות ------
const badWords = ["חרא", "מניאק", "זונה", "בן זונה", "דפוק", "מטומטם", "מפגר"];
const warnings = new Map(); // מפה: userId => count

// ------ START ------
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity('!help | Ticket automation');
});

// -----------------------------
// מקש הפקודות (!commands)
// -----------------------------
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

// -----------------------------
// סינון מילים לא יפות + מיוט אחרי 3
// -----------------------------
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

    // חפש או צור רול Muted
    let muted = message.guild.roles.cache.find(r => r.name === 'Muted');
    if (!muted) {
      muted = await message.guild.roles.create({
        name: 'Muted',
        permissions: []
      });

      // חסימת הודעות בכל הערוצים
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

            // הסרת מיוט אחרי 10 דקות
      setTimeout(async () => {
        try {
          await member.roles.remove(muted);
      
          // שליחת הודעה בפרטי
          try {
            await member.send(`🔈 היי! המיוט שלך הוסר עכשיו. אנא הקפד לשמור על שפה מתאימה 😊`);
          } catch (err) {
            console.log('❌ לא ניתן לשלוח DM למשתמש.');
          }
      
        } catch (err) {
          console.log('❌ שגיאה בהסרת המיוט:', err);
        }
      }, 10 * 60 * 1000);
    }
  }
});

// -----------------------------
// כשנוצר ערוץ חדש (TicketTool יוצר channel בשם ticket-XXXX)
// שולח הודעת ברוכים הבאים עם Dropdown ראשי
// -----------------------------
client.on('channelCreate', async channel => {
  try {
    if (!channel || !channel.name) return;
    if (!channel.name.startsWith('ticket-')) return;

    // יצירת תפריט ראשי - קטגוריות
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
  } catch (err) {
    console.error('channelCreate error:', err);
  }
});

// -----------------------------
// טיפול באינטראקציות (Select menus / Modal submissions)
// -----------------------------
client.on(Events.InteractionCreate, async interaction => {
  try {
    // ----- SELECT: תפריט ראשי -----
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_main_select') {
      await interaction.deferUpdate(); // נשמר על המסך המקורי

      const choice = interaction.values[0];
      const channel = interaction.channel;
      if (!channel) return;

      if (choice === 'apply_team') {
        // פותח Modal טופס קבלה
        const modal = new ModalBuilder()
          .setCustomId(`apply_modal|${interaction.user.id}`)
          .setTitle('טופס קבלה לצוות');

        const nameInput = new TextInputBuilder()
          .setCustomId('fullName')
          .setLabel('שם מלא')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const aboutInput = new TextInputBuilder()
          .setCustomId('about')
          .setLabel('למה אתה רוצה להצטרף לצוות? (קצת עליך)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(nameInput);
        const row2 = new ActionRowBuilder().addComponents(aboutInput);

        modal.addComponents(row1, row2);
        await interaction.showModal(modal);
        return;
      }

      if (choice === 'bugs') {
        // תצוגת תת-תפריט לבחירת סוג הבאג
        const bugSelect = new StringSelectMenuBuilder()
          .setCustomId('bug_type_select')
          .setPlaceholder('בחר סוג באג...')
          .addOptions([
            { label: 'באג של בוט', value: 'bug_bot', description: 'דווח על באג בבוט' },
            { label: 'באג בשרת', value: 'bug_guild', description: 'דווח על באג שקשור לשרת' },
          ]);

        const row = new ActionRowBuilder().addComponents(bugSelect);
        await channel.send({ content: `${interaction.user} בחרת ב"באגים" — בחר סוג:`, components: [row] });
        return;
      }

      if (choice === 'other') {
        // תיוג צוות כללי
        await channel.send({ content: `<@&${TEAM_ROLE_ID}> פנייה מסוג "אחר" נפתחה. אנא בדקו.` });
        return;
      }
    }

    // ----- SELECT: סוג הבאג -----
    if (interaction.isStringSelectMenu() && interaction.customId === 'bug_type_select') {
      await interaction.deferUpdate();
      const val = interaction.values[0];
      const channel = interaction.channel;
      if (!channel) return;

      if (val === 'bug_guild') {
        // אם זה באג בשרת - נשאל מה הבעיה ונתיוג Developer
        await channel.send({ content: `<@&${DEV_ROLE_ID}> דווח על באג בשרת. אנא פרט/צרף תמונות.` });
        return;
      }

      if (val === 'bug_bot') {
        // בבאג של בוט - נשלח תפריט של בוטים שנמצאים בשרת (אוטומטית)
        // נשלוף עד 25 בוטים
        let bots = [];
        try {
          await channel.guild.members.fetch(); // טען את החברים
          bots = channel.guild.members.cache.filter(m => m.user.bot).map(m => ({ label: m.user.username, value: `bot_${m.id}` }));
        } catch (err) {
          console.error('fetch members error:', err);
        }

        if (!bots.length) {
          await channel.send('לא נמצאו בוטים בשרת לדיווח. אנא ציין את שם הבוט בהודעה.');
          return;
        }

        // רק עד 25 אופציות
        bots = bots.slice(0, 25);
        const options = bots.map(b => new StringSelectMenuOptionBuilder().setLabel(b.label).setValue(b.value));
        const botSelect = new StringSelectMenuBuilder()
          .setCustomId('bug_bot_select')
          .setPlaceholder('בחר את הבוט המדווח...')
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(botSelect);
        await channel.send({ content: 'בחר את הבוט ממנו ראית את הבאג:', components: [row] });
        return;
      }
    }

    // ----- SELECT: בחר בוט לדיווח -----
    if (interaction.isStringSelectMenu() && interaction.customId === 'bug_bot_select') {
      await interaction.deferUpdate();
      const val = interaction.values[0]; // 'bot_<id>'
      const botId = val.split('_')[1];
      const channel = interaction.channel;
      if (!channel) return;

      // תיוג Developer + שליחת טקסט עם פרטים
      await channel.send({ content: `<@&${DEV_ROLE_ID}> דיווח על באג בבוט <@${botId}>. אנא פרטו מה קרה וצירפו לוגים/סקרינשוטים.` });
      return;
    }

    // ----- Modal submission: טופס קבלה לצוות -----
    if (interaction.isModalSubmit() && interaction.customId.startsWith('apply_modal')) {
      await interaction.deferReply({ ephemeral: true });

      const applicantId = interaction.user.id;
      const fullName = interaction.fields.getTextInputValue('fullName');
      const about = interaction.fields.getTextInputValue('about');

      const channel = interaction.channel;
      if (!channel) return interaction.followUp({ content: 'שגיאה: לא ניתן למצוא את הערוץ.', ephemeral: true });

      // שליחת המידע בערוץ הטיקט ותיוג צוות
      const embed = new EmbedBuilder()
        .setTitle('טופס קבלה חדש')
        .addFields(
          { name: 'מועמד', value: `<@${applicantId}>`, inline: true },
          { name: 'שם מלא', value: fullName, inline: true },
          { name: 'למה רוצה להצטרף', value: about }
        )
        .setColor(0x00AE86);

      await channel.send({ content: `<@&${TEAM_ROLE_ID}> נפתחה בקשת קבלה לצוות.`, embeds: [embed] });

      // אפשר גם לתת רול צוות באופן אוטומטי אם רוצים — כרגע רק תיוג צוות בלבד
      await interaction.followUp({ content: 'הטופס נשלח בהצלחה! תודה 🙏', ephemeral: true });
      return;
    }

  } catch (err) {
    console.error('interaction handler error:', err);
  }
});

// -----------------------------
// מיילסטון: למנוע יחס של הבוט להודעות שלו (אין לולאה)
// שאר האיוונטים כבר מתחשבים ב.author.id/role
// -----------------------------

// -----------------------------
// Fake server ל-Render
// -----------------------------
const app = express();


const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Eddy Bot is online!');
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// -----------------------------
// התחברות
// -----------------------------
client.login(process.env.TOKEN);
