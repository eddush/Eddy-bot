module.exports = {
  name: 'echo',
  description: 'הבוט חוזר על מה שאמרת (!echo הודעה כאן)',
  execute(message, args) {
    if (args.length === 0) {
      return message.reply('❌ אנא כתוב הודעה לחזרה!\nדוגמה: !echo שלום עולם');
    }

    const messageToEcho = args.join(' ');
    message.channel.send(messageToEcho);
    
    message.delete().catch(() => {});
  },
};
