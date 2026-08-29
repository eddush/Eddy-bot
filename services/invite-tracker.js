const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'data', 'invite-tracking.json');
function read(){try{return JSON.parse(fs.readFileSync(FILE,'utf8'));}catch{return {};}}
function write(data){fs.mkdirSync(path.dirname(FILE),{recursive:true});fs.writeFileSync(FILE,JSON.stringify(data,null,2));}
module.exports=function installInviteTracker(client){
 const stored=read(); client.inviteTracker=new Map(Object.entries(stored));
 const snapshots=new Map(), queues=new Map();
 async function fetchSnapshot(guild){
  const invites=await guild.invites.fetch({cache:false}); const snapshot=new Map();
  for(const invite of invites.values()) if(typeof invite.uses==='number') snapshot.set(invite.code,{uses:invite.uses,inviterId:invite.inviter?.id||null});
  snapshots.set(guild.id,snapshot); return snapshot;
 }
 async function refresh(guild){try{await fetchSnapshot(guild);console.log(`[InviteTracker] Snapshot updated: ${guild.name}`);}catch(e){console.warn(`[InviteTracker] Cannot fetch invites: ${e.message}`);}}
 function enqueue(guild,job){const prev=queues.get(guild.id)||Promise.resolve();const next=prev.catch(()=>{}).then(job).finally(()=>{if(queues.get(guild.id)===next)queues.delete(guild.id);});queues.set(guild.id,next);return next;}
 async function processJoin(member){
  const guild=member.guild; const before=snapshots.get(guild.id);
  if(!before){await refresh(guild);console.log(`[InviteTracker] Baseline created; cannot attribute ${member.user.tag}`);return;}
  await new Promise(r=>setTimeout(r,1200));
  let after; try{after=await fetchSnapshot(guild);}catch(e){console.warn(`[InviteTracker] Join fetch failed: ${e.message}`);return;}
  const candidates=[];
  for(const [code,current] of after){const old=before.get(code);if(old&&current.uses>old.uses)candidates.push({code,...current});}
  const used=candidates.length===1?candidates[0]:null;
  if(!used?.inviterId){console.log(`[InviteTracker] Could not identify invite for ${member.user.tag}. Changed invites: ${candidates.map(x=>x.code).join(',')||'none'}`);return;}
  const data=client.inviteTracker.get(guild.id)||{};
  data[member.id]={memberId:member.id,inviterId:used.inviterId,inviteCode:used.code,joinedAt:new Date().toISOString()};
  client.inviteTracker.set(guild.id,data); write(Object.fromEntries(client.inviteTracker));
  console.log(`[InviteTracker] JOIN ${member.user.tag} -> inviter ${used.inviterId} via ${used.code}`);
 }
 client.once('ready',async()=>{for(const guild of client.guilds.cache.values())await refresh(guild);});
 client.on('inviteCreate',invite=>refresh(invite.guild));
 client.on('inviteDelete',invite=>refresh(invite.guild));
 client.on('guildMemberAdd',member=>enqueue(member.guild,()=>processJoin(member)).catch(e=>console.error(`[InviteTracker] ${e.stack||e}`)));
};
