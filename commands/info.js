module.exports = {
  name: 'info',
  description: 'מציג מידע על הבוט',
  execute(message, args, client) {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    
    const infoMessage = `
🤖 **מידע על הבוט**

**שם:** ${client.user.tag}
**ID:** ${client.user.id}
**שרתים:** ${client.guilds.cache.size}
**משתמשים:** ${client.users.cache.size}
**זמן פעילות:** ${hours}ש ${minutes}ד ${seconds}ש
**Discord.js גרסה:** ${require('discord.js').version}
**Node.js גרסה:** ${process.version}

✨ נוצר עם Discord.js
    `;
    
    message.reply(infoMessage);
  },
};