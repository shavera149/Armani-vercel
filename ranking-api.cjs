const assert=require('node:assert/strict');
const handler=require('../api/ranking-sync.js');
process.env.BOT_SYNC_TOKEN='x'.repeat(64);process.env.SUPABASE_SECRET_KEY='test-secret';process.env.DISCORD_GUILD_ID='123456789012345678';
const payload={guild_id:process.env.DISCORD_GUILD_ID,version:Date.now(),family_rank:8,points:50,members:1,entries:[{discord_id:'768426180709711882',nickname:'Test Armani',xp:50}]};
let calls=0;
global.fetch=async(url,opts)=>{calls++;assert.match(url,/rpc\/armani_sync_ranking$/);assert.equal(opts.headers.apikey,'test-secret');return {ok:true,json:async()=>true};};
async function call(body=payload,token=process.env.BOT_SYNC_TOKEN,method='POST') {const res={setHeader(){},status(c){this.code=c;return this;},json(b){this.body=b;return this;}};await handler({method,headers:{authorization:'Bearer '+token},body},res);return res;}
(async()=>{
assert.equal((await call(payload,'invalid')).code,401);assert.equal(calls,0);
assert.equal((await call(payload,undefined,'GET')).code,405);
for(const bad of [{...payload,guild_id:'999999999999999999'},{...payload,entries:[...payload.entries,...payload.entries]},{...payload,entries:[{...payload.entries[0],xp:-1}]},{...payload,version:Date.now()+600000},{...payload,points:1.5}])assert.equal((await call(bad)).code,400);
assert.equal((await call('{')).code,400);assert.equal((await call({...payload,padding:'x'.repeat(65536)})).code,413);assert.equal(calls,0);
const ok=await call();assert.equal(ok.code,200);assert.deepEqual(ok.body,{applied:true});assert.equal(calls,1);
global.fetch=async()=>({ok:false});assert.equal((await call()).code,502);
global.fetch=async()=>{throw Error('private diagnostic');};const failed=await call();assert.equal(failed.code,502);assert.ok(!JSON.stringify(failed.body).includes('private'));
delete process.env.BOT_SYNC_TOKEN;assert.equal((await call()).code,503);
console.log('PASS: authorization, guild, validation, size limit, RPC mapping, upstream failures, missing config');
})().catch(e=>{console.error(e);process.exitCode=1;});
