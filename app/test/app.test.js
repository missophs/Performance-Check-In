import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog} from '../src/catalog.js';
import {home,form,notice,loading,parseFields,recordsWindow,savedNotice} from '../src/views.js';
import {validate} from '../src/validate.js';
import {config} from '../src/config.js';
import {register} from '../src/handlers.js';
import {Store} from '../src/store.js';
import manifest from '../manifest.json' with {type:'json'};
const id='11111111-1111-4111-8111-111111111111';
const pair='22222222-2222-4222-8222-222222222222';
const actor='33333333-3333-4333-8333-333333333333';
function fakeApp() {
  const handlers={action:{},view:{},options:{},event:{},command:{},shortcut:{}};
  const app=Object.fromEntries(Object.keys(handlers).map(type=>[type,(key,fn)=>{handlers[type][key]=fn;}]));
  app.error=()=>{};
  return {app,handlers};
}
function fakeClient({failure=false}={}) {
  const calls=[];
  const client={views:Object.fromEntries(['open','push','update','publish'].map(name=>[name,async payload=>{calls.push({name,payload});if(name==='open'||name==='push')return {view:{id:'V1'}};return {};}]))};
  const db={
    from(table) {
      const q={};for(const name of ['select','eq','is','order','range','limit','single','ilike'])q[name]=()=>q;
      q.then=(resolve,reject)=>Promise.resolve({data:table==='manager_employee_relationships'?[{id:pair,manager_id:actor,employee_id:id,status:'active'}]:[],error:null}).then(resolve,reject);
      return q;
    },
    async rpc(name,payload){calls.push({name,payload});if(name==='pci_relationships')return {data:[{id:pair,manager_id:actor,employee_id:id,status:'active',partner_name:'Employee'}],error:null};return failure?{error:{message:'sensitive backend detail'}}:{data:id,error:null};}
  };
  return {client,db,calls};
}
test('every catalog form and home surface validates including long content and pagination',()=>{
  for(const table of Object.keys(catalog)) {
    validate(form(table,{id}));
    validate(form(table,{id,pair,expected:'2026-09-30T00:00:00Z'},{title:'x'.repeat(200),draft_text:'x'.repeat(2000)}));
    const actions=validate(home(table,Array.from({length:11},()=>({id,title:'<&>'.repeat(1000)})),1));
    assert(actions.includes('pci_edit'));assert(actions.includes('pci_page'));
  }
  [loading(),notice('Saved.'),home('goals',[],0,'Disconnected')].forEach(validate);
});
test('every emitted interaction, command, shortcut and event has a handler matching manifest',()=>{
  const {app,handlers}=fakeApp();register(app,{},'T1');
  for(const view of [home('goals',[{id,title:'Goal'}],1,undefined,{isManager:true}),...Object.keys(catalog).map(t=>form(t,{id}))]) {
    for(const action of validate(view))assert(handlers.action[action]||handlers.options[action],action);
    if(view.callback_id)assert(handlers.view[view.callback_id]);
  }
  for(const c of manifest.features.slash_commands)assert(handlers.command[c.command]);
  for(const s of manifest.features.shortcuts)assert(handlers.shortcut[s.callback_id]);
  for(const e of manifest.settings.event_subscriptions.bot_events)assert(handlers.event[e]);
  assert.deepEqual(manifest.oauth_config.scopes.bot,['commands','users:read','users:read.email','chat:write']);
});
test('Home uses separate feature buttons and a manager-only area with no category dropdown',()=>{
  for(const isManager of [false,true]) {
    const view=home('one_on_ones',[],0,undefined,{isManager});
    const elements=view.blocks.flatMap(b=>b.elements||[]);
    assert(!elements.some(e=>e.type==='static_select'));
    assert.equal(elements.some(e=>e.action_id==='pci_feature_performance_updates'),isManager);
    for(const table of Object.keys(catalog).filter(t=>!catalog[t].managerOnly&&t!=='agenda_topics'&&t!=='feedback_requests'&&(isManager||!['feedback','feedback_requests'].includes(t))))assert(elements.some(e=>e.action_id==='pci_feature_'+table));
    assert(!elements.some(e=>e.action_id==='pci_feature_agenda_topics'));
    validate(view);
  }
});
test('server validation rejects required omissions, forged statuses, invalid dates and long text',()=>{
  assert(parseFields('achievements',{}).errors.title);
  assert(parseFields('goals',{title:{value:{value:'Valid'}},status:{value:{selected_option:{value:'forged'}}}}).errors.status);
  assert(parseFields('achievements',{title:{value:{value:'a'.repeat(201)}}}).errors.title);
  for(const value of ['2026-02-30','2026-99-99','bad'])assert(parseFields('achievements',{title:{value:{value:'Win'}},occurred_on:{value:{selected_date:value}}}).errors.occurred_on);
});
test('Continue advances to a new form and rejects a different workspace',async()=>{
  const {app,handlers}=fakeApp();register(app,{},'T1');
  let result;
  await handlers.view.pci_continue({ack:async payload=>{result=payload;},body:{team:{id:'T1'}},view:{private_metadata:JSON.stringify({table:'one_on_ones'})}});
  assert.equal(result.response_action,'update');assert.equal(result.view.callback_id,'pci_save');validate(result.view);
  assert.equal(JSON.parse(result.view.private_metadata).expected,undefined);
  await handlers.view.pci_continue({ack:async payload=>{result=payload;},body:{team:{id:'OTHER'}},view:{private_metadata:JSON.stringify({table:'one_on_ones'})}});
  assert.equal(result.view.callback_id,undefined);
  for(const table of Object.keys(catalog))assert(!JSON.stringify(recordsWindow(table)).includes('Refresh'));
});
test('every feature opens a record window immediately and New pushes a form without replacing its list',async()=>{
  const {app,handlers}=fakeApp(),f=fakeClient();let acknowledged=false;
  register(app,{async forUser(){assert(acknowledged);return {client:f.db,actor};}},'T1');
  for(const table of Object.keys(catalog)) {
    f.calls.length=0;acknowledged=false;
    await handlers.action['pci_feature_'+table]({ack:async()=>{acknowledged=true;},body:{team:{id:'T1'},user:{id:'U1'},trigger_id:'trigger'},client:f.client});
    assert.equal(f.calls[0].name,'open');
    const result=f.calls.filter(c=>c.payload?.view?.type==='modal').at(-1).payload.view;
    assert.equal(result.type,'modal');assert.equal(result.callback_id,'pci_work_save');validate(result);
    validate(recordsWindow(table,Array.from({length:11},()=>({id,title:'Saved record'})),1));
    const saved=savedNotice(table);assert(validate(saved).includes('pci_saved'));
    assert.equal(saved.blocks[1].elements[0].style,'primary');
  }
  f.calls.length=0;
  await handlers.action.pci_new({ack:async()=>{},body:{team:{id:'T1'},user:{id:'U1'},trigger_id:'trigger',view:{id:'LIST',type:'modal'}},action:{value:JSON.stringify({table:'goals'})},client:f.client});
  assert.equal(f.calls[0].name,'push');assert.equal(f.calls.at(-1).payload.view.callback_id,'pci_save');
});
test('configuration fails closed and rejects wrong backend and elevated database keys',()=>{
  assert.throws(()=>config({}),/Missing configuration/);
  const base={SLACK_BOT_TOKEN:'xoxb-test',SLACK_APP_TOKEN:'xapp-test',SLACK_TEAM_ID:'T1',SUPABASE_URL:'https://jfnjmjgolfjftiwblgbm.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SESSION_FILE:'/tmp/test'};
  assert.equal(config(base).SLACK_TEAM_ID,'T1');
  assert.throws(()=>config({...base,SUPABASE_URL:'https://elsewhere.invalid'}));
  assert.throws(()=>config({...base,SUPABASE_PUBLISHABLE_KEY:'sb_secret_test'}));
  const jwt='a.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.c';
  assert.throws(()=>config({...base,SUPABASE_PUBLISHABLE_KEY:jwt}));
});
test('new button acknowledges before opening loading modal and fetching identity',async()=>{
  const {app,handlers}=fakeApp(),f=fakeClient();let acknowledged=false;
  register(app,{async forUser(){assert(acknowledged);assert.equal(f.calls[0].name,'open');return {client:f.db,actor};}},'T1');
  await handlers.action.pci_new({ack:async()=>{acknowledged=true;},body:{team:{id:'T1'},user:{id:'U1'},trigger_id:'trigger'},action:{value:JSON.stringify({table:'goals'})},client:f.client});
  assert.equal(f.calls.at(-1).name,'update');validate(f.calls.at(-1).payload.view);
});
test('save commits through authorized RPC before success; repeated create UUID is stable',async()=>{
  const {app,handlers}=fakeApp(),f=fakeClient();let ack;
  register(app,{async forUser(){assert.equal(ack.response_action,'update');return {client:f.db,actor};}},'T1');
  const view={id:'V1',private_metadata:JSON.stringify({table:'goals',id}),state:{values:{pair:{pci_pair:{selected_option:{value:pair}}},title:{value:{value:'Launch'}},status:{value:{selected_option:{value:'active'}}}}}};
  await handlers.view.pci_save({ack:async x=>{ack=x;},body:{team:{id:'T1'},user:{id:'U1'}},view,client:f.client});
  const rpc=f.calls.find(x=>x.name==='pci_save_record');
  assert.equal(rpc.payload.p_id,id);assert.equal(rpc.payload.p_fields.title,'Launch');
  assert(f.calls.findIndex(x=>x.name==='pci_save_record')<f.calls.findIndex(x=>x.name==='update'));
  assert.match(f.calls.find(x=>x.name==='update').payload.view.blocks[0].text.text,/Saved/);
});
test('failed save never says saved and restores text and relationship selection',async()=>{
  const {app,handlers}=fakeApp(),f=fakeClient({failure:true});
  register(app,{async forUser(){return {client:f.db,actor};}},'T1');
  await handlers.view.pci_save({ack:async()=>{},body:{team:{id:'T1'},user:{id:'U1'}},view:{id:'V1',private_metadata:JSON.stringify({table:'goals',id}),state:{values:{pair:{pci_pair:{selected_option:{value:pair}}},title:{value:{value:'Keep this'}}}}},client:f.client});
  const restored=f.calls.find(x=>x.name==='update').payload.view;
  assert.equal(restored.callback_id,'pci_save');assert.equal(JSON.parse(restored.private_metadata).id,id);
  assert.equal(restored.blocks.find(b=>b.block_id==='title').element.initial_value,'Keep this');
  assert.equal(restored.blocks.find(b=>b.block_id==='pair').element.initial_option.value,pair);
  validate(restored);
});
test('Home refresh failure after commit preserves saved confirmation and never restores a retry form',async()=>{
  const {app,handlers}=fakeApp(),f=fakeClient();
  f.client.views.publish=async()=>{throw new Error('Slack unavailable');};
  register(app,{async forUser(){return {client:f.db,actor};}},'T1');
  await handlers.view.pci_save({ack:async()=>{},body:{team:{id:'T1'},user:{id:'U1'}},view:{id:'V1',private_metadata:JSON.stringify({table:'goals',id}),state:{values:{pair:{pci_pair:{selected_option:{value:pair}}},title:{value:{value:'Committed goal'}}}}},client:f.client});
  assert.equal(f.calls.filter(c=>c.name==='pci_save_record').length,1);
  const updates=f.calls.filter(c=>c.name==='update');
  assert.equal(updates.length,2);
  for(const c of updates){assert.match(c.payload.view.blocks[0].text.text,/Saved/);assert.notEqual(c.payload.view.callback_id,'pci_save');}
  assert.match(updates.at(-1).payload.view.blocks[0].text.text,/Refresh/);
});
test('malformed metadata, missing relationship and wrong workspace do not write',async()=>{
  const {app,handlers}=fakeApp(),f=fakeClient();let connections=0;let ack;
  register(app,{async forUser(){connections++;return {client:f.db,actor};}},'T1');
  for(const metadata of ['bad',JSON.stringify({table:'goals',id})]) {
    await handlers.view.pci_save({ack:async x=>{ack=x;},body:{team:{id:'T2'},user:{id:'U1'}},view:{private_metadata:metadata,state:{values:{}}},client:f.client});
    assert(ack.response_action);
  }
  await handlers.action.pci_new({ack:async()=>{},body:{team:{id:'T2'},user:{id:'U1'}},action:{value:JSON.stringify({table:'goals'})},client:f.client});
  assert.equal(connections,0);assert.equal(f.calls.length,0);
});
test('manager-only saves, inactive pairs, unknown tables and invalid pages are rejected',async()=>{
  const f=fakeClient(),s=new Store(f.db,id);
  await assert.rejects(()=>s.save('performance_updates',{id,pair},{update_text:'Private'}),/manager/);
  await assert.rejects(()=>s.save('goals',{id,pair:actor},{title:'No'}),/no longer active/);
  await assert.rejects(()=>s.list('profiles'));
  await assert.rejects(()=>s.list('goals',-1));
});
for(const table of Object.keys(catalog))test('handler saves '+table+' through real RPC boundary',async()=>{
  const {app,handlers}=fakeApp(),f=fakeClient();let acknowledged;
  register(app,{async forUser(){return {client:f.db,actor};}},'T1');
  const payload=form(table,{id});
  const values={pair:{pci_pair:{selected_option:{value:pair}}},parent:{pci_parent:{selected_option:{value:id}}}};
  for(const b of payload.blocks.filter(b=>b.type==='input'&&!['pair','parent'].includes(b.block_id))) {
    const e=b.element;
    values[b.block_id]={value:e.type==='static_select'?{selected_option:e.options[0]}:e.type==='plain_text_input'?{value:'QA content'}:{}};
  }
  await handlers.view.pci_save({ack:async x=>{acknowledged=x;},body:{team:{id:'T1'},user:{id:'U1'}},view:{id:'V1',private_metadata:payload.private_metadata,state:{values}},client:f.client});
  assert.equal(acknowledged.response_action,'update');
  const rpc=f.calls.find(c=>c.name==='pci_save_record');assert(rpc,table);assert.equal(rpc.payload.p_table,table);
  assert.match(f.calls.find(c=>c.name==='update').payload.view.blocks[0].text.text,/Saved/);
});
test('command, shortcut, Home event, categories, pages, policies and external options execute',async()=>{
  const {app,handlers}=fakeApp(),f=fakeClient();
  register(app,{async forUser(){return {client:f.db,actor};}},'T1');
  const body={team_id:'T1',team:{id:'T1'},user_id:'U1',user:{id:'U1'},trigger_id:'TR',view:{private_metadata:JSON.stringify({table:'goals'})}};
  const base={ack:async()=>{},body,client:f.client};
  await handlers.command['/checkin'](base);
  await handlers.shortcut.pci_checkin(base);
  await handlers.event.app_home_opened({...base,event:{tab:'home',user:'U1'}});
  await handlers.action.pci_category({...base,action:{selected_option:{value:'goals'}}});
  await handlers.action.pci_page({...base,action:{value:JSON.stringify({table:'goals',page:1})}});
  await handlers.action.pci_policies(base);
  for(const name of ['pci_pair','pci_parent']) {
    let ack;
    await handlers.options[name]({...base,options:{value:''},ack:async x=>{ack=x;}});
    assert(Array.isArray(ack.options));
  }
  for(const call of f.calls.filter(c=>c.payload?.view))validate(call.payload.view);
  assert(f.calls.some(c=>c.name==='publish'));
});
test('oversized stored text is refused instead of silently truncated',()=>{
  assert.throws(()=>form('review_prep_drafts',{id,expected:'now'},{draft_text:'x'.repeat(2001)}),/more text/);
});

test('saved draft areas remain green on Home while untouched areas stay neutral',()=>{
 const v=home('one_on_ones',[],0,undefined,{overview:true,isManager:true,hasDrafts:true,savedAreas:['goals','achievements']});
 const buttons=v.blocks.flatMap(b=>b.elements||[]);
 for(const type of ['goals','achievements']){const b=buttons.find(b=>b.action_id==='pci_feature_'+type);assert.equal(b.style,'primary');assert(b.text.text.includes('Saved'));}
 assert.equal(buttons.find(b=>b.action_id==='pci_feature_actions').style,undefined);
});

test('older submissions are available through History instead of cluttering Home',()=>{
 const v=home('one_on_ones',[],0,undefined,{overview:true,isManager:true,latestSubmission:{id:'entry',pair_id:'pair',entry_type:'one_on_ones',partner:'mel',submitted_at:'2026-10-03T23:38:00Z'}});
 assert(validate(v).includes('pci_work_home_history'));assert(!v.blocks.some(b=>b.text?.text.includes('Last submitted')));
});

test('employee Home shows received manager messages without manager-feedback choices',()=>{
 const v=home('one_on_ones',[],0,undefined,{overview:true,received:[{id:'entry',pair_id:'pair',entry_type:'one_on_ones',partner:'Melissa',submitted_at:'2026-10-03T20:16:00Z'}]});
 const ids=validate(v);assert(ids.includes('pci_work_notification'));assert(!ids.includes('pci_feature_feedback'));assert(!ids.includes('pci_feature_feedback_requests'));assert(v.blocks.some(b=>b.text?.text.includes('Message from your manager')));
});

test('fresh-start control appears only when unsent conversation areas exist',()=>{
 assert(validate(home('one_on_ones',[],0,undefined,{overview:true,hasDrafts:true})).includes('pci_work_fresh'));
 assert(!validate(home('one_on_ones',[],0,undefined,{overview:true})).includes('pci_work_fresh'));
});

test('saved reply has a green review button and does not claim it was sent',()=>{const v=home('one_on_ones',[],0,undefined,{overview:true,responseDraft:{id:'reply',pair_id:'pair'}});assert(v.blocks.some(b=>b.text?.text.includes('Response saved — not sent')));const b=v.blocks.flatMap(b=>b.elements||[]).find(b=>b.action_id==='pci_work_response_review');assert.equal(b.style,'primary');});
