const { AttachmentBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'tr',
  async execute(message) {
    // Only server staff can create transcripts.
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('❌ אין לך הרשאה להשתמש בפקודה הזאת.');
    }

    if (!message.guild || !message.channel?.isTextBased()) {
      return message.reply('❌ אפשר להשתמש בפקודה הזאת רק בערוץ טקסט בשרת.');
    }

    const status = await message.reply('⏳ שומר את הצ׳אט, רגע...');
    const allMessages = [];
    let lastId;

    try {
      // Discord returns at most 100 messages per request, so keep paging.
      while (true) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;

        const batch = await message.channel.messages.fetch(options);
        if (batch.size === 0) break;

        allMessages.push(...batch.values());
        lastId = batch.last().id;

        if (batch.size < 100) break;
      }

      allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      const esc = (value = '') => String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      const rows = allMessages.map(msg => {
        const time = new Date(msg.createdTimestamp).toLocaleString('he-IL', {
          dateStyle: 'short',
          timeStyle: 'medium'
        });
        const attachments = [...msg.attachments.values()]
          .map(a => `<div class="attachment"><a href="${esc(a.url)}">📎 ${esc(a.name || 'קובץ')}</a></div>`)
          .join('');
        const content = esc(msg.content || '').replace(/\n/g, '<br>');

        return `<div class="message">
          <div class="author">${esc(msg.author.tag)} <span>${esc(time)}</span></div>
          <div class="content">${content || '<i>הודעה ללא טקסט</i>'}${attachments}</div>
        </div>`;
      }).join('\n');

      const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Transcript - ${esc(message.guild.name)} - #${esc(message.channel.name)}</title>
<style>
body{font-family:Arial,sans-serif;background:#202225;color:#fff;margin:0;padding:24px}
.header{background:#2f3136;border-radius:12px;padding:18px;margin-bottom:18px}
.header h1{margin:0 0 8px;font-size:22px}.header p{margin:0;color:#b9bbbe}
.message{background:#2f3136;border-radius:10px;padding:10px 14px;margin:8px 0}
.author{font-weight:bold}.author span{font-size:12px;color:#8e9297;font-weight:normal;margin-right:8px}
.content{margin-top:5px;line-height:1.5;word-break:break-word}.content i{color:#8e9297}
.attachment{margin-top:7px}.attachment a{color:#00aff4;text-decoration:none}
</style>
</head>
<body>
<div class="header"><h1>📄 Transcript</h1><p>שרת: ${esc(message.guild.name)} | ערוץ: #${esc(message.channel.name)} | ${allMessages.length} הודעות</p></div>
${rows || '<p>אין הודעות לשמירה.</p>'}
</body>
</html>`;

      const buffer = Buffer.from(html, 'utf8');
      const safeChannel = message.channel.name.replace(/[^a-zA-Z0-9א-ת_-]/g, '_').slice(0, 40) || 'channel';
      const fileName = `transcript-${safeChannel}-${Date.now()}.html`;
      const attachment = new AttachmentBuilder(buffer, { name: fileName });

      await message.channel.send({
        content: `✅ נשמר הצ׳אט של **#${message.channel.name}** — ${allMessages.length} הודעות.`,
        files: [attachment]
      });

      await status.delete().catch(() => {});
    } catch (error) {
      console.error('Transcript error:', error);
      await status.edit('❌ לא הצלחתי לשמור את הצ׳אט. בדוק שלבוט יש הרשאת **Read Message History** ו־**View Channel**.').catch(() => {});
    }
  }
};
