module.exports = {
  name: 'send',
  description: 'שולח הודעה לערוץ ספציפי (!send #ערוץ הודעה כאן)',
  async execute(message, args, client) {
    if (!message.guild) {
      return message.reply('❌ פקודה זו זמינה רק בשרתים!');
    }

    if (!message.member || !message.member.permissions?.has('ManageMessages')) {
      return message.reply('❌ אין לך הרשאה לשלוח הודעות דרך הבוט!');
    }

    if (args.length < 2) {
      return message.reply('❌ שימוש: !send #ערוץ הודעה כאן\nדוגמה: !send #general שלום לכולם!');
    }

    const channelMention = args[0];
    const messageContent = args.slice(1).join(' ');

    const channelId = channelMention.replace(/[<#>]/g, '');
    const targetChannel = client.channels.cache.get(channelId);

    if (!targetChannel) {
      return message.reply('❌ הערוץ לא נמצא! וודא שאתה מזכיר ערוץ תקין.');
    }

    if (!targetChannel.isTextBased()) {
      return message.reply('❌ זה לא ערוץ טקסט!');
    }

    try {
      await targetChannel.send(messageContent);
      message.reply(`✅ ההודעה נשלחה בהצלחה ל-${channelMention}!`);
      console.log(`📤 ${message.author.tag} שלח הודעה ל-${targetChannel.name}: ${messageContent}`);
    } catch (error) {
      console.error('שגיאה בשליחת הודעה:', error);
      message.reply('❌ שגיאה בשליחת ההודעה. וודא שלבוט יש הרשאות לשלוח הודעות בערוץ זה.');
    }
  },
};
