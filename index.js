require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// טעינת פקודות
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath);

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('name' in command && 'execute' in command) {
    client.commands.set(command.name, command);
    console.log(`📝 טעינת פקודה: ${command.name}`);
  }
}

// רשימת מילים לא יפות
const badWords = ["חרא", "מניאק", "זונה", "בן זונה", "דפוק", "מטומטם", "מפגר"];

// מעקב אזהרות
const warnings = new Map();

// =====================
//     EVENT READY
// =====================
client.once('ready', () => {
  console.log('✅ הבוט פעיל!');
  client.user.setActivity('!help לעזרה');
});

// =====================
//     פקודות !
// =====================
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  const command = client.commands.get(commandName);

  if (!command) return;

  try {
    await command.execute(message, args, client);
  } catch (err) {
    console.error(err);
    message.reply("❌ שגיאה בהרצת פקודה");
  }
});

// =============================
//   מערכת מילים לא יפות + מיוט
// =============================
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();
  const found = badWords.some(word => content.includes(word));

  if (!found) return;

  const userId = message.author.id;
  const guild = message.guild;

  // העלאת אזהרות
  let count = warnings.get(userId) || 0;
  count++;
  warnings.set(userId, count);

  await message.reply(`⚠ **שפה לא מתאימה!** (${count}/3)`);

  // אחרי 3 אזהרות → מיוט
  if (count >= 3) {
    warnings.delete(userId);

    // מחפש רול Muted
    let mutedRole = guild.roles.cache.find(r => r.name === "Muted");

    // אם אין — יוצר רול חדש
    if (!mutedRole) {
      mutedRole = await guild.roles.create({
        name: "Muted",
        color: "#2f3136",
        permissions: []
      });

      // חוסם שליחת הודעות בכל הערוצים
      guild.channels.cache.forEach(channel => {
        channel.permissionOverwrites.edit(mutedRole, {
          SendMessages: false,
          AddReactions: false,
          Speak: false
        });
      });

      console.log("✔ נוצר רול Muted חדש");
    }

    // נותן למשתמש מיוט
    const member = guild.members.cache.get(userId);
    await member.roles.add(mutedRole);

    message.channel.send(`🔇 ${message.author} קיבל **מיוט** על שימוש בשפה לא מתאימה.`);
  }
});

// ===================================
//  תגובה אוטומטית לטיקט של TicketTool
// ===================================
client.on('channelCreate', async channel => {
  try {
    if (!channel.name.startsWith("ticket-")) return;

    await channel.send(
      `<@932219806537625621> Welcome 🎫  
אנא כתוב מה הבעיה ואנחנו נטפל בה 😊`
    );

    console.log(`✔ נשלח Welcome לטיקט: ${channel.name}`);

  } catch (err) {
    console.error("שגיאה בטיקט:", err);
  }
});

// ==========================
//   זיהוי מי פתח את הטיקט
// ==========================
client.on('messageCreate', async message => {
  if (!message.channel.name.startsWith("ticket-")) return;
  if (!message.author.bot) return;

  const opener = message.mentions.users.first();
  if (!opener) return;

  await message.channel.send(`👋 היי ${opener}, קיבלתי את הטיקט שלך! איך אפשר לעזור?`);
});


// =====================
//       LOGIN
// =====================
client.login(process.env.TOKEN);
