import test from 'node:test';
import assert from 'node:assert/strict';
import {SlackIdentity} from '../src/slack-identity.js';
import {identityHandler} from '../supabase/functions/pci-slack-identity/handler.js';
const cfg={SLACK_TEAM_ID:'T1',SLACK_BOT_TOKEN:'xoxb-fixture',SUPABASE_URL:'https://jfnjmjgolfjftiwblgbm.supabase.co',SUPABASE_PUBLISHABLE_KEY:'fixture'};
function bridge(options={}) {
  const calls=[];
  const admin={from(table){calls.push(table);return {select(){return this;},eq(){return this;},async single(){return {data:{bot_user_id:'UBOT',manager_email:'manager@example.com',employee_email:'employee@example.com'}};},async maybeSingle(){return {data:options.mapped||null};}};},auth:{admin:{async createUser(p){calls.push(['create',p]);return {data:{user:{id:'actor'}}};},async generateLink(p){calls.push(['generate',p]);return {data:{properties:{hashed_token:'private-hash'},user:{id:'actor'}}};}}},async rpc(name,p){calls.push([name,p]);if(name==='pci_slack_auth_actor')return {data:options.newUser?null:'actor',error:options.untrustedAlias?{}:null};return {data:'actor'};}};
  const publicClient={auth:{async verifyOtp(p){calls.push(['verify',p]);return {data:{user:{id:'actor'},session:{access_token:'private-user-jwt',refresh_token:'never-return',expires_at:Math.floor(Date.now()/1000)+3600}}};}}};
  const request=async(url,opts)=>{
    assert.equal(opts.headers.Authorization,'Bearer xoxb-fixture');
    calls.push(url);
    if(url.endsWith('auth.test'))return Response.json({ok:true,team_id:options.wrongTeam?'TOTHER':'T1',user_id:options.wrongBot?'OTHERBOT':'UBOT'});
    if(options.missingScope)return Response.json({ok:false,error:'missing_scope'});
    return Response.json({ok:true,user:{id:'U1',team_id:options.foreign?'TOTHER':'T1',deleted:!!options.deleted,is_bot:!!options.bot,is_stranger:!!options.stranger,profile:{email:options.email||'employee@example.com',display_name:'Employee'}}});
  };
  return {handler:identityHandler({admin,publicClient,request}),calls};
}
const request=()=>new Request('https://example.com',{method:'POST',headers:{'x-pci-bot-token':'xoxb-fixture','content-type':'application/json'},body:JSON.stringify({workspace:'T1',user:'U1'})});
test('Slack identity requires the exact installed bot, active local member, and approved email before Auth provisioning',async()=>{
  for(const options of [{wrongTeam:true},{wrongBot:true},{foreign:true},{deleted:true},{bot:true},{stranger:true},{email:'outsider@example.com'}]) {
    const f=bridge(options),r=await f.handler(request());
    assert.equal(r.status,403);
    assert(!f.calls.some(c=>Array.isArray(c)&&c[0]==='generate'));
  }
});
test('trusted Slack identity creates an RLS session and never returns an admin key or refresh token',async()=>{
  const f=bridge(),r=await f.handler(request()),data=await r.json();
  assert.equal(r.status,200);assert.equal(data.actor,'actor');assert.equal(data.access_token,'private-user-jwt');
  assert(!JSON.stringify(data).includes('never-return'));
  const bind=f.calls.find(c=>Array.isArray(c)&&c[0]==='pci_bind_slack_identity');
  assert.equal(bind[1].p_email,'employee@example.com');assert.equal(bind[1].p_slack_user,'U1');
});
test('new internal Auth aliases are created with server-owned metadata and unknown random passwords',async()=>{
  const f=bridge({newUser:true}),r=await f.handler(request());assert.equal(r.status,200);
  const created=f.calls.find(c=>Array.isArray(c)&&c[0]==='create');
  assert.equal(created[1].app_metadata.pci_slack_user,'U1');assert.equal(created[1].app_metadata.pci_slack_workspace,'T1');assert(created[1].password.length>=64);
});
test('an untrusted pre-registered alias never receives a session or profile',async()=>{
  const f=bridge({untrustedAlias:true}),r=await f.handler(request());assert.equal(r.status,503);
  assert(!f.calls.some(c=>Array.isArray(c)&&['generate','verify','pci_bind_slack_identity'].includes(c[0])));
});
test('missing permissions, conflicting identities and unauthenticated callers fail closed',async()=>{
  const f=bridge({missingScope:true});assert.equal((await (await f.handler(request())).json()).code,'missing_scope');
  const mismatch=bridge({mapped:{profile_id:'different'}});assert.equal((await mismatch.handler(request())).status,403);
  assert(!mismatch.calls.some(c=>Array.isArray(c)&&c[0]==='pci_bind_slack_identity'));
  const invalid=bridge();assert.equal((await invalid.handler(new Request('https://example.com',{method:'POST'}))).status,401);assert.equal(invalid.calls.length,0);
});
test('app identity exchange coalesces requests and uses only a per-user JWT for database calls',async()=>{
  let calls=0,options;
  const sessions=new SlackIdentity(cfg,{request:async(url,req)=>{calls++;assert(url.endsWith('/pci-slack-identity'));assert.equal(req.headers['x-pci-bot-token'],'xoxb-fixture');return Response.json({actor:'actor',access_token:'user-jwt',expires_at:Math.floor(Date.now()/1000)+3600});},factory:(url,key,opts)=>{options=opts;return {fixture:true};}});
  const results=await Promise.all([sessions.forUser('T1','U1'),sessions.forUser('T1','U1')]);
  assert.equal(calls,1);assert.equal(results[0].actor,'actor');assert.equal(options.global.headers.Authorization,'Bearer user-jwt');
  await sessions.forUser('T1','U1');assert.equal(calls,1);
  await assert.rejects(()=>sessions.forUser('TOTHER','U1'));assert.equal(calls,1);
});
test('default Worker fetch is called without a SlackIdentity this binding',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=function(){assert.equal(this,undefined);return Response.json({actor:'actor',access_token:'user-jwt',expires_at:Math.floor(Date.now()/1000)+3600});};
  try{
    const sessions=new SlackIdentity(cfg,{factory:()=>({fixture:true})});
    assert.equal((await sessions.forUser('T1','U1')).actor,'actor');
  }finally{globalThis.fetch=original;}
});
test('failed Slack identity exchanges are sanitized and retryable without an account-connection gate',async()=>{
  for(const code of ['missing_scope','not_assigned','private-backend-detail']){
    let calls=0;
    const sessions=new SlackIdentity(cfg,{request:async()=>{calls++;return Response.json({code},{status:403});}});
    for(let i=0;i<2;i++)await assert.rejects(()=>sessions.forUser('T1','U1'),e=>!e.message.includes('private-backend-detail')&&!e.message.includes('not connected yet'));
    assert.equal(calls,2);
  }
});
