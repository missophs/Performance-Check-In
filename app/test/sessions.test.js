import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Sessions} from '../src/sessions.js';
async function fixture(t,options={}) {
  const dir=await mkdtemp(join(tmpdir(),'pci-session-qa-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,'sessions.json');
  await writeFile(path,JSON.stringify({'T1:U1':{access_token:'test-access',refresh_token:'test-refresh'}}),{mode:0o600});
  const factory=()=>({
    auth:{
      async setSession(){return options.expired?{error:{message:'private auth detail'},data:{}}:{data:{session:{access_token:'rotated-access',refresh_token:'rotated-refresh'}}};},
      async getUser(){return {data:{user:{id:'verified-user',email_confirmed_at:options.unverified?null:'2026-10-01T00:00:00Z'}},error:null};}
    },
    from(){return {select(){return this;},eq(){return this;},async single(){return {data:{id:'verified-user',slack_user_id:options.mismatch?'U_OTHER':'U1'},error:null};}};}
  });
  return {path,sessions:new Sessions({SLACK_TEAM_ID:'T1',SESSION_FILE:path},factory)};
}
test('verified session rotates tokens atomically and returns verified actor',async t=>{
  const f=await fixture(t);
  const result=await f.sessions.forUser('T1','U1');assert.equal(result.actor,'verified-user');
  assert.deepEqual(JSON.parse(await readFile(f.path,'utf8'))['T1:U1'],{access_token:'rotated-access',refresh_token:'rotated-refresh'});
});
test('workspace mismatch and unconnected Slack users cannot use any session',async t=>{
  const f=await fixture(t);
  await assert.rejects(()=>f.sessions.forUser('T_OTHER','U1'),/not authorized/);
  await assert.rejects(()=>f.sessions.forUser('T1','U_OTHER'),/not connected/);
});
test('unsafe session file permissions are rejected',async t=>{
  const f=await fixture(t);await chmod(f.path,0o644);
  await assert.rejects(()=>f.sessions.forUser('T1','U1'),/administrator attention/);
});
test('missing or malformed session files show no local paths or parser details',async t=>{
  const f=await fixture(t);
  await rm(f.path);
  await assert.rejects(()=>f.sessions.forUser('T1','U1'),error=>/not connected yet/.test(error.message)&&!error.message.includes(f.path));
  await writeFile(f.path,'invalid',{mode:0o600});
  await assert.rejects(()=>f.sessions.forUser('T1','U1'),/administrator attention/);
});
test('expired connections and identity mismatch fail closed without leaking auth errors',async t=>{
  const a=await fixture(t,{expired:true}),b=await fixture(t,{mismatch:true});
  await assert.rejects(()=>a.sessions.forUser('T1','U1'),/connection expired/);
  await assert.rejects(()=>b.sessions.forUser('T1','U1'),/do not match/);
  assert.equal(JSON.parse(await readFile(b.path,'utf8'))['T1:U1'].access_token,'test-access');
});
test('connection creates a private session file only after verified identity and preserves other accounts',async t=>{
  const f=await fixture(t);
  const result=await f.sessions.connect('T1','U1',{access_token:'authorized',refresh_token:'authorized'});
  assert.equal(result.actor,'verified-user');
  await rm(f.path);
  await f.sessions.connect('T1','U1',{access_token:'authorized',refresh_token:'authorized'});
  assert.equal(JSON.parse(await readFile(f.path,'utf8'))['T1:U1'].access_token,'rotated-access');
});
test('connection rejects wrong Slack identity and unverified email without writing',async t=>{
  for(const options of [{mismatch:true},{unverified:true}]){
    const f=await fixture(t,options);
    await assert.rejects(()=>f.sessions.connect('T1','U1',{access_token:'authorized',refresh_token:'authorized'}));
    assert.equal(JSON.parse(await readFile(f.path,'utf8'))['T1:U1'].access_token,'test-access');
  }
});
