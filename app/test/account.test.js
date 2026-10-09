import test from 'node:test';
import assert from 'node:assert/strict';
import {requestCode,finishConnection} from '../src/account.js';
function fixture(options={}) {
  const calls=[];
  const client={auth:{
    async signInWithOtp(payload){calls.push({name:'send',payload});return {error:options.sendError?{message:'secret'}:null};},
    async verifyOtp(payload){calls.push({name:'verify',payload});return {data:{session:{access_token:'test',refresh_token:'test'}},error:options.codeError?{message:'secret'}:null};},
    async getUser(){return {data:{user:{id:'verified',email:'person@example.com',email_confirmed_at:options.unverified?null:'now'}}};}
  },from(table){assert.equal(table,'profiles');return {
    select(){return this;},eq(){return this;},async maybeSingle(){return {data:options.existing||null,error:null};},
    async insert(payload){calls.push({name:'insert',payload});return {error:options.insertError?{message:'secret'}:null};}
  };}};
  const sessions={async connect(...payload){calls.push({name:'connect',payload});return {actor:'verified'};}};
  return {client,sessions,calls};
}
const config={SLACK_TEAM_ID:'T1'};
const input={email:'person@example.com',code:'123456',slackUser:'U1',displayName:'Person'};
test('sign-in rejects malformed email and sanitizes delivery failures',async()=>{
  const f=fixture({sendError:true});
  await assert.rejects(()=>requestCode(f.client,'invalid'),/valid email/);
  assert.equal(f.calls.length,0);
  await assert.rejects(()=>requestCode(f.client,input.email),error=>!error.message.includes('secret'));
});
test('verified account creates only its own profile, then connects without granting a relationship',async()=>{
  const f=fixture();await finishConnection(f.client,f.sessions,config,input);
  assert.deepEqual(f.calls.map(c=>c.name),['verify','insert','connect']);
  assert.equal(f.calls[1].payload.id,'verified');assert.equal(f.calls[1].payload.slack_user_id,'U1');
});
test('existing matching profiles reconnect without modification',async()=>{
  const f=fixture({existing:{id:'verified',slack_user_id:'U1'}});
  await finishConnection(f.client,f.sessions,config,input);
  assert.deepEqual(f.calls.map(c=>c.name),['verify','connect']);
});
test('invalid code, unverified email, mismatched email or profile never creates a connection',async()=>{
  for(const options of [{codeError:true},{unverified:true},{existing:{id:'verified',slack_user_id:'U_OTHER'}},{insertError:true}]) {
    const f=fixture(options);
    await assert.rejects(()=>finishConnection(f.client,f.sessions,config,input));
    assert(!f.calls.some(c=>c.name==='connect'));
  }
  const f=fixture();
  await assert.rejects(()=>finishConnection(f.client,f.sessions,config,{...input,email:'other@example.com'}));
  assert(!f.calls.some(c=>c.name==='insert'));
});
