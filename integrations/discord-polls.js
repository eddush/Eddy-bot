const CHANNEL_ID = '1426103035028967434';
const API_URL = String(process.env.EDDYWEB_API_URL || 'https://eddydev.ddns.net').replace(/\/$/, '');
const timers = new Map();
const closing = new Set();

async function api(body) {
  const secret = process.env.EDDYBOT_POLLS_SECRET;
  if (!secret) throw new Error('EDDYBOT_POLLS_SECRET is not configured');
  const response = await fetch(API_URL + '/api/polls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-eddybot-secret': secret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.message || 'EddyWEB poll API failed');
  return data;
}

function pollPayload(message) {
  const poll = message.poll;
  if (!poll) return null;
  const question = String(poll.question?.text || '').trim();
  const answers = [...poll.answers.values()];
  const options = answers.map(answer => String(answer.text || '').trim()).filter(Boolean);
  if (!question || options.length < 2) return null;
  return {
    question,
    options,
    answerIds: answers.map(answer => answer.id),
    discord: {
      guildId: message.guildId,
      channelId: message.channelId,
      messageId: message.id,
      allowMultiselect: !!poll.allowMultiselect,
      expiresAt: poll.expiresAt?.toISOString?.() || null,
      url: message.url
    }
  };
}

async function getUniqueVoters(message) {
  const answers = [...(message.poll?.answers?.values?.() || [])];
  const ids = new Set();
  for (const answer of answers) {
    let after;
    while (true) {
      const users = await answer.fetchVoters({ limit: 100, ...(after ? { after } : {}) });
      for (const user of users.values()) ids.add(user.id);
      if (users.size < 100) break;
      after = users.last()?.id;
      if (!after) break;
    }
  }
  return ids.size;
}

async function finish(client, sitePollId, sourceMessage, reason = 'expired') {
  if (!sitePollId || closing.has(sitePollId)) return;
  closing.add(sitePollId);
  try {
    let message = sourceMessage;
    if (message?.channel?.messages?.fetch) {
      message = await message.channel.messages.fetch(message.id).catch(() => message);
    }
    const answers = [...(message?.poll?.answers?.values?.() || [])];
    const counts = {};
    for (const answer of answers) counts[String(answer.id)] = Number(answer.voteCount || 0);
    let totalVoters = 0;
    let finalized = !!message?.poll?.resultsFinalized;
    try { totalVoters = await getUniqueVoters(message); } catch (error) {
      console.warn('[Discord Polls] Could not fetch voters:', error?.message || error);
      if (!message?.poll?.allowMultiselect) totalVoters = answers.reduce((sum, answer) => sum + Number(answer.voteCount || 0), 0);
    }
    await api({ action: 'discord_close', pollId: sitePollId, totalVoters, counts, finalized });
    const channel = message?.channel;
    if (channel?.isTextBased?.()) {
      const resultLines = answers.map(answer => {
        const label = answer.text || answer.emoji?.name || 'אפשרות';
        return '• **' + label + '** — ' + Number(answer.voteCount || 0);
      });
      const note = finalized ? '' : '\n\n_התוצאות עדיין לא סופיות ב־Discord._';
      await channel.send({
        content: '📊 **הסקר הסתיים!**\n' +
          (message?.url ? '[צפייה בסקר המקורי](' + message.url + ')\n' : '') +
          '**מספר מצביעים ב־Discord:** ' + totalVoters +
          (resultLines.length ? '\n' + resultLines.join('\n') : '') +
          note,
        allowedMentions: { parse: [] }
      });
    }
    const timer = timers.get(sitePollId);
    if (timer) clearTimeout(timer);
    timers.delete(sitePollId);
    console.log('[Discord Polls] Closed site poll', sitePollId, 'reason:', reason);
  } catch (error) {
    console.error('[Discord Polls] Close failed:', error?.message || error);
    closing.delete(sitePollId);
  }
}

function schedule(client, poll) {
  const id = poll.id;
  const discord = poll.discord || {};
  if (!id || !discord.channelId || !discord.messageId) return;
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);
  const endAt = discord.expiresAt ? new Date(discord.expiresAt).getTime() : 0;
  if (!endAt) return;
  const delay = Math.max(0, Math.min(endAt - Date.now(), 2147480000));
  const timer = setTimeout(async () => {
    try {
      const channel = await client.channels.fetch(discord.channelId);
      const message = await channel.messages.fetch(discord.messageId);
      if (message.poll && !message.poll.resultsFinalized && message.poll.expiresAt <= new Date()) {
        await message.poll.end().catch(() => {});
      }
      await finish(client, id, message, 'scheduled-expiry');
    } catch (error) {
      console.error('[Discord Polls] Expiry check failed:', error?.message || error);
    }
  }, delay);
  timer.unref?.();
  timers.set(id, timer);
}

async function installDiscordPolls(client) {
  client.on('messageCreate', async message => {
    if (message.channelId !== CHANNEL_ID || !message.guildId || message.author?.bot || !message.poll) return;
    try {
      const payload = pollPayload(message);
      if (!payload) return;
      const result = await api({ action: 'discord_create', ...payload });
      if (result.poll) schedule(client, result.poll);
      console.log('[Discord Polls] Synced', message.id, 'to EddyWEB');
    } catch (error) {
      console.error('[Discord Polls] Sync failed:', error?.message || error);
      message.channel.send('⚠️ לא הצלחתי לסנכרן את הסקר עם EddyWEB.').catch(() => {});
    }
  });

  client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (newMessage.channelId !== CHANNEL_ID || !newMessage.poll?.resultsFinalized) return;
    try {
      const data = await api({ action: 'discord_list_open' });
      const poll = (data.polls || []).find(item => item.discord?.messageId === newMessage.id);
      if (poll) await finish(client, poll.id, newMessage, 'manually-ended');
    } catch (error) {
      console.error('[Discord Polls] Update handling failed:', error?.message || error);
    }
  });

  client.once('ready', async () => {
    try {
      const data = await api({ action: 'discord_list_open' });
      for (const poll of data.polls || []) schedule(client, poll);
      console.log('[Discord Polls] Restored', (data.polls || []).length, 'open polls');
    } catch (error) {
      console.error('[Discord Polls] Restore failed:', error?.message || error);
    }
  });
}

module.exports = { installDiscordPolls };
