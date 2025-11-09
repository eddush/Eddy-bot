const { EmbedBuilder } = require("discord.js");

module.exports = {
    name: "h",
    description: "Help command for team",
    execute(message, args) {
        if (args[0] === "test") {
            // הסרת המילה הראשונה ("test") מהסיבה
            const reason = args.slice(1).join(" ") || "אין סיבה";

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
        } else {
            message.channel.send("שימוש לא נכון. נסה: `!h test <סיבה>`");
        }
    }
};
