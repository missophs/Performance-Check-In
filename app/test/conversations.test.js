import test from 'node:test';
import assert from 'node:assert/strict';
import {sectionForm,sectionMenu,reviewView,parseSection,registerConversations} from '../src/conversations.js';
import {stepsFor,questionOptions,fieldsFor,sections} from '../src/conversation-config.js';
import {validate} from '../src/validate.js';
const id='11111111-1111-4111-8111-111111111111',pair='22222222-2222-4222-8222-222222222222',actor='33333333-3333-4333-8333-333333333333';
function fixture({fail=false,notifyFail=false,ai}={}){
 const handlers={action:{},view:{}};const app={action:(id,fn)=>handlers.action[id]=fn,view:(id,fn)=>handlers.view[id]=fn};
 const calls=[];let row;
 const db={rpc:async(name,p)=>{
   if(name==='pci_relationships')return {data:[{id:pair,manager_id:actor,employee_id:id,partner_name:'Stella'}]};
   if(name==='pci_notification_recipient')return {data:'U2'};
   calls.push({name,p});if(fail)return {error:{message:'Private backend detail'}};
   if(name==='pci_combine_entry'){row={...row,entry_type:'one_on_ones',revision:row.revision+1};return {data:row};}
   if(name==='pci_discard_entry'){row={...row,discarded:!p.p_restore,revision:row.revision+1};return {data:row};}
   row={id:p.p_id,pair_id:p.p_pair,entry_type:p.p_type,author_id:actor,content:p.p_content,revision:(row?.revision||0)+1,state:p.p_submit?'submitted':'draft',submitted_at:p.p_submit?'2026-10-03T12:00:00Z':null};return {data:row};
 },from:()=>{const q={};for(const k of ['select','eq','order','range','is','limit'])q[k]=()=>q;q.single=()=>Promise.resolve({data:row});q.then=resolve=>Promise.resolve({data:row?[row]:[]}).then(resolve);return q;}};
 const client={chat:{postMessage:async p=>{if(notifyFail)throw new Error('missing_scope');calls.push({name:'message',p});}},views:{open:async p=>{calls.push({name:'open',p});return {view:{id:'V1'}};},update:async p=>{validate(p.view);calls.push({name:'update',p});}}};
 const restart=()=>registerConversations(app,{forUser:async()=>({client:db,actor})},'T1',undefined,ai,'test-approval-secret');restart();
 return {restart,handlers,client,calls,body:{team:{id:'T1'},user:{id:'U1'}},get row(){return row;}};
}
test('website suggestions and all optional sections render valid Block Kit for both roles',()=>{
 assert.equal(questionOptions('manager').length,53);assert.equal(questionOptions('employee').length,54);
 for(const role of ['manager','employee'])for(const type of ['one_on_ones',...Object.keys(sections).filter(t=>!['topics','prep','wrap'].includes(t))]){
   const m={id,pair,type,role};
   const entry={content:{},submitted_at:'2026-10-03T12:00:00Z'};
   for(const step of stepsFor(type)){validate(sectionForm({...m,step},role));assert.deepEqual(parseSection(step,role,{}).errors,{});}
   validate(sectionMenu(m,entry));validate(reviewView(m,entry,role));validate(reviewView(m,entry,role,true));
 }
});
test('draft menu is green only for sections with entered saved information and private notes never offer submit',()=>{
 const m={id,pair,type:'one_on_ones',role:'manager'};
 const menu=sectionMenu(m,{content:{topics:{other:'Discuss project'},prep:{q0:''}}});
 const buttons=menu.blocks.flatMap(b=>b.elements||[]);assert.equal(buttons.find(b=>b.action_id==='pci_work_step_topics').style,'primary');assert.equal(buttons.find(b=>b.action_id==='pci_work_step_prep').style,undefined);
 assert(!validate(sectionMenu({...m,type:'performance_updates'},{content:{}})).includes('pci_work_review'));
});
test('forged dropdown values, impossible dates and oversized answers are rejected',()=>{
 assert(parseSection('topics','manager',{suggestion:{value:{selected_option:{value:'forged'}}}}).errors.suggestion);
 assert(parseSection('topics','manager',{meeting_date:{value:{selected_date:'2026-02-30'}}}).errors.meeting_date);
 assert(parseSection('prep','employee',{q0:{value:{value:'x'.repeat(2001)}}}).errors.q0);
});
test('section save acknowledges before persistence, retains UUID and advances only after commit',async()=>{
 const f=fixture();let acknowledged=false;
 const view={id:'V1',private_metadata:JSON.stringify({id,pair,type:'one_on_ones',role:'manager',step:'topics'}),state:{values:{other:{value:{value:'A new conversation'}}}}};
 await f.handlers.view.pci_work_save({ack:async()=>{acknowledged=true;},body:f.body,view,client:f.client});
 assert(acknowledged);assert.equal(f.row.id,id);assert.equal(f.row.state,'draft');assert.equal(f.row.content.topics.other,'A new conversation');
 const next=f.calls.at(-1).p.view;assert.equal(next.title.text,'Conversation sections');assert.equal(JSON.parse(next.private_metadata).revision,1);
});
test('failed draft save preserves answers and does not advance or claim successful save',async()=>{
 const f=fixture({fail:true});const m={id,pair,type:'one_on_ones',role:'manager',step:'topics'};
 await f.handlers.view.pci_work_save({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:JSON.stringify(m),state:{values:{other:{value:{value:'Keep my answer'}}}}},client:f.client});
 const restored=f.calls.at(-1).p.view;assert.equal(JSON.parse(restored.private_metadata).step,'topics');assert.equal(restored.blocks.find(b=>b.block_id==='other').element.initial_value,'Keep my answer');assert.equal(f.row,undefined);
});
test('malformed metadata and other-workspace submission acknowledge an error without writing',async()=>{
 const f=fixture();let response;
 await f.handlers.view.pci_work_submit({ack:async p=>response=p,body:{team:{id:'OTHER'}},view:{id:'V1',private_metadata:'bad'},client:f.client});
 assert(response.view.blocks[0].text.text.includes('Unauthorized'));assert(!f.calls.length);
 await f.handlers.view.pci_work_save({ack:async p=>response=p,body:f.body,view:{id:'V1',private_metadata:'bad'},client:f.client});
 assert(response.view.blocks[0].text.text.includes('Invalid form'));assert(!f.calls.length);
});
test('all guided surface actions have handlers; selecting a category filters suggestions without losing text',()=>{
 const f=fixture();
 for(const role of ['manager','employee'])for(const type of ['one_on_ones','achievements','performance_updates','review_prep_drafts']){
   const m={id,pair,type,role};const entry={content:{},submitted_at:'2026-10-03T12:00:00Z'};
   const views=[...stepsFor(type).map(step=>sectionForm({...m,step},role)),sectionMenu(m,entry),reviewView(m,entry,role),reviewView(m,entry,role,true)];
   for(const v of views){for(const action of validate(v))assert(f.handlers.action[action],action);if(v.callback_id)assert(f.handlers.view[v.callback_id]);}
 }
 const form=sectionForm({id,pair,type:'one_on_ones',role:'manager',step:'topics'},'manager',{category:'Wins',other:'Retained text'});
 const options=form.blocks.find(b=>b.block_id==='suggestion').element.options;
 assert.equal(options.length,4);assert.equal(form.blocks.find(b=>b.block_id==='other').element.initial_value,'Retained text');
});
test('numbered navigation saves current answers before opening another section',async()=>{
 const f=fixture();const m={id,pair,type:'one_on_ones',role:'manager',step:'topics',target:'goals'};
 await f.handlers.action.pci_work_jump_goals({ack:async()=>{},body:{...f.body,view:{id:'V1',state:{values:{other:{value:{value:'Save before switching'}}}}}},action:{value:JSON.stringify(m)},client:f.client});
 assert.equal(f.row.content.topics.other,'Save before switching');assert.equal(JSON.parse(f.calls.at(-1).p.view.private_metadata).step,'goals');
 const button=f.calls.at(-1).p.view.blocks.flatMap(b=>b.elements||[]).find(b=>b.action_id==='pci_work_jump_topics');assert.equal(button.style,'primary');
});
test('exploring empty sections or continuing blank forms never creates a draft',async()=>{
 const f=fixture();const m={id,pair,type:'one_on_ones',role:'manager',step:'topics',target:'goals'};
 await f.handlers.action.pci_work_jump_goals({ack:async()=>{},body:{...f.body,view:{id:'V1',state:{values:{}}}},action:{value:JSON.stringify(m)},client:f.client});
 assert.equal(f.row,undefined);assert(!f.calls.some(c=>c.name==='pci_save_entry'));
 assert.equal(JSON.parse(f.calls.at(-1).p.view.private_metadata).step,'goals');
 await f.handlers.view.pci_work_save({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:JSON.stringify({...m,step:'wrap'}),state:{values:{}}},client:f.client});
 assert.equal(f.row,undefined);assert(!f.calls.some(c=>c.name==='pci_save_entry'));
 assert(f.calls.at(-1).p.view.blocks[0].text.text.includes('Nothing has been saved'));
 assert(!validate(f.calls.at(-1).p.view).includes('pci_work_review'));
});
test('a single goal or topic can be saved, reviewed and submitted without completing other sections',async()=>{
 for(const step of ['goals','topics']){
   const f=fixture(),key=step==='goals'?'title':'other';
   const m={id,pair,type:'one_on_ones',role:'manager',step};
   await f.handlers.action.pci_work_finish({ack:async()=>{},body:{...f.body,view:{id:'V1',state:{values:{[key]:{value:{value:'Just one item'}}}}}},action:{value:JSON.stringify(m)},client:f.client});
   const review=f.calls.at(-1).p.view;assert.equal(review.callback_id,'pci_work_submit');assert.equal(f.row.state,'draft');assert.deepEqual(Object.keys(f.row.content),[step]);
   await f.handlers.view.pci_work_submit({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:review.private_metadata},client:f.client});
   assert.equal(f.row.state,'submitted');assert.deepEqual(Object.keys(f.row.content),[step]);
 }
});
test('immediate review rejects an empty entry and failed persistence keeps current answers',async()=>{
 for(const fail of [false,true]){
   const f=fixture({fail}),m={id,pair,type:'one_on_ones',role:'manager',step:'goals'};
   await f.handlers.action.pci_work_finish({ack:async()=>{},body:{...f.body,view:{id:'V1',state:{values:fail?{title:{value:{value:'Keep my goal'}}}:{}}}},action:{value:JSON.stringify(m)},client:f.client});
   const result=f.calls.at(-1).p.view;assert.equal(result.callback_id,'pci_work_save');assert.equal(f.row,undefined);
   if(fail)assert.equal(result.blocks.find(b=>b.block_id==='title').element.initial_value,'Keep my goal');
   else assert(result.blocks.some(b=>b.text?.text.includes('Add one topic')));
 }
 for(const type of ['performance_updates','review_prep_drafts'])assert(!validate(sectionForm({id,pair,type,role:'manager',step:type},'manager')).includes('pci_work_finish'));
});
test('one, two, three, four or all nine chosen sections submit together with their saved answers intact',async()=>{
 const choices=[['topics','other'],['achievements','title'],['goals','title'],['development_plans','title'],['career_conversations','direction'],['feedback','question'],['actions','title'],['wrap','agreed'],['prep','q0']];
 for(const count of [1,2,3,4,9]){
   const f=fixture();let revision;
   for(let i=0;i<count;i++){
     const [step,key]=choices[i];const m={id,pair,type:'one_on_ones',role:'manager',step,revision,target:choices[(i+1)%choices.length][0]};
     const args={ack:async()=>{},body:{...f.body,view:{id:'V1',state:{values:{[key]:{value:{value:'Chosen answer '+i}}}}}},action:{value:JSON.stringify(m)},client:f.client};
     await f.handlers.action[i===count-1?'pci_work_finish':'pci_work_jump_'+m.target](args);
     revision=f.row.revision;
   }
   const review=f.calls.at(-1).p.view;assert.equal(review.callback_id,'pci_work_submit');
   await f.handlers.view.pci_work_submit({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:review.private_metadata},client:f.client});
   assert.equal(f.row.state,'submitted');assert.deepEqual(Object.keys(f.row.content),choices.slice(0,count).map(([step])=>step));
   choices.slice(0,count).forEach(([step,key],i)=>assert.equal(f.row.content[step][key],'Chosen answer '+i));
 }
});
test('every shareable feature supports submitting its own single entry',async()=>{
 for(const type of ['achievements','goals','development_plans','career_conversations','feedback','feedback_requests','actions']){
   const f=fixture();const field=fieldsFor(type,'manager').find(x=>!x.options&&!x.date&&!x.feedbackType);
   const m={id,pair,type,role:'manager',step:type};
   await f.handlers.action.pci_work_finish({ack:async()=>{},body:{...f.body,view:{id:'V1',state:{values:{[field.key]:{value:{value:'Only this feature'}}}}}},action:{value:JSON.stringify(m)},client:f.client});
   const review=f.calls.at(-1).p.view;assert.equal(review.callback_id,'pci_work_submit');
   await f.handlers.view.pci_work_submit({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:review.private_metadata},client:f.client});
   assert.equal(f.row.state,'submitted');assert.deepEqual(Object.keys(f.row.content),[type]);
 }
});
test('saved drafts can be discarded and restored, while submitted entries cannot be discarded',async()=>{
 const f=fixture(),m={id,pair,type:'one_on_ones',role:'manager',step:'topics'};
 await f.handlers.action.pci_work_finish({ack:async()=>{},body:{...f.body,view:{id:'V1',state:{values:{other:{value:{value:'Saved topic'}}}}}},action:{value:JSON.stringify(m)},client:f.client});
 for(const restore of [false,true]){
   await f.handlers.action[restore?'pci_work_restore':'pci_work_discard']({ack:async()=>{},body:{...f.body,view:{id:'V1'}},action:{value:JSON.stringify({...m,revision:f.row.revision})},client:f.client});
   assert.equal(f.row.discarded,!restore);assert.equal(f.row.content.topics.other,'Saved topic');
 }
 const saved=f.row;
 await f.handlers.view.pci_work_submit({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:JSON.stringify({...m,revision:saved.revision})},client:f.client});
 const count=f.calls.filter(c=>c.name==='pci_discard_entry').length;
 await f.handlers.action.pci_work_discard({ack:async()=>{},body:{...f.body,view:{id:'V1'}},action:{value:JSON.stringify({...m,revision:f.row.revision})},client:f.client});
 assert.equal(f.calls.filter(c=>c.name==='pci_discard_entry').length,count);
});

