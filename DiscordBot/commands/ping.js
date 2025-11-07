module.exports = {
  name: 'ping',
  description: 'בדיקת זמן תגובה של הבוט',
  async execute(message, args, client) {
    const sent = await message.reply('🏓 בודק...');
    const latency = sent.createdTimestamp - message.createdTimestamp;
    const apiLatency = Math.round(client.ws.ping);
    
    sent.edit(`🏓 פונג!\n⏱️ זמן תגובה: ${latency}ms\n🌐 API Latency: ${apiLatency}ms`);
  },
};
