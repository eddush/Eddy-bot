const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const crypto = require('crypto');
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1417557162875555974';
const SECRET_HEADER = 'x-eddyweb-support-secret';
const TICKET_TOPIC_PREFIX = 'eddyweb-ticket:';
const CLOSED_TOPIC_PREFIX = 'eddyweb-closed:';
function safeText(value, max = 4000) { return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max); }
function isAuthorized(req) {
  const expected = String(process.env.EDDYWEB_SUPPORT_SHARED_SECRET || '');
  const supplied = String(req.get(SECRET_HEADER) || '');
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function parseTicketTopic(topic) {
  const match = String(topic || '').match(/^eddyweb-(ticket|closed):([0-9a-f-]{36})\|user:([0-9a-f-]{36})(?:\|discord:(\d{17,20}))?$/i);
  return match ? { closed: match[1] === 'closed', ticketId: match[2], userId: match[3], discordUserId: match[4] || null } : null;
}
function supportEmbed({ title, description, color = 0x25C9B5, fields = [], footer = 'EddyWEB Support' }) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description || null)
    .addFields(fields.filter(field => field.value).map(field => ({
      name: String(field.name).slice(0, 256),
      value: String(field.value).slice(0, 1024),
      inline: Boolean(field.inline)
    })))
    .setFooter({ text: footer })
    .setTimestamp();
}
function installSupportBridge(app, client, getStaffRoleIds) {
  const requireSecret = (req, res, next) => { if (!isAuthorized(req)) return res.status(401).json({ success: false, message: 'Unauthorized' }); next(); };
  app.post('/api/support/tickets', requireSecret, async (req, res) => {
    try {
      const ticketId=safeText(req.body?.ticketId,36), userId=safeText(req.body?.userId,36);
      const subject=safeText(req.body?.subject,100), displayName=safeText(req.body?.displayName,64);
      const firstMessage=safeText(req.body?.firstMessage,4000);
      const discordUserId=safeText(req.body?.discordUserId,20);
      const validDiscordUserId=/^\d{17,20}$/.test(discordUserId)?discordUserId:null;
      if(!/^[0-9a-f-]{36}$/i.test(ticketId)||!/^[0-9a-f-]{36}$/i.test(userId)||subject.length<2||firstMessage.length<2)
        return res.status(400).json({success:false,message:'Invalid support ticket details'});
      const guild=client.guilds.cache.get(GUILD_ID);
      if(!guild)return res.status(503).json({success:false,message:'Discord server is unavailable'});
      const existing=guild.channels.cache.find(channel=>parseTicketTopic(channel.topic)?.ticketId===ticketId);
      if(existing){
        let discordAccessGranted=false;
        if(validDiscordUserId){
          try{
            const member=await guild.members.fetch(validDiscordUserId);
            await existing.permissionOverwrites.edit(member.id,{ViewChannel:true,SendMessages:true,ReadMessageHistory:true,AttachFiles:true,EmbedLinks:true});
            await existing.setTopic(TICKET_TOPIC_PREFIX+ticketId+'|user:'+userId+'|discord:'+validDiscordUserId);
            discordAccessGranted=true;
          }catch(error){console.warn('Could not grant Discord ticket access:',error?.message||error);}
        }
        return res.json({success:true,channelId:existing.id,discordAccessGranted});
      }
      const roleIds=Object.values(getStaffRoleIds()||{}).filter(id=>/^\d{17,20}$/.test(String(id)));
      const overwrites=[
        {id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
        {id:client.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageChannels]},
        ...[...new Set(roleIds)].map(id=>({id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}))
      ];
      const categoryId=String(process.env.SUPPORT_TICKETS_CATEGORY_ID||'').trim();
      const category=categoryId?guild.channels.cache.get(categoryId):null;
      const channel=await guild.channels.create({
        name:('web-'+(displayName||'user')+'-'+ticketId.slice(0,6)).toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').slice(0,90),
        type:ChannelType.GuildText,
        ...(category?.type===ChannelType.GuildCategory?{parent:category.id}:{}),
        topic:TICKET_TOPIC_PREFIX+ticketId+'|user:'+userId+(validDiscordUserId?'|discord:'+validDiscordUserId:''),
        permissionOverwrites:overwrites,reason:'New EddyWEB support ticket'
      });
      let discordAccessGranted=false;
      if(validDiscordUserId){
        try{
          const member=await guild.members.fetch(validDiscordUserId);
          await channel.permissionOverwrites.edit(member.id,{ViewChannel:true,SendMessages:true,ReadMessageHistory:true,AttachFiles:true,EmbedLinks:true});
          discordAccessGranted=true;
        }catch(error){console.warn('Discord ticket owner is not in the server or access could not be granted:',error?.message||error);}
      }
      const ticketEmbed = supportEmbed({
        title: '🎫 פנייה חדשה מ-EddyWEB',
        description: 'נפתחה שיחת תמיכה חדשה באתר. אפשר להשיב כאן והתגובה תישלח אוטומטית לצ׳אט באתר.',
        color: 0x25C9B5,
        fields: [
          { name: '👤 משתמש', value: displayName || 'לא צוין', inline: true },
          { name: '📌 נושא הפנייה', value: subject, inline: true },
          { name: '💬 הודעה ראשונה', value: firstMessage },
          { name: '🆔 מזהה שיחה', value: ticketId, inline: false }
        ],
        footer: 'EddyWEB • מערכת התמיכה'
      });
      await channel.send({ embeds: [ticketEmbed], allowedMentions: { parse: [] } });
      return res.status(201).json({success:true,channelId:channel.id,discordAccessGranted});
    } catch(error) { console.error('EddyWEB support ticket create failed:',error); return res.status(500).json({success:false,message:'Could not create Discord ticket'}); }
  });
  app.post('/api/support/tickets/:ticketId/messages',requireSecret,async(req,res)=>{
    try{
      const ticketId=safeText(req.params.ticketId,36),messageId=safeText(req.body?.messageId,36);
      const content=safeText(req.body?.content,4000),senderName=safeText(req.body?.senderName,64);
      if(!/^[0-9a-f-]{36}$/i.test(ticketId)||!/^[0-9a-f-]{36}$/i.test(messageId)||!content)
        return res.status(400).json({success:false,message:'Invalid message'});
      const guild=client.guilds.cache.get(GUILD_ID);
      const channel=guild?.channels.cache.find(item=>parseTicketTopic(item.topic)?.ticketId===ticketId);
      const topic=parseTicketTopic(channel?.topic);
      if(!channel?.isTextBased?.()||!topic||topic.closed)return res.status(404).json({success:false,message:'Ticket channel not found or closed'});
      const messageEmbed = supportEmbed({
        title: '🌐 הודעה חדשה מהאתר',
        description: content,
        color: 0x3498DB,
        fields: [{ name: '👤 נשלח על ידי', value: senderName || 'משתמש EddyWEB', inline: true }],
        footer: 'EddyWEB • מזהה הודעה: ' + messageId
      });
      const sent=await channel.send({embeds:[messageEmbed],allowedMentions:{parse:[]}});
      return res.json({success:true,discordMessageId:sent.id});
    }catch(error){console.error('EddyWEB support message relay failed:',error);return res.status(500).json({success:false,message:'Could not relay message to Discord'});}
  });
  app.post('/api/support/tickets/:ticketId/close',requireSecret,async(req,res)=>{
    try{
      const ticketId=safeText(req.params.ticketId,36),guild=client.guilds.cache.get(GUILD_ID);
      const channel=guild?.channels.cache.find(item=>parseTicketTopic(item.topic)?.ticketId===ticketId);
      if(!channel)return res.json({success:true,alreadyClosed:true});
      const topic=parseTicketTopic(channel.topic);
      if(!topic)return res.status(404).json({success:false,message:'Ticket not found'});
      await channel.setTopic(CLOSED_TOPIC_PREFIX+ticketId+'|user:'+topic.userId);
      await channel.setName(('closed-'+channel.name).slice(0,100));
      await channel.send({embeds:[supportEmbed({
        title:'🔒 השיחה נסגרה',
        description:'השיחה נסגרה דרך אתר EddyWEB.',
        color:0x747F8D,
        footer:'EddyWEB • מערכת התמיכה'
      })],allowedMentions:{parse:[]}});
      return res.json({success:true});
    }catch(error){console.error('EddyWEB support ticket close failed:',error);return res.status(500).json({success:false,message:'Could not close Discord ticket'});}
  });
  client.on('messageCreate',async message=>{
    if(!message.guild||message.author.bot||!message.member)return;
    const ticket=parseTicketTopic(message.channel?.topic);
    if(!ticket||ticket.closed||message.content.startsWith('!'))return;
    const staffIds=new Set(Object.values(getStaffRoleIds()||{}).map(String));
    const isTicketOwner=!!ticket.discordUserId&&ticket.discordUserId===message.author.id;
    const isStaff=message.member.roles.cache.some(role=>staffIds.has(role.id));
    if(!isTicketOwner&&!isStaff)return;
    const senderType=isTicketOwner?'user':'staff';
    const content=safeText(message.content,4000);if(!content)return;
    const websiteUrl=String(process.env.EDDYWEB_API_URL||'https://eddy-web-seven.vercel.app').replace(/\/+$/,'');
    const secret=String(process.env.EDDYWEB_SUPPORT_SHARED_SECRET||'');if(!secret)return;
    try{
      const response=await fetch(websiteUrl+'/api/support/internal/discord-message',{
        method:'POST',headers:{'Content-Type':'application/json',[SECRET_HEADER]:secret},
        body:JSON.stringify({ticketId:ticket.ticketId,channelId:message.channel.id,discordMessageId:message.id,
          senderId:message.author.id,senderName:message.member.displayName||message.author.username,senderType,content}),
        signal:AbortSignal.timeout(12000)
      });
      if(!response.ok){const detail=await response.text().catch(()=> '');console.error('EddyWEB staff reply sync failed:',response.status,detail);
        await message.reply('⚠️ לא הצלחנו להעביר את התשובה לאתר. נסה שוב מאוחר יותר.').catch(()=>{});}
    }catch(error){console.error('EddyWEB staff reply sync error:',error);await message.reply('⚠️ החיבור לאתר נכשל. התשובה נשארה בדיסקורד.').catch(()=>{});}
  });
}
module.exports={installSupportBridge};
