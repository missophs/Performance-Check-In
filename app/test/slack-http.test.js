import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,webcrypto} from 'node:crypto';
import {handleSlackHttp,verifySlackRequest} from '../src/slack-http.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const secret='test-signing-secret';
function request(body,{type='application/json',time=Math.floor(Date.now()/1000),signature=true}={}) {
  const raw=typeof body==='string'?body:JSON.stringify(body);
  const digest=createHmac('sha256',secret).update(`v0:${time}:${raw}`).digest('hex');
  return new Request('https://pilot.example/slack/events',{method:'POST',headers:{'content-type':type,'x-slack-request-timestamp':String(time),'x-slack-signature':signature?`v0=${digest}`:'v0=invalid'},body:raw});
}
const context=()=>({jobs:[],waitUntil(job){this.jobs.push(job);}});

test('rejects unsigned and stale Slack requests before dispatch',async()=>{
  const app={processEvent(){throw Error('should not dispatch');}};
  assert.equal((await handleSlackHttp(request({type:'event_callback'},{signature:false}),app,secret,context())).status,401);
  assert.equal((await handleSlackHttp(request({type:'event_callback'},{time:Math.floor(Date.now()/1000)-600}),app,secret,context())).status,401);
  assert.equal(await verifySlackRequest(request({type:'event_callback'}),'different body',secret),false);
});

test('acknowledges event callbacks and continues work in waitUntil',async()=>{
  const ctx=context();let processed=false;
  const app={async processEvent(event){assert.equal(event.body.event.type,'app_home_opened');processed=true;}};
  const result=await handleSlackHttp(request({type:'event_callback',event:{type:'app_home_opened'}}),app,secret,ctx);
  assert.equal(result.status,200);
  await Promise.all(ctx.jobs);
  assert.equal(processed,true);
});

test('returns interactive acknowledgement and keeps post-ack work alive',async()=>{
  const ctx=context();let completed=false;
  const body='payload='+encodeURIComponent(JSON.stringify({type:'block_actions',actions:[{action_id:'pci_test'}]}));
  const app={async processEvent(event){await event.ack({text:'Saved'});await Promise.resolve();completed=true;}};
  const result=await handleSlackHttp(request(body,{type:'application/x-www-form-urlencoded'}),app,secret,ctx);
  assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{text:'Saved'});
  await Promise.all(ctx.jobs);
  assert.equal(completed,true);
});

test('handles Slack URL verification only after signature validation',async()=>{
  const app={processEvent(){throw Error('should not dispatch');}};
  assert.equal(await (await handleSlackHttp(request({type:'url_verification',challenge:'proof'}),app,secret,context())).text(),'proof');
});