test('empty open section stays neutral and Save returns to choices with Close',async()=>{
 const m={id,pair,type:'one_on_ones',role:'manager',step:'goals'};
 const form=sectionForm(m,'manager');
 const selected=form.blocks.flatMap(b=>b.elements||[]).find(b=>b.action_id==='pci_work_jump_goals');
 assert.equal(selected.style,undefined);assert(selected.text.text.includes('Not saved'));
 const saved=sectionForm(m,'manager',undefined,undefined,{goals:{title:'A saved goal'}}).blocks.flatMap(b=>b.elements||[]).find(b=>b.action_id==='pci_work_jump_goals');assert.equal(saved.style,'primary');assert(saved.text.text.includes('Saved'));
 assert.equal(form.close.text,'Close');assert.equal(form.submit.text,'Save draft');
 const f=fixture();await f.handlers.view.pci_work_save({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:JSON.stringify(m),state:{values:{title:{value:{value:'One goal'}}}}},client:f.client});
 const result=f.calls.at(-1).p.view;assert.equal(result.title.text,'Conversation sections');assert.equal(result.close.text,'Close');assert(validate(result).includes('pci_work_review'));
});

test('submission alerts the assigned recipient without copying private content and preserves submission on alert failure',async()=>{
 for(const notifyFail of [false,true]){const f=fixture({notifyFail}),m={id,pair,type:'goals',role:'manager',step:'goals'};
 await f.handlers.action.pci_work_finish({ack:async()=>{},body:{...f.body,view:{id:'V1',state:{values:{title:{value:{value:'Private goal text'}}}}}},action:{value:JSON.stringify(m)},client:f.client});
 const review=f.calls.at(-1).p.view;await f.handlers.view.pci_work_submit({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:review.private_metadata},client:f.client});
 assert.equal(f.row.state,'submitted');const message=f.calls.find(c=>c.name==='message');
 if(notifyFail)assert(f.calls.at(-1).p.view.blocks.some(b=>b.text?.text.includes('could not be delivered')));
 else {assert.equal(message.p.channel,'U2');assert(!JSON.stringify(message.p).includes('Private goal text'));assert(validate(f.calls.at(-1).p.view).includes('pci_work_reply'));}
 }
});

