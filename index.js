require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// טעינת פקודות
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath);

const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command.name && command.execute) {
        client.commands.set(command.name, command);
        console.log(`📝 טעינת פקודה: ${command.name}`);
    }
}

// רשימת מילים לא יפות
const badWords = ["חרא", "מניאק", "זונה", "בן זונה", "דפוק", "מטומטם", "מפגר"];

// מעקב אחרי אזהרות
const warnings = new Map();

client.once('ready', () => {
    console.log("✅ הבוט פעיל!");
    client.user.setActivity("!help לעזרה");
});

// ================================
//          מערכת פקודות !
// ================================
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith("!")) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const cmdName = args.shift().toLowerCase();
    const command = client.commands.get(cmdName);
    if (!command) return;

    try {
        await command.execute(message, args, client);
    } catch (err) {
        console.error(err);
        message.reply("❌ שגיאה בהרצת הפקודה.");
    }
});

// =======================================
//  מילים לא יפות → 3 אזהרות → מיוט אוטומטי
// =======================================
client.on("messageCreate", async message => {
    if (message.author.bot) return;

    const content = message.content.toLowerCase();
    const foundWord = badWords.some(w => content.includes(w));
    if (!foundWord) return;

    const userId = message.author.id;
    const guild = message.guild;

    let count = warnings.get(userId) || 0;
    count++;
    warnings.set(userId, count);

    await message.reply(`⚠ **שפה לא מתאימה!** (${count}/3)`);

    if (count >= 3) {
        warnings.delete(userId);

        // חיפוש רול Muted
        let mutedRole = guild.roles.cache.find(r => r.name === "Muted");

        if (!mutedRole) {
            mutedRole = await guild.roles.create({
                name: "Muted",
                color: "#2f3136",
                permissions: []
            });

            guild.channels.cache.forEach(channel => {
                channel.permissionOverwrites.edit(mutedRole, {
                    SendMessages: false,
                    AddReactions: false,
                    Speak: false
                });
            });

            console.log("✔ נוצר רול Muted חדש");
        }

        const member = guild.members.cache.get(userId);
        await member.roles.add(mutedRole);

        message.channel.send(`🔇 ${message.author} קיבל **מיוט** על שימוש בשפה לא מתאימה.`);
    }
});

// =================================================
//   תגובה אוטומטית כשנוצר טיקט חדש (TicketTool)
// =================================================
client.on("channelCreate", async channel => {
    try {
        if (!channel.name.startsWith("ticket-")) return;

        await channel.send(
            `<@932219806537625621> Welcome 🎫  
אנא כתוב מה הבעיה ואנחנו נטפל 😊`
        );

        console.log(`✔ הודעת Welcome נשלחה לטיקט: ${channel.name}`);
    } catch (err) {
        console.error("שגיאה בטיקט:", err);
    }
});

// =================================================
//   זיהוי מי פתח את הטיקט (רק TicketTool, אין לולאה!)
// =================================================
client.on("messageCreate", async message => {
    if (!message.channel.name.startsWith("ticket-")) return;

    // רק הודעות של TicketTool כדי לא ליצור לולאה
    if (message.author.id !== "557628352828014614") return;

    const opener = message.mentions.users.first();
    if (!opener) return;

    await message.channel.send(`👋 היי ${opener}, קיבלתי את הטיקט שלך! איך אפשר לעזור?`);
});

client.login(process.env.TOKEN);
