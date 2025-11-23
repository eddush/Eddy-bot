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

client.commands = new Collection();

// -----------------------------
// 🔧 טעינת פקודות מתיקיית commands
// -----------------------------
const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) {
  fs.mkdirSync(commandsPath);
}

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('name' in command && 'execute' in command) {
    client.commands.set(command.name, command);
    console.log(`📝 טעינת פקודה: ${command.name}`);
  }
}

// -----------------------------
// 🟢 כאשר הבוט מתחבר
// -----------------------------
client.once('ready', () => {
  console.log('✅ הבוט מחובר ופעיל!');
  console.log(`🤖 מחובר בתור: ${client.user.tag}`);
  console.log(`🌐 שרתים: ${client.guilds.cache.size}`);
  console.log(`📊 משתמשים: ${client.users.cache.size}`);
  console.log('----------------------------');

  client.user.setActivity('שלום הבוט נוצר ע"י Eddyshermant | !help לעזרה');
});

// -----------------------------
// 🚨 מערכת סינון מילים לא יפות
// -----------------------------
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // רשימת מילים אסורות בעברית
  const badWords = [
    "חרא",
    "זבל",
    "בן זונה",
    "שרמוטה",
    "זונה",
    "מניאק",
    "טמבל",
    "מטומטם",
    "כלב בן כלב",
    "דפוק"
  ];

  const msg = message.content.toLowerCase();

  // בדיקה אם ההודעה מכילה מילה אסורה
  const found = badWords.some(word => msg.includes(word));

  if (found) {
    try {
      await message.delete();
    } catch {}

    await message.channel.send(`⚠️ ${message.author} בבקשה לא להשתמש במילים לא יפות!`);

    console.log(`🚨 הודעה נמחקה בגלל מילה אסורה: "${message.content}" מאת ${message.author.tag}`);

    return; // חשוב – לא להמשיך לפקודות
  }

  // -----------------------------
  // 🟦 מערכת הפקודות הרגילה
  // -----------------------------
  const prefix = '!';
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  const command = client.commands.get(commandName);
  if (!command) return;

  try {
    console.log(`⚡ הפעלת פקודה: ${commandName} על ידי ${message.author.tag}`);
    await command.execute(message, args, client);
  } catch (error) {
    console.error(`❌ שגיאה בפקודה ${commandName}:`, error);
    await message.reply('אירעה שגיאה בעת ביצוע הפקודה!');
  }
});

// -----------------------------
// ❌ טיפול בשגיאות
// -----------------------------
client.on('error', error => {
  console.error('❌ שגיאת Discord:', error);
});

process.on('unhandledRejection', error => {
  console.error('❌ Unhandled promise rejection:', error);
});

// -----------------------------
// 🔑 התחברות לבוט
// -----------------------------
const token = process.env.TOKEN;

if (!token) {
  console.error('❌ שגיאה: לא נמצא TOKEN בקובץ .env');
  process.exit(1);
}

client.login(token).catch(error => {
  console.error('❌ שגיאה בהתחברות לדיסקורד:', error);
  process.exit(1);
});