test('each Home box directly opens its form for one assigned colleague without saving a draft',async()=>{
 for(const type of ['one_on_ones','achievements','goals','actions','development_plans','career_conversations','feedback','feedback_requests','performance_updates','review_prep_drafts']){
 const f=fixture();await f.handlers.action['pci_feature_'+type]({ack:async()=>{},body:{...f.body,trigger_id:'trigger'},client:f.client});
 const form=f.calls.at(-1).p.view;assert.equal(form.callback_id,'pci_work_save');assert.equal(JSON.parse(form.private_metadata).type,stepsFor('one_on_ones').includes(type)||type==='one_on_ones'?'one_on_ones':type);assert(validate(form).includes('pci_work_records'));assert.equal(f.row,undefined);
 }
});

test('multiple chosen areas open one conversation with only those areas and immediate review',async()=>{
 const f=fixture();await f.handlers.view.pci_work_areas_choose({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:JSON.stringify({type:'one_on_ones',pair}),state:{values:{areas:{value:{selected_options:[{value:'goals'},{value:'achievements'}]}}}}},client:f.client});
 const form=f.calls.at(-1).p.view;const m=JSON.parse(form.private_metadata);assert.deepEqual(m.areas,['goals','achievements']);assert.equal(m.step,'achievements');
 const ids=validate(form);assert(ids.includes('pci_work_jump_goals'));assert(ids.includes('pci_work_finish'));assert(!ids.includes('pci_work_jump_prep'));assert.equal(f.row,undefined);
});

