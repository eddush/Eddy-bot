const { getPlayerData, formatMoney } = require('../services/player-data');

module.exports = {
  name: 'balance',
  description: 'מציג את יתרת הכסף של שחקן Minecraft',
  async execute(message, args) {
    const username = String(args[0] || '').trim();
    if (!username) {
      return message.reply('שימוש: `!balance <Minecraft username>`\nלדוגמה: `!balance Eddy_SH`');
    }

    try {
      const player = await getPlayerData(username);
      if (!player) return message.reply('❌ השחקן לא נמצא בנתוני LuckPerms של EddyWEB.');
      return message.reply(`💰 הכסף של **${player.username}**: **${formatMoney(player.money)}**\n🏅 דרגה: **${player.rank && player.rank.toLowerCase() !== 'default' ? player.rank : 'ללא דרגה מיוחדת'}**`);
    } catch (error) {
      console.error('!balance lookup failed:', error.message);
      return message.reply('⚠️ לא הצלחתי לקרוא את נתוני השחקן. בדוק את הגדרות Supabase של הבוט ואת לוגי השרת.');
    }
  },
};
