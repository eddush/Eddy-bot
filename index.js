require('dotenv').config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const { Client, GatewayIntentBits, Collection } = require("discord.js");

// יצירת לקוח דיסקורד
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// טעינת פקודות מתוך תיקייה /commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        client.commands.set(command.name, command);
    }
}

// אירוע: כאשר הבוט מוכן
client.on("ready", () => {
    console.log(`🤖 Bot is online as ${client.user.tag}`);
});

// אירוע: הודעה
client.on("messageCreate", message => {
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