test('changing chosen areas excludes unchecked saved content from submission',async()=>{
 const f=fixture();let m={id,pair,type:'one_on_ones',role:'manager',step:'achievements',areas:['achievements','goals']};
 await f.handlers.action.pci_work_finish({ack:async()=>{},body:{...f.body,view:{id:'V1',state:{values:{title:{value:{value:'Saved achievement'}}}}}},action:{value:JSON.stringify(m)},client:f.client});
 m={...m,revision:f.row.revision,step:'goals'};
 await f.handlers.action.pci_work_change_areas({ack:async()=>{},body:{...f.body,view:{id:'V1',state:{values:{title:{value:{value:'Chosen goal'}}}}}},action:{value:JSON.stringify(m)},client:f.client});
 const picker=f.calls.at(-1).p.view;
 await f.handlers.view.pci_work_areas_choose({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:picker.private_metadata,state:{values:{areas:{value:{selected_options:[{value:'goals'}]}}}}},client:f.client});
 const form=f.calls.at(-1).p.view;assert(form.blocks.some(b=>b.text?.text.includes('Goal examples')));
 await f.handlers.view.pci_work_submit({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:form.private_metadata},client:f.client});
 assert.deepEqual(Object.keys(f.row.content),['goals']);assert.equal(f.row.content.goals.title,'Chosen goal');
});

