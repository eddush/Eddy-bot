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

client.once('ready', () => {
  console.log('✅ הבוט מחובר ופעיל!');
  console.log(`🤖 מחובר בתור: ${client.user.tag}`);
  console.log(`🌐 שרתים: ${client.guilds.cache.size}`);
  console.log(`📊 משתמשים: ${client.users.cache.size}`);
  console.log('----------------------------');
  
  client.user.setActivity('!help לעזרה');
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

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

client.on('error', error => {
  console.error('❌ שגיאת Discord:', error);
});

process.on('unhandledRejection', error => {
  console.error('❌ Unhandled promise rejection:', error);
});

const token = process.env.TOKEN;

if (!token) {
  console.error('❌ שגיאה: לא נמצא DISCORD_TOKEN בקובץ .env');
  console.error('📝 אנא צור קובץ .env והוסף את טוקן הבוט שלך');
  console.error('💡 ראה את הקובץ .env.example לדוגמה');
  process.exit(1);
}

client.login(token).catch(error => {
  console.error('❌ שגיאה בהתחברות לדיסקורד:', error);
  console.error('💡 וודא שהטוקן תקין ושהבוט מופעל בפורטל Discord Developer');
  process.exit(1);
});
