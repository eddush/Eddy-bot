const { EmbedBuilder } = require('discord.js');
const { requestBalance } = require('../minecraftApi');

module.exports = {
  name: 'balance',

  async execute(message, args) {
    const username = args[0];

    if (!username) {
      return message.reply('❌ שימוש: `!balance <MinecraftUsername>`');
    }

    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
      return message.reply('❌ שם Minecraft לא תקין.');
    }

    const loading = await message.reply(`🔎 בודק את היתרה של **${username}**...`);

    try {
      const balance = await requestBalance(username);

      const embed = new EmbedBuilder()
        .setTitle('💰 יתרת Minecraft')
        .setDescription(`**${username}**`)
        .addFields({
          name: 'Balance',
          value: `💵 **$${Number(balance).toLocaleString('en-US', { maximumFractionDigits: 2 })}**`,
          inline: false,
        })
        .setColor(0x00ae86)
        .setFooter({ text: 'Eddy Bot • Minecraft Economy' });

      await loading.edit({ content: '', embeds: [embed] });
    } catch (error) {
      console.error('Minecraft balance error:', error);
      await loading.edit({
        content: '❌ לא הצלחתי לקבל את היתרה. ודא ששרת Minecraft מחובר ל־API ושהשחקן קיים.',
        embeds: [],
      });
    }
  },
};