test('category precedes achievement details and feedback and send labels identify the recipient',()=>{
 assert.equal(fieldsFor('achievements','manager')[0].key,'category');
 for(const role of ['manager','employee']){const recipient=role==='manager'?'employee':'manager';
 assert(fieldsFor('feedback',role)[0].label.includes(role==='manager'?recipient:'agree'));
 const m={id,pair,type:'one_on_ones',role,step:'feedback'};const form=sectionForm(m,role);
 assert(form.blocks.flatMap(b=>b.elements||[]).find(b=>b.action_id==='pci_work_finish').text.text.includes('Review before sending'));
 assert.equal(reviewView(m,{content:{feedback:{observation:'An example'}}},role).submit.text,'Send to '+recipient);}
});

test('opening another shared Home area resumes the same draft and submits both areas once',async()=>{
 const f=fixture();let m={id,pair,type:'one_on_ones',role:'manager',step:'goals',areas:['goals']};
 await f.handlers.view.pci_work_save({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:JSON.stringify(m),state:{values:{title:{value:{value:'Goal in one conversation'}}}}},client:f.client});
 await f.handlers.action.pci_feature_achievements({ack:async()=>{},body:{...f.body,trigger_id:'trigger'},client:f.client});
 const form=f.calls.at(-1).p.view;m=JSON.parse(form.private_metadata);assert.equal(m.id,id);assert.equal(m.step,'achievements');assert.deepEqual(m.areas,['goals','achievements']);
 await f.handlers.action.pci_work_finish({ack:async()=>{},body:{...f.body,view:{id:'V1',state:{values:{title:{value:{value:'Achievement in same conversation'}}}}}},action:{value:JSON.stringify(m)},client:f.client});
 const review=f.calls.at(-1).p.view;assert.equal(review.submit.text,'Send to Stella');
 await f.handlers.view.pci_work_submit({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:review.private_metadata},client:f.client});
 assert.equal(f.row.state,'submitted');assert.deepEqual(Object.keys(f.row.content),['goals','achievements']);assert.equal(f.calls.filter(c=>c.name==='message').length,1);
});

