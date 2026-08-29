const fs=require('fs');
const path=require('path');
const FILE=path.join(__dirname,'..','data','invite-tracking.json');
function read(){try{return JSON.parse(fs.readFileSync(FILE,'utf8'));}catch{return {};}}
function write(data){fs.mkdirSync(path.dirname(FILE),{recursive:true});fs.writeFileSync(FILE,JSON.stringify(data,null,2));}
module.exports=function installInviteTracker(client){
 client.inviteTracker=new Map(Object.entries(read()));
 const snapshots=new Map();
 async function snapshot(guild){try{const invites=await guild.invites.fetch();const map=new Map();invites.forEach(inv=>map.set(inv.code,{uses:inv.uses||0}));snapshots.set(guild.id,map);}catch(error){console.warn(`[InviteTracker] ${error.message}`);}}
 client.once('ready',async()=>{for(const guild of client.guilds.cache.values())await snapshot(guild);});
 client.on('guildMemberAdd',async member=>{const before=snapshots.get(member.guild.id)||new Map();let after;try{after=await member.guild.invites.fetch();}catch(error){console.warn(`[InviteTracker] ${error.message}`);return;}
  let used=null;after.forEach(inv=>{const old=before.get(inv.code);if(inv.uses!=null&&old&&inv.uses>old.uses)used=inv;});
  if(used?.inviter?.id){const all=client.inviteTracker.get(member.guild.id)||{};all[member.id]={memberId:member.id,inviterId:used.inviter.id,inviteCode:used.code,joinedAt:new Date().toISOString()};client.inviteTracker.set(member.guild.id,all);write(Object.fromEntries(client.inviteTracker));}
  await snapshot(member.guild);
 });
};
