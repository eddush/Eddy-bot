const { EmbedBuilder } = require("discord.js");

module.exports = {
    name: "h",
    description: "Help command for team",
    execute(message, args) {
        // מוצא את הסיבה מהטקסט אחרי הפקודה
        const reason = args.join(" ") || "אין סיבה";

        // מוצא את הרול בשם "צוות"
        const teamRole = message.guild.roles.cache.find(role => role.name === "צוות");

        if (teamRole) {
            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle("🆘 קריאה לעזרה לצוות!")
                .setDescription(`${teamRole}, יש קריאה לעזרה!`)
                .addFields(
                    { name: "📢 מי ביקש עזרה:", value: `${message.author}`, inline: true },
                    { name: "📝 סיבה:", value: reason, inline: false }
                )
                .setFooter({ text: "מערכת הקריאות לצוות", iconURL: message.guild.iconURL() })
                .setTimestamp();

            message.channel.send({ embeds: [embed] });
        } else {
            message.channel.send("❌ לא נמצא רול בשם 'צוות'.");
        }
    }
};
