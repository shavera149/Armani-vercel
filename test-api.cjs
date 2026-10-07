const assert=require('node:assert/strict');
const h=require('../website/api/rp-sync.js');
process.env.BOT_SYNC_TOKEN='x'.repeat(64);process.env.SUPABASE_SECRET_KEY='test-only';process.env.DISCORD_GUILD_ID='1555649348501770351';
const p={guild_id:process.env.DISCORD_GUILD_ID,version:Date.now(),entries:[{discord_id:'768426180709711882',nickname:'Armani',rp_balance:10,contract_rp_earned:20,position:1}]};
let calls=0;
global.fetch=async(url,options)=>{calls++;assert.match(url,/rpc\/armani_sync_rp$/);assert.deepEqual(JSON.parse(options.body),{p_version:p.version,p_entries:p.entries});return {ok:true,json:async()=>true};};
async function call(body=p,token=process.env.BOT_SYNC_TOKEN){const r={setHeader(){},status(c){this.code=c;return this},json(b){this.body=b;return this}};await h({method:'POST',headers:{authorization:'Bearer '+token},body},r);return r;}
(async()=>{
 assert.equal((await call(p,'bad')).code,401);
 for(const bad of [{...p,guild_id:'999999999999999999'},{...p,entries:[p.entries[0],p.entries[0]]},{...p,entries:[{...p.entries[0],rp_balance:-1}]},{...p,entries:[{...p.entries[0],position:2}]},{...p,version:Date.now()+900000}])assert.equal((await call(bad)).code,400);
 assert.equal(calls,0);assert.equal((await call({...p,padding:'x'.repeat(65536)})).code,413);
 assert.equal((await call()).code,200);assert.equal(calls,1);
 global.fetch=async()=>({ok:true,json:async()=>false});assert.deepEqual((await call()).body,{applied:false});
 global.fetch=async()=>({ok:false});assert.equal((await call()).code,502);
 delete process.env.SUPABASE_SECRET_KEY;assert.equal((await call()).code,503);
 console.log('PASS: auth, guild isolation, validation, RPC payload, replay response, error handling');
})().catch(e=>{console.error(e);process.exitCode=1});
