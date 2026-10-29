const { EmbedBuilder } = require('discord.js');
const { getPlayerData, formatMoney } = require('../services/player-data');

module.exports = {
  name: 'player',
  description: 'מציג כסף ודרגה של שחקן Minecraft מתוך מסד הנתונים של EddyWEB',
  async execute(message, args) {
    const username = String(args[0] || '').trim();
    if (!username) {
      return message.reply('שימוש: `!player <Minecraft username>`\nלדוגמה: `!player Eddy_SH`');
    }

    await message.channel.sendTyping().catch(() => {});
    try {
      const player = await getPlayerData(username);
      if (!player) return message.reply('❌ השחקן לא נמצא בנתוני LuckPerms של EddyWEB.');

      const rank = player.rank && player.rank.toLowerCase() !== 'default'
        ? player.rank
        : 'ללא דרגה מיוחדת';

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎮 פרופיל Minecraft')
        .setDescription('נתונים מתוך מסד הנתונים של EddyWEB')
        .addFields(
          { name: '👤 שחקן', value: player.username, inline: true },
          { name: '🏅 דרגה', value: rank, inline: true },
          { name: '💰 כסף', value: formatMoney(player.money), inline: true }
        )
        .setFooter({ text: 'EddyWEB • LuckPerms' })
        .setTimestamp();

      return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
    } catch (error) {
      console.error('!player lookup failed:', error.message);
      return message.reply('⚠️ לא הצלחתי לקרוא את נתוני השחקן. בדוק את הגדרות Supabase של הבוט ואת לוגי השרת.');
    }
  }
};
