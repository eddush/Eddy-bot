module.exports = {
  name: 'info',
  description: 'מציג מידע על הבוט',
  execute(message, args, client) {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const infoEmbed = {
      color: 0x5865F2, // Discord blurple
      title: "🤖 מידע על הבוט",
      description: `שלום! אני **${client.user.tag}**. הנה קצת מידע עליי:`,
      fields: [
        { name: "🆔 ID", value: `${client.user.id}", inline: true },
        { name: "🌐 שרתים", value: `${client.guilds.cache.size}", inline: true },
        { name: "👥 משתמשים", value: `${client.users.cache.size}", inline: true },
        { name: "⏰ זמן פעילות", value: `${hours}ש ${minutes}ד ${seconds}ש", inline: true },
        { name: "📦 Discord.js גרסה", value: require('discord.js').version, inline: true },
        { name: "🖥️ Node.js גרסה", value: process.version, inline: true },
        {
          name: "📝 פקודות זמינות",
          value: client.commands
            ? Array.from(client.commands.values()).map(cmd => `\`${cmd.name}\``).join(", ")
            : "לא נמצאו פקודות",
          inline: false,
        },
      ],
      footer: { text: "✨ נוצר עם Discord.js" },
      timestamp: new Date(),
    };

    message.reply({ embeds: [infoEmbed] });
  },
};
