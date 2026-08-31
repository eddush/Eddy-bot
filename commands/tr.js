const { PermissionFlagsBits, ChannelType, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const TRANSCRIPT_CATEGORY_ID = '1541363285490663455';

module.exports = {
  name: 'tr',
  async execute(message) {
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('❌ אין לך הרשאה להשתמש בפקודה הזאת.');
    }

    if (!message.guild || !message.channel?.isTextBased()) {
      return message.reply('❌ אפשר להשתמש בפקודה הזאת רק בערוץ טקסט בשרת.');
    }

    const status = await message.reply('⏳ שומר את הצ׳אט ויוצר ערוץ transcript...');

    try {
      const allMessages = [];
      let lastId;

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
          .map(a => `<div class="attachment">📎 <a href="${esc(a.url)}">${esc(a.name || 'קובץ')}</a></div>`)
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

      const category = await message.guild.channels.fetch(TRANSCRIPT_CATEGORY_ID).catch(() => null);

      if (!category || category.type !== ChannelType.GuildCategory) {
        return status.edit('❌ לא מצאתי את הקטגוריה עם ה-ID שסיפקת. בדוק שה-ID נכון ושהקטגוריה נמצאת בשרת.');
      }

      const safeName = message.channel.name
        .toLowerCase()
        .replace(/[^a-z0-9א-ת_-]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 70) || 'chat';

      const transcriptChannel = await message.guild.channels.create({
        name: `transcript-${safeName}`,
        type: ChannelType.GuildText,
        parent: TRANSCRIPT_CATEGORY_ID,
        reason: `Transcript created by ${message.author.tag}`
      });

      const header = `# 📄 Transcript\n**שרת:** ${message.guild.name}\n**ערוץ מקורי:** #${message.channel.name}\n**נוצר על ידי:** ${message.author}\n**הודעות:** ${allMessages.length}`;
      await transcriptChannel.send(header);

      const buffer = Buffer.from(html, 'utf8');
      const fileName = `transcript-${safeName}-${Date.now()}.html`;
      const attachment = new AttachmentBuilder(buffer, { name: fileName });

      // Button uses Discord's attachment:// URL so clicking it opens the HTML file.
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('🔗 פתח Transcript')
          .setStyle(ButtonStyle.Link)
          .setURL(`attachment://${fileName}`)
      );

      await transcriptChannel.send({
        content: '📁 **Transcript נשמר בהצלחה!**\nלחץ על הכפתור כדי לפתוח את הקובץ:',
        files: [attachment],
        components: [row]
      });

      await status.edit(`✅ יצרתי את ערוץ ה-Transcript: ${transcriptChannel}`);
    } catch (error) {
      console.error('Transcript error:', error);
      await status.edit('❌ לא הצלחתי ליצור את ה-Transcript. בדוק שלבבוט יש הרשאות **Manage Channels**, **View Channel**, **Send Messages** ו־**Read Message History**.').catch(() => {});
    }
  }
};