test('a previously separate feedback request can add areas without losing its saved text',async()=>{
 const f=fixture(),m={id,pair,type:'feedback_requests',role:'manager',step:'feedback_requests'};
 await f.handlers.view.pci_work_save({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:JSON.stringify(m),state:{values:{question:{value:{value:'How can I support you?'}}}}},client:f.client});
 const menu=f.calls.at(-1).p.view;assert(validate(menu).includes('pci_work_menu_areas'));
 await f.handlers.action.pci_work_menu_areas({ack:async()=>{},body:{...f.body,view:{id:'V1',type:'modal'}},action:{value:menu.private_metadata},client:f.client});
 assert.equal(f.row.entry_type,'one_on_ones');assert.equal(f.row.content.feedback_requests.question,'How can I support you?');assert.equal(f.row.state,'draft');assert.equal(f.calls.at(-1).p.view.callback_id,'pci_work_areas_choose');
});

test('Home submit reviews the whole saved conversation without submitting or notifying',async()=>{
 const f=fixture(),m={id,pair,type:'one_on_ones',role:'manager',step:'goals'};
 await f.handlers.view.pci_work_save({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:JSON.stringify(m),state:{values:{title:{value:{value:'Saved goal'}}}}},client:f.client});
 await f.handlers.action.pci_work_home_submit({ack:async()=>{},body:{...f.body,trigger_id:'trigger'},client:f.client});
 const review=f.calls.at(-1).p.view;assert(validate(review).includes('pci_work_review'));assert(review.blocks.flatMap(b=>b.elements||[]).some(b=>b.text?.text.includes('Goals & growth')));assert.equal(f.row.state,'draft');assert.equal(f.calls.filter(c=>c.name==='message').length,0);
});

 test('simplified manager prompts and employee response contain only intended questions',()=>{
 assert(!fieldsFor('prep','manager').some(f=>['What specific examples support that?','What support can you provide?'].includes(f.label)));
 assert.deepEqual(fieldsFor('feedback','employee').map(f=>f.key),['agreement','observation','manager_feedback']);
 assert.deepEqual(fieldsFor('feedback','manager').map(f=>f.key),['question']);
 const review=reviewView({id,pair,type:'one_on_ones',areas:['goals']},{content:{goals:{title:'One goal'}}},'manager');assert(validate(review).includes('pci_work_menu_areas'));assert.equal(review.close.text,'Close');
 });

