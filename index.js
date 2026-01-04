// index.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const { Client, GatewayIntentBits, Collection } = require("discord.js");

// ----------------------------
// Discord Bot
// ----------------------------

// יצירת לקוח דיסקורד
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// טעינת פקודות מתוך תיקיית /commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            const command = require(filePath);
            if (!command.name || typeof command.execute !== "function") {
                console.warn(`⚠️ Command file ${file} חסר name או execute, מדלג...`);
                continue;
            }
            client.commands.set(command.name, command);
            console.log(`✅ Loaded command: ${command.name}`);
        } catch (err) {
            console.error(`❌ Error loading command ${file}:`, err);
        }
    }
} else {
    console.warn("⚠️ commands folder not found, no commands loaded.");
}

// אירוע: כאשר הבוט מוכן
client.on("ready", () => {
    console.log(`🤖 Bot is online as ${client.user.tag}`);
});

// אירוע: הודעה
client.on("messageCreate", message => {
    // לא להגיב לבוטים אחרים (או לעצמך)
    if (message.author.bot) return;

    // רק פקודות שמתחילות ב-!
    if (!message.content.startsWith("!")) return;

    const args = message.content.slice(1).split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.get(commandName);
    if (!command) return;

    try {
        command.execute(message, args, client);
    } catch (error) {
        console.error(error);
        message.reply("❌ הייתה שגיאה בהרצת הפקודה.");
    }
});

// התחברות לדיסקורד
client.login(process.env.TOKEN).catch(err => {
    console.error("❌ Failed to login to Discord. בדוק את TOKEN ב-.env / Render:", err);
});

// ----------------------------
// Fake server ל־Render
// ----------------------------

const app = express();

app.get("/", (req, res) => {
    res.send("Bot is running!");
});

// ב-Render חובה להאזין על process.env.PORT
// לוקאלית (על המחשב) יהיה 3000 אם אין PORT
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Fake server running on port ${PORT}`);
});
    const args = message.content.slice(1).split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.get(commandName);
    if (!command) return;

    try {
        command.execute(message, args, client);
    } catch (error) {
        console.error(error);
        message.reply("❌ הייתה שגיאה בהרצת הפקודה.");
    }
});

// התחברות לדיסקורד
client.login(process.env.TOKEN);

// ----------------------------
// Fake server ל־Render
// ----------------------------

const express = require("express");
const app = express();

app.get("/", (req, res) => {
    res.send("Bot is running!");
});

// ב-Render *חובה* להשתמש ב-process.env.PORT בלי ברירת מחדל אחרת
const PORT = process.env.PORT;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Fake server running on port ${PORT}`);
});
