module.exports={
  name:'invites',
  description:'בודק כמה אנשים הזמנת לשרת ועדיין נמצאים בו',
  async execute(message,args,client){
    const guild=message.guild;
    if(!guild)return message.reply('הפקודה זמינה רק בשרת.');
    const target=message.mentions.users.first()||message.author;
    const data=client.inviteTracker?.get(guild.id)||{};
    const invited=Object.values(data).filter(x=>x.inviterId===target.id&&guild.members.cache.has(x.memberId));
    const total=invited.length;
    const rank=total>=6?'VIP':total>=5?'Gold':total>=3?'Iron':'ללא דרגה';
    const requirements={
      'Iron':'3 חברים',
      'Gold':'5 חברים',
      'VIP':'6 חברים'
    };
    const next=total<3?`Iron — עוד ${3-total}`:total<5?`Gold — עוד ${5-total}`:total<6?`VIP — עוד ${6-total}`:'כל דרגות ההזמנות הושלמו';
    return message.reply(`📨 **הזמנות של ${target.tag}:**\n👥 חברים שהוזמנו ועדיין בשרת: **${total}**\n🏆 דרגת הזמנות: **${rank}**\n📈 יעד הבא: **${next}**`);
  }
};
