const { createHash, timingSafeEqual } = require('node:crypto');
const MAX = 999999999;
function validPayload(body, guild) {
  if (!body || body.guild_id !== guild || !/^\d{17,20}$/.test(body.guild_id)) return false;
  if (!Number.isSafeInteger(body.version) || body.version <= 0 || body.version > Date.now() + 300000) return false;
  const num = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
  if (!Array.isArray(body.entries) || body.entries.length > 10) return false;
  const ids = new Set();
  return body.entries.every((e, index) => {
    if (!e || typeof e.discord_id !== 'string' || !/^\d{17,20}$/.test(e.discord_id) || ids.has(e.discord_id)) return false;
    ids.add(e.discord_id);
    return typeof e.nickname === 'string' && e.nickname.trim().length >= 2 && e.nickname.length <= 40 && num(e.rp_balance,0,MAX) && num(e.contract_rp_earned,0,MAX) && e.position === index + 1;
  });
}
module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'method_not_allowed'});}
  const token=process.env.BOT_SYNC_TOKEN?.trim(), key=process.env.SUPABASE_SECRET_KEY?.trim();
  const guild=process.env.DISCORD_GUILD_ID?.trim();
  if(!token || token.length<32 || token.length>512 || !key || !/^\d{17,20}$/.test(guild||'')) return res.status(503).json({error:'not_configured'});
  const header=req.headers.authorization;
  const incoming=typeof header==='string' && header.startsWith('Bearer ')?header.slice(7):'';
  const digest=s=>createHash('sha256').update(s).digest();
  if(!incoming || incoming.length>512 || !timingSafeEqual(digest(incoming),digest(token))) return res.status(401).json({error:'unauthorized'});
  if(!key.startsWith('sb_secret_')) return res.status(503).json({error:'supabase_secret_key_required'});
  let body=req.body;
  try { if(typeof body==='string') body=JSON.parse(body); if(Buffer.byteLength(JSON.stringify(body)||'')>65536) return res.status(413).json({error:'payload_too_large'}); }
  catch {return res.status(400).json({error:'invalid_json'});}
  if(!validPayload(body,guild)) return res.status(400).json({error:'invalid_snapshot'});
  try {
    const response=await fetch('https://adczgnhrhzrjhxoahshh.supabase.co/rest/v1/rpc/armani_sync_rp',{
      method:'POST',headers:{apikey:key,'Content-Type':'application/json'},
      body:JSON.stringify({p_version:body.version,p_entries:body.entries}),
      signal:AbortSignal.timeout(10000)
    });
    if(!response.ok) {
      let detail = {}; try { detail = await response.json(); } catch {}
      const rawCode = typeof detail?.code === 'string' ? detail.code : '';
      const dbCode = /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(rawCode) ? rawCode : 'unknown';
      // Do not log upstream messages/details: they can contain row data.
      console.error('ARMANI_RP_SYNC', {status:response.status, code:dbCode});
      return res.status(502).json({error:'storage_failed',upstream_status:response.status,db_code:dbCode});
    }
    return res.status(200).json({applied:await response.json()});
  }catch{return res.status(502).json({error:'storage_unavailable'});}
};
module.exports.validPayload=validPayload;