test('new conversation chooses a person before offering exactly four areas',async()=>{
 const f=fixture();await f.handlers.action.pci_work_areas({ack:async()=>{},body:{...f.body,trigger_id:'T'},client:f.client});
 const person=f.calls.at(-1).p.view;assert.equal(person.callback_id,'pci_work_person');assert(!person.blocks.some(b=>b.block_id==='areas'));
 await f.handlers.view.pci_work_person({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:person.private_metadata,state:{values:{pair:{value:{selected_option:{value:pair}}}}}},client:f.client});
 const areas=f.calls.at(-1).p.view;assert.deepEqual(areas.blocks.find(b=>b.block_id==='areas').element.options.map(o=>o.value),['topics','achievements','goals','actions']);assert.equal(f.row,undefined);
});

 test('area replies parse and display separately without asking to create a new goal',()=>{
 const parsed=parseSection('goals','employee',{agreement:{value:{selected_option:{value:'Agree'}}},response:{value:{value:'The target works for me'}}},true);
 assert.equal(parsed.fields.response,'The target works for me');
 assert.equal(parsed.fields.agreement,'Agree');
 assert.equal('title' in parsed.fields,false);
 const view=reviewView({type:'one_on_ones',parent:id,areas:['goals']},{parent_id:id,content:{goals:parsed.fields}},'employee');
 assert.match(JSON.stringify(view),/Your response about Goals & growth/);
 assert.match(JSON.stringify(view),/The target works for me/);
 });

 test('AI consent, editable approval, private save, review and send interaction flow',async()=>{
 for(const kind of ['questions','summary','actions']){
 const inputs=[];const f=fixture({ai:{enabled:true,generate:async(...args)=>{inputs.push(args);return 'Proposed draft';}}});
 const m={id,pair,type:'one_on_ones',role:'manager',step:'topics'};
 await f.handlers.view.pci_work_save({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:JSON.stringify(m),state:{values:{other:{value:{value:'Project progress'}}}}},client:f.client});
 const source=f.calls.at(-1).p.view;
 assert(validate(source).includes('pci_ai_consent'));
 const act=async(name,v)=>f.handlers.action[name]({ack:async()=>{},body:{...f.body,view:{id:'V1'}},action:{value:v},client:f.client});
 await act('pci_ai_consent',source.private_metadata);
 const consent=f.calls.at(-1).p.view;const count=f.calls.filter(c=>c.name==='pci_save_entry').length;
 let error;
 await f.handlers.view.pci_ai_generate({ack:async p=>error=p,body:f.body,view:{id:'V1',private_metadata:consent.private_metadata,state:{values:{kind:{value:{selected_option:{value:kind}}}}}},client:f.client});
 assert(error.errors);assert.equal(inputs.length,0);
 await f.handlers.view.pci_ai_generate({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:consent.private_metadata,state:{values:{kind:{value:{selected_option:{value:kind}}},consent:{value:{selected_options:[{value:'yes'}]}}}}},client:f.client});
 const draft=f.calls.at(-1).p.view;assert.equal(f.calls.filter(c=>c.name==='pci_save_entry').length,count);assert(!f.calls.some(c=>c.name==='message'));
 f.restart(); // A fresh Worker must verify approval without process memory.
 const forged=JSON.parse(draft.private_metadata);forged.token=forged.token.slice(0,-1)+'!';
 await f.handlers.view.pci_ai_approve({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:JSON.stringify(forged),state:{values:{draft:{value:{value:'Tampered'}},approval:{value:{selected_options:[{value:'yes'}]}}}}},client:f.client});
 assert.equal(f.calls.filter(c=>c.name==='pci_save_entry').length,count);
 const edited={draft:{value:{value:'Human edited summary'}}};
 await f.handlers.view.pci_ai_approve({ack:async p=>error=p,body:f.body,view:{id:'V1',private_metadata:draft.private_metadata,state:{values:edited}},client:f.client});assert(error.errors);
 await f.handlers.view.pci_ai_approve({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:draft.private_metadata,state:{values:{...edited,approval:{value:{selected_options:[{value:'yes'}]}}}}},client:f.client});
 assert.equal(f.row.state,'draft');assert.equal(f.row.content[{questions:'topics',summary:'wrap',actions:'actions'}[kind]][{questions:'other',summary:'discussed',actions:'details'}[kind]],'Human edited summary');assert(!f.calls.some(c=>c.name==='message'));
 const form=f.calls.at(-1).p.view;
 await act('pci_work_review',form.private_metadata);
 const review=f.calls.at(-1).p.view;
 await f.handlers.view.pci_work_submit({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:review.private_metadata},client:f.client});
 assert.equal(f.row.state,'submitted');assert.equal(f.calls.filter(c=>c.name==='message').length,1);
 }
 });
 test('AI refuses private entries and disabled feature',async()=>{
 for(const enabled of [true,false]){let generated=false;const f=fixture({ai:{enabled,generate:async()=>{generated=true;}}});
 const m={id,pair,type:'performance_updates',role:'manager',step:'performance_updates'};
 await f.handlers.view.pci_work_save({ack:async()=>{},body:f.body,view:{id:'V1',private_metadata:JSON.stringify(m),state:{values:{observation:{value:{value:'Private note'}}}}},client:f.client});
 assert(!validate(f.calls.at(-1).p.view).includes('pci_ai_consent'));
 await f.handlers.action.pci_ai_consent({ack:async()=>{},body:{...f.body,view:{id:'V1'}},action:{value:JSON.stringify({...m,revision:1})},client:f.client});assert(!generated);
 }});
