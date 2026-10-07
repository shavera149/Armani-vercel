// Adapter for an existing Node.js Discord bot (Node 20+).
// Invoke after the bot computes a new trusted snapshot. Never accept XP from a public chat command without permission checks.
async function syncArmaniRanking({entries,family_rank,points,members,version=Date.now()}) {
  if(!process.env.BOT_SYNC_TOKEN || !process.env.DISCORD_GUILD_ID) throw Error('Configure BOT_SYNC_TOKEN and DISCORD_GUILD_ID');
  const payload={guild_id:process.env.DISCORD_GUILD_ID,version,entries,family_rank,points,members};
  const response=await fetch('https://armani-famili.vercel.app/api/ranking-sync',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.BOT_SYNC_TOKEN}`},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)
  });
  if(!response.ok) throw Error(`Armani sync failed (${response.status})`);
  return response.json();
}
module.exports={syncArmaniRanking};
// entries: [{discord_id:'<real Discord user ID>',nickname:'Name Surname',xp:123}]
// Send a complete snapshot of up to 100 participants, including unchanged entries.
// Retry a failed snapshot with the SAME version; do not increment it on retries.
