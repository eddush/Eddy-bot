const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

module.exports = {
    name: "h",
    description: "Help command for team",
    async execute(message, args) {
        // מוצא את הסיבה מהטקסט אחרי הפקודה
        const reason = args.join(" ") || "אין סיבה";

        // מוצא את הרול בשם "צוות"
        const teamRole = message.guild.roles.cache.find(role => role.name === "צוות");
        const supreedteam = message.guild.roles.cache.find(role => role.name === "supreedteam");

        if (!teamRole) {
            return message.channel.send("❌ לא נמצא רול בשם 'צוות'.");
        }

        const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("🆘<:image0:1442833732762341437> קריאה לעזרה לצוות!")
            .setDescription(`${supreedteam} ${teamRole}, יש קריאה לעזרה!`)
            .addFields(
                { name: "📢 מי ביקש עזרה:", value: `${message.author}`, inline: true },
                { name: "📝 סיבה:", value: reason, inline: false }
            )
            .setFooter({ text: "מערכת הקריאות לצוות", iconURL: message.guild.iconURL() })
            .setTimestamp();

        const handleButton = new ButtonBuilder()
            .setCustomId("handle_help")
            .setLabel("טפל")
            .setEmoji("🛠️")
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(handleButton);

        const sentMessage = await message.channel.send({
            embeds: [embed],
            components: [row]
        });

        const collector = sentMessage.createMessageComponentCollector({
            time: 10 * 60 * 1000
        });

        collector.on("collect", async interaction => {
            // רק מי שיש לו את הרול "צוות" יכול לטפל
            if (!interaction.member.roles.cache.has(teamRole.id)) {
                return interaction.reply({
                    content: "❌ רק צוות יכול לטפל בקריאה הזאת.",
                    ephemeral: true
                });
            }

            const handledEmbed = EmbedBuilder.from(embed)
                .setColor(0x00ff00)
                .setTitle("✅ הקריאה בטיפול")
                .setDescription(`${interaction.user} מטפל בקריאה הזאת.`)
                .addFields(
                    { name: "📢 מי ביקש עזרה:", value: `${message.author}`, inline: true },
                    { name: "📝 סיבה:", value: reason, inline: false },
                    { name: "🛠️ מטופל על ידי:", value: `${interaction.user}`, inline: true }
                );

            const disabledButton = ButtonBuilder.from(handleButton)
                .setDisabled(true)
                .setLabel("בטיפול");

            const disabledRow = new ActionRowBuilder().addComponents(disabledButton);

            await interaction.update({
                embeds: [handledEmbed],
                components: [disabledRow]
            });

            collector.stop("handled");
        });

        collector.on("end", async (_, reason) => {
            if (reason === "handled") return;

            const disabledButton = ButtonBuilder.from(handleButton)
                .setDisabled(true)
                .setLabel("פג תוקף");

            const disabledRow = new ActionRowBuilder().addComponents(disabledButton);

            await sentMessage.edit({ components: [disabledRow] }).catch(() => {});
        });
    }
};
