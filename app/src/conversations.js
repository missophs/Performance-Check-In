import {createAI} from './ai.js';
import {randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
import {Store} from './store.js';
import {plain,section,button,loading,notice} from './views.js';
import {catalog,uuid} from './catalog.js';
import {sections,stepsFor,fieldsFor,questionOptions} from './conversation-config.js';
import {userMessage} from './errors.js';
const state=(v,k)=>v.state?.values[k]?.value;
const value=s=>s?.selected_option?.value??s?.selected_date??s?.value??'';
const meta=view=>JSON.parse(view.private_metadata);
const selectedSteps=m=>m.areas?.length?stepsFor(m.type).filter(step=>m.areas.includes(step)):stepsFor(m.type);
const availableSteps=()=>['topics','achievements','goals','actions'];
const actions=(...elements)=>({type:'actions',elements});
const modal=(title,m,blocks,callback,submit)=>({type:'modal',title:plain(title.slice(0,24)),close:plain('Close'),private_metadata:JSON.stringify(m),blocks,...(callback?{callback_id:callback,submit:plain(submit)}:{})});
const hasContent=o=>Object.values(o||{}).some(v=>typeof v==='string'&&v.trim());
export function parseSection(step,role,values,response=false){
 const fields={},errors={};
 for(const f of fieldsFor(step,role,response)){
   const raw=value(values[f.key]?.value||values[f.key]?.pci_work_category);const v=typeof raw==='string'?raw.trim():'';
   if(typeof raw!=='string'||v.length>2000)errors[f.key]='Use at most 2,000 characters.';
   else if(f.options&&v&&!f.options.some(o=>(typeof o==='string'?o:o.value)===v))errors[f.key]='Choose a listed option.';
   else if(f.date&&v&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v))errors[f.key]='Choose a valid date.';
   else fields[f.key]=v;
 }
 return {fields,errors};
}
export function sectionForm(m,role,content={},error,allContent={}){
 const config=sections[m.step];if(!config)throw new Error('Invalid section');
 const blocks=[section(m.type==='one_on_ones'&&!m.revision&&!m.parent?'New conversation'+(m.partner?' with '+m.partner:'')+' — nothing saved yet.':config.label),section(m.step==='wrap'?'Complete this after the conversation. The author records the summary; the other person can add a separate response after submission.':'Every question is optional. Choose any numbered section. Save returns to your choices; Review & submit shares only the information you entered. Your draft stays private.')];
 if(m.type==='one_on_ones')blocks.push(actions(button('Click here if you want to add other topics','pci_work_change_areas',m)));
 if(m.step==='goals')blocks.push(section('Goal examples — adapt one to your role:\n• Complete a training course and apply one new skill by a chosen date.\n• Finish an agreed project milestone by its target date.\n• Improve a process using an agreed measure of success.\n• Ask for feedback and practice one improvement.\nWrite your own goal below; these examples are optional.'));
 blocks.push(actions(button('📂 View saved entries','pci_work_records',{type:m.type,pair:m.pair,page:0})));
 if(m.savedStep)blocks.push(section('✓ '+sections[m.savedStep].label+' saved.'));
 if(!sections[m.type]?.private)blocks.push(actions(button(role==='manager'?'Review before sending':'Review before sending','pci_work_finish',m)));
 const navigation=selectedSteps(m).map((step,i)=>({...button((i+1)+'. '+sections[step].label+(hasContent(allContent[step])?' ✓ Saved':step===m.step?' • Not saved':''),'pci_work_jump_'+step,{...m,target:step}),...(hasContent(allContent[step])?{style:'primary'}:{})}));
 for(let i=0;i<navigation.length;i+=3)blocks.push(actions(...navigation.slice(i,i+3)));
 if(error)blocks.push(section(error));
 for(const f of fieldsFor(m.step,role,Boolean(m.parent))){
   const current=content[f.key]||'';
   let element={type:'plain_text_input',action_id:'value',multiline:true,max_length:2000,...(current?{initial_value:current}:{})};
   if(f.options){
     let choices=f.options;
     if(f.suggestions&&content.category){const cat=content.category==='Development'?'Learning & development':content.category;const permitted=new Set(questionOptions(role).filter(o=>o.category===cat).map(o=>o.value));choices=f.options.filter(o=>typeof o==='string'||permitted.has(o.value));}
     const options=choices.map(o=>({text:plain((typeof o==='string'?o:o.label).slice(0,75)),value:typeof o==='string'?o:o.value}));
     element={type:'static_select',action_id:m.step==='topics'&&f.key==='category'?'pci_work_category':'value',options,...(options.some(o=>o.value===current)?{initial_option:options.find(o=>o.value===current)}:{})};
   }
   if(f.date)element={type:'datepicker',action_id:'value',...(current?{initial_date:current}:{})};
   blocks.push({type:'input',block_id:f.key,optional:true,...(element.action_id==='pci_work_category'?{dispatch_action:true}:{}),label:plain(f.label),element});
   if(f.suggestions&&current){const q=questionOptions(role).find(o=>o.value===current);if(q)blocks.push(section('Selected question: '+q.question));}
 }
 return modal(config.label,m,blocks,'pci_work_save',m.type==='one_on_ones'?'Save draft':'Save');
}
export function sectionMenu(m,entry){
 const privateEntry=sections[m.type]?.private;
 const blocks=[section(!m.revision?'Nothing has been saved. You can explore the sections or Close to return to Home.':privateEntry?'Only you can see this entry.':'All saved areas belong to this one conversation. Add another area, or review everything and submit once to your '+(m.role==='manager'?'employee':'manager')+'.')];
 selectedSteps(m).forEach((step,i)=>blocks.push(actions({...button((i+1)+'. '+sections[step].label+(hasContent(entry.content[step])?' ✓ Saved':''),'pci_work_step_'+step,{...m,step}),...(hasContent(entry.content[step])?{style:'primary'}:{})})));
 if(!privateEntry&&m.revision&&Object.values(entry.content).some(hasContent))blocks.push(actions(button('Review before sending','pci_work_review',m)));
 if(!privateEntry)blocks.push(actions(button('Click here if you want to add other topics','pci_work_menu_areas',m)));
 if(m.aiEnabled&&!privateEntry&&m.revision)blocks.push(actions(button('AI Assist (optional)','pci_ai_consent',m)));
 return modal(privateEntry?'Private entry':'Conversation sections',m,blocks);
}
export function reviewView(m,entry,role,readOnly=false){
 const blocks=[section(readOnly?'Submitted '+new Date(entry.submitted_at).toLocaleDateString('en-US',{timeZone:'America/New_York'})+'. This copy is read only.':'Review your information. Submitting shares every saved section below with your assigned '+(role==='manager'?'employee':'manager')+'. You can submit one section, several, or all. Blank sections are skipped.')];
 for(const step of selectedSteps(m)){
   const data=entry.content[step]||{};if(!hasContent(data))continue;
   if(data.ai_origin)blocks.push(section('AI-assisted content — reviewed by a human before saving.'));
   blocks.push({type:'divider'},{type:'header',text:plain(({topics:'💬 ',achievements:'🏆 ',goals:'🎯 ',actions:'✅ '}[step]||'')+sections[step].label)});
   for(const f of fieldsFor(step,role,Boolean(m.parent||entry.parent_id)&&('response' in data||'agreement' in data)))if(data[f.key]){
     const v=f.suggestions?questionOptions(role).find(o=>o.value===data[f.key])?.question||data[f.key]:data[f.key];
     blocks.push(section(f.label+'\n'+v));
   }
 }
 if(blocks.length===1)blocks.push(section('No information yet. Save a section before submitting.'));
 if(readOnly&&!sections[m.type]?.private){blocks.push(actions(button('Add my response','pci_work_reply',m)));if(m.aiEnabled)blocks.push(actions(button('AI Assist (optional)','pci_ai_consent',m)));}
 if(!readOnly)blocks.push(section('Changed your mind? Change included areas below, or Close to keep this private without sending.'),actions(button('Change included areas','pci_work_menu_areas',m),button('Back','pci_work_menu',m)));
 return modal(readOnly?'Submitted conversation':'Review & submit',m,blocks,readOnly?undefined:'pci_work_submit',m.partner?'Send to '+m.partner:role==='manager'?'Send to employee':'Send to manager');
}
export function registerConversations(app,sessions,teamId,publishHome,ai=createAI(),approvalSecret=randomUUID()){
 const team=b=>b.team_id||b.team?.id;
 const user=b=>b.user_id||b.user?.id||b.user;
 const aiBusy=new Set(),aiLast=new Map();
 const sign=data=>{const payload=Buffer.from(JSON.stringify(data)).toString('base64url');return payload+'.'+createHmac('sha256',approvalSecret).update(payload).digest('base64url');};
 const verify=token=>{try{const [payload,signature,...extra]=token.split('.');if(extra.length)return null;const expected=createHmac('sha256',approvalSecret).update(payload).digest();const actual=Buffer.from(signature,'base64url');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;return JSON.parse(Buffer.from(payload,'base64url').toString());}catch{return null;}};
 async function ctx(body,pairId){
   if(team(body)!==teamId)throw new Error('Unauthorized workspace');
   const session=await sessions.forUser(teamId,user(body));const store=new Store(session.client,session.actor);
   const pairs=await store.pairs();const pair=pairId?pairs.find(p=>p.id===pairId):undefined;
   if(pairId&&!pair)throw new Error('This working relationship is no longer active.');
   return {store,db:session.client,actor:session.actor,pairs,pair,role:(pair?pair.manager_id===session.actor:pairs.some(p=>p.manager_id===session.actor))?'manager':'employee'};
 }
 async function query(c,q){return c.store.run(q);}
 async function entry(c,m){
   const e=await query(c,c.db.from('pci_entries').select('*').eq('id',m.id).single());
   if(e.pair_id!==m.pair||e.entry_type!==m.type)throw new Error('Entry mismatch');return e;
 }
 async function save(c,m,content,submit=false){
   if(m.revision){const existing=await entry(c,m);for(const [step,data] of Object.entries(content)){if(existing.content[step]?.ai_origin)content[step]={...data,ai_origin:existing.content[step].ai_origin,ai_source:existing.content[step].ai_source};}}
   return query(c,c.db.rpc('pci_save_entry',{p_id:m.id,p_pair:m.pair,p_type:m.type,p_parent:m.parent||null,p_expected:m.revision||null,p_content:content,p_submit:submit}));
 }
 async function list(body,client,m,viewId){
   const c=await ctx(body,m.pair);const page=m.page||0;
   if(!Number.isInteger(page)||page<0||page>10000)throw new Error('Invalid page');
   const rows=await query(c,c.db.from('pci_entries').select('*').eq('pair_id',m.pair).eq('entry_type',m.type).eq('has_content',true).eq('discarded',!!m.discarded).order('created_at',{ascending:false}).order('id').range(page*8,page*8+8));
   const blocks=[section((c.role==='manager'?'Employee: ':'Manager: ')+(c.pair.partner_name||'Assigned colleague')),section(sections[m.type]?.private?'These entries are private. They cannot be submitted to the other person.':'Each new entry is separate. Drafts are private; submitted entries are visible to both people.')];
   for(const e of rows.slice(0,8)){
     const when=new Date(e.created_at).toLocaleDateString('en-US',{timeZone:'America/New_York'});
     const author=e.author_id===c.pair.manager_id?'Manager':'Employee';
     const label=(m.discarded?'Discarded draft':e.state==='submitted'?author+' submitted':'Your draft')+' — '+when;
     if(!m.discarded)blocks.push({type:'section',text:plain(label+(e.parent_id?' • Response':'')),accessory:{...button(e.state==='submitted'?'View':'Continue draft','pci_work_open',{...m,id:e.id}),...(Object.values(e.content).some(hasContent)?{style:'primary'}:{})}});
     else blocks.push(section(label));
     if(e.state==='draft'&&e.author_id===c.actor)blocks.push(actions(button(m.discarded?'Restore draft':'Discard draft',m.discarded?'pci_work_restore':'pci_work_discard',{...m,id:e.id,revision:e.revision})));
   }
   if(!rows.length)blocks.push(section(m.discarded?'No discarded drafts.':m.type==='performance_updates'?'No private manager notes yet. Choose New entry to write one.':'No conversations yet. Choose New conversation to start one.'));
   blocks.push(actions(button(m.discarded?(m.type==='performance_updates'?'Back to manager notes':'Back to conversations'):'Discarded drafts','pci_work_history',{...m,page:0,discarded:!m.discarded})));
   if(page>0)blocks.push(actions(button('Previous page','pci_work_previous',{...m,page:page-1})));
   if(rows.length>8)blocks.push(actions(button('Next page','pci_work_next',{...m,page:page+1})));
   await client.views.update({view_id:viewId,view:modal(catalog[m.type].label,m,blocks,'pci_work_new',m.type==='one_on_ones'?'New conversation':'New entry')});
 }
 async function start(body,client,m,viewId){
   const c=await ctx(body,m.pair);
   if(sections[m.type]?.managerOnly&&c.role!=='manager')throw new Error('Manager only');
   if(m.resume){
     const rows=await query(c,c.db.from('pci_entries').select('*').eq('pair_id',m.pair).eq('entry_type','one_on_ones').eq('author_id',c.actor).eq('state','draft').eq('discarded',false).is('parent_id',null).order('updated_at',{ascending:false}).limit(1));
     const existing=rows[0];if(existing){const areas=[...new Set([...Object.keys(existing.content),...(m.areas||[])])];const next={type:'one_on_ones',pair:m.pair,partner:c.pair.partner_name,id:existing.id,revision:existing.revision,role:c.role,aiEnabled:ai.enabled,areas,step:m.areas?.[0]||areas[0]||'topics'};return client.views.update({view_id:viewId,view:sectionForm(next,c.role,existing.content[next.step],undefined,existing.content)});}
   }
   const next={aiEnabled:ai.enabled,type:m.type,pair:m.pair,partner:c.pair.partner_name,id:randomUUID(),parent:m.parent,role:c.role,areas:m.areas,step:selectedSteps(m)[0]};
   await client.views.update({view_id:viewId,view:sectionForm(next,c.role)});
 }
 const fail=async(client,id,error)=>client.views.update({view_id:id,view:notice(userMessage(error))});
 function action(id,fn){app.action(id,async a=>{await a.ack();try{await fn(a);await publishHome?.(a.body,a.client).catch(()=>{});}catch(e){if(a.body.view?.type==='modal')await fail(a.client,a.body.view.id,e);a.logger?.error({event:'pci_guided_failed',action:id,type:e.name,code:e.code||e.data?.error||'unknown',site:e.stack?.split('\n')[1]?.trim().slice(0,160)});}});}
 async function openFeature(body,client,type){
   const opened=await client.views.open({trigger_id:body.trigger_id,view:loading()});
   try{
     const c=await ctx(body);const pairs=c.pairs.filter(p=>!sections[type]?.managerOnly||p.manager_id===c.actor);
     if(!pairs.length)throw new Error('Your administrator needs to assign your working relationship.');
     const area=type==='one_on_ones'?'topics':type==='agenda_topics'?'topics':type;
     const combined=stepsFor('one_on_ones').includes(area);
     const draftMeta={type:combined?'one_on_ones':type,...(combined?{areas:[area],resume:true}:{})};
     if(pairs.length===1)return await start(body,client,{...draftMeta,pair:pairs[0].id},opened.view.id);
     const options=pairs.slice(0,100).map(p=>({text:plain(((p.manager_id===c.actor?'Employee: ':'Manager: ')+(p.partner_name||'Assigned colleague')).slice(0,75)),value:p.id}));
     await client.views.update({view_id:opened.view.id,view:modal('Choose a colleague',draftMeta,[{type:'input',block_id:'pair',label:plain('Whose conversation?'),element:{type:'static_select',action_id:'value',options}}],'pci_work_choose','Continue')});
   }catch(e){await fail(client,opened.view.id,e);}
 }
 action('pci_work_change_areas',async({body,action,client})=>{
 const m=JSON.parse(action.value),c=await ctx(body,m.pair);
 const parsed=parseSection(m.step,c.role,body.view.state.values,Boolean(m.parent));
 if(Object.keys(parsed.errors).length)throw new Error('Check your current answers first.');
 let e=m.revision?await entry(c,m):{content:{},revision:undefined};
 if(hasContent(parsed.fields)||hasContent(e.content[m.step]))e=await save(c,m,{...e.content,[m.step]:parsed.fields});
 const options=availableSteps().map(step=>({text:plain(step==='feedback'&&c.role!=='manager'?'Respond to your manager':sections[step].label),value:step}));
 await client.views.update({view_id:body.view.id,view:modal('Choose areas',{...m,revision:e.revision},[section('Uncheck any area you do not want to include. Unchecked areas will not be submitted.'),{type:'input',block_id:'areas',label:plain('Areas to include'),element:{type:'checkboxes',action_id:'value',options,initial_options:options.filter(o=>selectedSteps(m).includes(o.value))}}],'pci_work_areas_choose','Open selected areas')});
 });
 action('pci_work_menu_areas',async({body,action,client})=>{
 const m=JSON.parse(action.value),c=await ctx(body,m.pair);if(m.revision)await entry(c,m);
 if(m.type!=='one_on_ones'){const e=await query(c,c.db.rpc('pci_combine_entry',{p_id:m.id,p_expected:m.revision}));m.type='one_on_ones';m.revision=e.revision;m.areas=Object.keys(e.content);}
 const options=availableSteps().map(step=>({text:plain(step==='feedback'&&c.role!=='manager'?'Respond to your manager':sections[step].label),value:step}));
 await client.views.update({view_id:body.view.id,view:modal('Choose areas',m,[section('Choose the areas to include in this conversation. Submit them together when ready.'),{type:'input',block_id:'areas',label:plain('Areas to include'),element:{type:'checkboxes',action_id:'value',options,initial_options:options.filter(o=>selectedSteps(m).includes(o.value))}}],'pci_work_areas_choose','Open selected areas')});
 });
 async function chooseAreas(body,client,m,viewId){
 const c=await ctx(body,m.pair);
 const options=availableSteps().map(step=>({text:plain(sections[step].label),value:step}));
 await client.views.update({view_id:viewId,view:modal('Choose areas',{...m,partner:c.pair.partner_name},[section('Conversation with '+c.pair.partner_name+'. Choose only the areas you need. Your draft stays private until you Send.'),{type:'input',block_id:'areas',label:plain('What would you like to include?'),element:{type:'checkboxes',action_id:'value',options}}],'pci_work_areas_choose','Start new conversation')});
 }
 action('pci_work_areas',async({body,client})=>{
 const opened=await client.views.open({trigger_id:body.trigger_id,view:loading()});const c=await ctx(body);
 if(!c.pairs.length)throw new Error('Your administrator needs to assign your working relationship.');
 await client.views.update({view_id:opened.view.id,view:modal('Choose a person',{type:'one_on_ones'},[{type:'input',block_id:'pair',label:plain('Who is this conversation with?'),element:{type:'static_select',action_id:'value',options:c.pairs.map(p=>({text:plain(p.partner_name||'Assigned colleague'),value:p.id}))}}],'pci_work_person','Choose areas')});
 });
 view('pci_work_person',async({ack,body,view,client})=>{const m=meta(view);m.pair=value(state(view,'pair'));if(!uuid.test(m.pair))return ack({response_action:'errors',errors:{pair:'Choose your colleague.'}});await ack({response_action:'update',view:loading()});await chooseAreas(body,client,m,view.id);});
 action('pci_work_response_review',async({body,action,client})=>{const opened=await client.views.open({trigger_id:body.trigger_id,view:loading()});const m=JSON.parse(action.value),c=await ctx(body,m.pair),e=await entry(c,m);if(e.author_id!==c.actor||e.state!=='draft'||!e.parent_id)throw new Error('Response is no longer a draft');await client.views.update({view_id:opened.view.id,view:reviewView({...m,revision:e.revision,parent:e.parent_id,role:c.role,partner:c.pair.partner_name,areas:Object.keys(e.content)},e,c.role)});});
 action('pci_work_home_history',async({body,client})=>{const opened=await client.views.open({trigger_id:body.trigger_id,view:loading()});const c=await ctx(body);if(c.pairs.length===1)return list(body,client,{type:'one_on_ones',pair:c.pairs[0].id},opened.view.id);await client.views.update({view_id:opened.view.id,view:modal('History',{},c.pairs.map(p=>actions(button(p.partner_name||'Colleague','pci_work_history',{type:'one_on_ones',pair:p.id}))))});});
 action('pci_work_fresh',async({body,client})=>{
   const opened=await client.views.open({trigger_id:body.trigger_id,view:loading()});
   const c=await ctx(body);
   const rows=await query(c,c.db.from('pci_entries').select('id,pair_id,revision').eq('author_id',c.actor).eq('entry_type','one_on_ones').eq('state','draft').eq('discarded',false).limit(100));
   const drafts=rows.filter(e=>c.pairs.some(p=>p.id===e.pair_id));
   await client.views.update({view_id:opened.view.id,view:modal('Start fresh',{drafts},[section('Move your unsent conversation drafts to Discarded drafts and clear the green Saved buttons. You can restore these drafts from conversation history. Submitted conversations and private manager notes are kept.')],'pci_work_fresh_confirm','Start fresh')});
 });
 view('pci_work_fresh_confirm',async({ack,body,view,client})=>{
   await ack({response_action:'update',view:loading()});const c=await ctx(body);
   for(const e of meta(view).drafts||[]){if(!c.pairs.some(p=>p.id===e.pair_id))throw new Error('Relationship no longer active');await query(c,c.db.rpc('pci_discard_entry',{p_id:e.id,p_expected:e.revision,p_restore:false}));}
   await client.views.update({view_id:view.id,view:notice('Ready for a fresh start. Your saved-area buttons are clear. Choose any area on Home to begin.')});
 });
 action('pci_work_home_submit',async({body,client})=>{
   const opened=await client.views.open({trigger_id:body.trigger_id,view:loading()});
   try{
     const c=await ctx(body);
     const rows=await query(c,c.db.from('pci_entries').select('*').eq('entry_type','one_on_ones').eq('author_id',c.actor).eq('state','draft').eq('discarded',false).eq('has_content',true).order('updated_at',{ascending:false}).limit(100));
     const drafts=rows.filter(e=>c.pairs.some(p=>p.id===e.pair_id));
     if(!drafts.length)return client.views.update({view_id:opened.view.id,view:notice('No saved conversation to submit yet. Choose one or more areas, enter your information, and save it first.')});
     if(drafts.length===1){const e=drafts[0],pair=c.pairs.find(p=>p.id===e.pair_id),role=pair.manager_id===c.actor?'manager':'employee';return client.views.update({view_id:opened.view.id,view:sectionMenu({aiEnabled:ai.enabled,type:'one_on_ones',pair:e.pair_id,id:e.id,revision:e.revision,role,partner:pair.partner_name,areas:Object.keys(e.content)},e)});}
     const blocks=[section('Choose the saved conversation to review. All its completed areas will be submitted together.')];
     for(const e of drafts.slice(0,20)){const pair=c.pairs.find(p=>p.id===e.pair_id),role=pair.manager_id===c.actor?'manager':'employee';blocks.push(section((pair.partner_name||'Assigned colleague')+' • '+new Date(e.updated_at).toLocaleDateString('en-US',{timeZone:'America/New_York'})),actions(button('Review all saved areas','pci_work_review',{type:'one_on_ones',pair:e.pair_id,id:e.id,revision:e.revision,role,areas:Object.keys(e.content)})));}
     await client.views.update({view_id:opened.view.id,view:modal('Submit saved conversation',{},blocks)});
   }catch(e){await fail(client,opened.view.id,e);}
 });
 for(const type of Object.keys(catalog))action('pci_feature_'+type,({body,client})=>openFeature(body,client,type));
 function view(id,fn){app.view(id,async a=>{
   if(team(a.body)!==teamId)return a.ack({response_action:'update',view:notice('Unauthorized workspace.')});
   let acknowledged=false;
   const ack=async payload=>{acknowledged=true;return a.ack(payload);};
   try{await fn({...a,ack});await publishHome?.(a.body,a.client).catch(()=>{});}catch(e){if(!acknowledged)await ack({response_action:'update',view:notice('Invalid form. Return to Home and try again.')});else await fail(a.client,a.view.id,e);}
 });}
 view('pci_work_areas_choose',async({ack,body,view,client})=>{
 const m=meta(view);const chosen=view.state?.values.areas?.value?.selected_options?.map(o=>o.value)||[];
 if(!chosen.length||chosen.some(step=>!stepsFor('one_on_ones').includes(step)))return ack({response_action:'errors',errors:{areas:'Choose at least one area.'}});
 m.areas=[...new Set(chosen)];m.savedStep=undefined;m.pair=m.pair||value(state(view,'pair'));
 if(!uuid.test(m.pair))return ack({response_action:'errors',errors:{pair:'Choose an assigned colleague.'}});
 await ack({response_action:'update',view:loading()});const c=await ctx(body,m.pair);if(m.id){const e=m.revision?await entry(c,m):{content:{}};m.step=selectedSteps(m)[0];await client.views.update({view_id:view.id,view:sectionForm(m,c.role,e.content[m.step],undefined,e.content)});}else await start(body,client,m,view.id);
 });
 view('pci_work_choose',async({ack,body,view,client})=>{
   const m=meta(view);m.pair=value(state(view,'pair'));
   if(!uuid.test(m.pair))return ack({response_action:'errors',errors:{pair:'Choose an assigned colleague.'}});
   await ack({response_action:'update',view:loading()});
   try{await start(body,client,m,view.id);}catch(e){await fail(client,view.id,e);}
 });
 view('pci_work_new',async({ack,body,view,client})=>{await ack({response_action:'update',view:loading()});try{await start(body,client,meta(view),view.id);}catch(e){await fail(client,view.id,e);}});
 for(const id of ['pci_work_previous','pci_work_next'])action(id,({body,action,client})=>list(body,client,JSON.parse(action.value),body.view.id));
 action('pci_work_records',({body,action,client})=>list(body,client,JSON.parse(action.value),body.view.id));
 action('pci_work_history',({body,action,client})=>list(body,client,JSON.parse(action.value),body.view.id));
 for(const restore of [false,true])action(restore?'pci_work_restore':'pci_work_discard',async({body,action,client})=>{
   const m=JSON.parse(action.value),c=await ctx(body,m.pair);
   const e=await entry(c,m);if(e.author_id!==c.actor||e.state!=='draft')throw new Error('Only your own draft can be discarded or restored.');
   await query(c,c.db.rpc('pci_discard_entry',{p_id:m.id,p_expected:m.revision,p_restore:restore}));
   await list(body,client,{type:m.type,pair:m.pair,page:0},body.view.id);
 });
 action('pci_work_category',async({body,client})=>{
   const m=meta(body.view),c=await ctx(body,m.pair);if(m.step!=='topics'||m.role!==c.role)throw new Error('Invalid form');
   const parsed=parseSection(m.step,c.role,body.view.state.values,Boolean(m.parent));
   const selected=parsed.fields.category==='Development'?'Learning & development':parsed.fields.category;
   const oldQuestion=questionOptions(c.role).find(o=>o.value===parsed.fields.suggestion);
   if(oldQuestion&&oldQuestion.category!==selected)parsed.fields.suggestion='';
   const content=m.revision?(await entry(c,m)).content:{};
   await client.views.update({view_id:body.view.id,view:sectionForm(m,c.role,parsed.fields,undefined,content)});
 });
 action('pci_work_open',async({body,action,client})=>{
   const m=JSON.parse(action.value),c=await ctx(body,m.pair),e=await entry(c,m);
   if(e.discarded)throw new Error('Restore this draft before opening it.');
   const next={...m,aiEnabled:ai.enabled,revision:e.revision,parent:e.parent_id,role:c.role};
   const authorRole=e.author_id===c.pair.manager_id?'manager':'employee';
   await client.views.update({view_id:body.view.id,view:e.state==='submitted'?reviewView(next,e,authorRole,true):sectionMenu(next,e)});
 });
 for(const step of Object.keys(sections))action('pci_work_step_'+step,async({body,action,client})=>{
   const m=JSON.parse(action.value),c=await ctx(body,m.pair),e=m.revision?await entry(c,m):{author_id:c.actor,state:'draft',content:{}};
   if(e.author_id!==c.actor||e.state!=='draft'||!selectedSteps(m).includes(m.step))throw new Error('This entry is read only.');
   await client.views.update({view_id:body.view.id,view:sectionForm({...m,revision:e.revision},c.role,e.content[m.step],undefined,e.content)});
 });
 for(const target of Object.keys(sections))action('pci_work_jump_'+target,async({body,action,client})=>{
   const m=JSON.parse(action.value),c=await ctx(body,m.pair);
   if(c.role!==m.role||!selectedSteps(m).includes(m.step)||!selectedSteps(m).includes(m.target))throw new Error('Invalid section');
   const parsed=parseSection(m.step,c.role,body.view.state.values,Boolean(m.parent));
   let content={};if(m.revision){const e=await entry(c,m);if(e.revision!==m.revision)throw new Error('Your draft changed. Reopen it.');content=e.content;}
   if(Object.keys(parsed.errors).length)return client.views.update({view_id:body.view.id,view:sectionForm(m,c.role,parsed.fields,'Check your selections and use valid dates and answers under 2,000 characters.',content)});
   let committed=false;
   try{
     const changed=hasContent(parsed.fields)||hasContent(content[m.step]);
     const e=changed?await save(c,m,{...content,[m.step]:parsed.fields}):{content,revision:m.revision};committed=changed;
     await client.views.update({view_id:body.view.id,view:sectionForm({...m,step:m.target,target:undefined,savedStep:changed?m.step:undefined,revision:e.revision},c.role,e.content[m.target],undefined,e.content)});
   }catch(e){await client.views.update({view_id:body.view.id,view:committed?notice('Saved. Reopen your draft from Home to continue.'):sectionForm(m,c.role,parsed.fields,'Save failed. Your entered information is preserved here. Reopen if a newer edit changed this draft.',content)});}
 });
 action('pci_work_menu',async({body,action,client})=>{const m=JSON.parse(action.value),c=await ctx(body,m.pair),e=await entry(c,m);await client.views.update({view_id:body.view.id,view:sectionMenu({...m,revision:e.revision,role:c.role},e)});});
 action('pci_work_review',async({body,action,client})=>{const m=JSON.parse(action.value),c=await ctx(body,m.pair),e=await entry(c,m);const review=reviewView({...m,revision:e.revision},e,c.role);if(body.view?.type==='home'||!body.view?.id)await client.views.open({trigger_id:body.trigger_id,view:review});else await client.views.update({view_id:body.view.id,view:review});});
 action('pci_work_finish',async({body,action,client})=>{
   const m=JSON.parse(action.value),c=await ctx(body,m.pair);
   if(sections[m.type]?.private||c.role!==m.role||!selectedSteps(m).includes(m.step))throw new Error('Invalid section');
   const parsed=parseSection(m.step,c.role,body.view.state.values,Boolean(m.parent));
   let e={content:{},revision:m.revision};
   if(m.revision){e=await entry(c,m);if(e.author_id!==c.actor||e.state!=='draft'||e.revision!==m.revision)throw new Error('Your draft changed. Reopen it.');}
   if(Object.keys(parsed.errors).length)return client.views.update({view_id:body.view.id,view:sectionForm(m,c.role,parsed.fields,'Check your selections and dates before submitting.',e.content)});
   const content={...e.content,[m.step]:parsed.fields};
   if(!Object.values(content).some(hasContent))return client.views.update({view_id:body.view.id,view:sectionForm(m,c.role,parsed.fields,'Add one topic, goal or answer before submitting. You do not need to complete the other sections.',e.content)});
   let committed=false;
   try{
     if(hasContent(parsed.fields)||hasContent(e.content[m.step])){e=await save(c,m,content);committed=true;}
     await client.views.update({view_id:body.view.id,view:reviewView({...m,revision:e.revision},e,c.role)});
   }catch(error){await client.views.update({view_id:body.view.id,view:committed?notice('Your draft is saved. Reopen it from Home to review and submit.'):sectionForm(m,c.role,parsed.fields,'Save failed. Your answers are preserved. Retry or reopen if the draft changed.',e.content)});}
 });
 action('pci_work_reply',async({body,action,client})=>{const m=JSON.parse(action.value),c=await ctx(body,m.pair),e=await entry(c,m);if(e.state!=='submitted')throw new Error('Submit first.');await start(body,client,{type:'one_on_ones',pair:m.pair,parent:e.id,areas:[...Object.keys(e.content).filter(k=>hasContent(e.content[k])&&k!=='feedback'),'feedback']},body.view.id);});
 view('pci_work_save',async({ack,body,view,client})=>{
   const m=meta(view);if(!selectedSteps(m).includes(m.step))return ack({response_action:'update',view:notice('Invalid section.')});
   const parsed=parseSection(m.step,m.role,view.state.values,Boolean(m.parent));
   if(Object.keys(parsed.errors).length)return ack({response_action:'errors',errors:parsed.errors});
   await ack({response_action:'update',view:notice('Saving this section…')});
   let committed=false;
   try{
     const c=await ctx(body,m.pair);if(c.role!==m.role)throw new Error('Role mismatch');
     let content={};if(m.revision){const e=await entry(c,m);if(e.revision!==m.revision)throw new Error('Your draft changed. Reopen it to avoid overwriting a newer edit.');content=e.content;}
     const changed=hasContent(parsed.fields)||hasContent(content[m.step]);
     const e=changed?await save(c,m,{...content,[m.step]:parsed.fields}):{content,revision:m.revision};committed=changed;
     const next=selectedSteps(m)[selectedSteps(m).indexOf(m.step)+1];
     const updated={...m,revision:e.revision,savedStep:changed?m.step:undefined,step:m.step};
     await client.views.update({view_id:view.id,view:sectionMenu({...updated,aiEnabled:ai.enabled},e)});
   }catch(e){await client.views.update({view_id:view.id,view:committed?notice('Saved. Reopen your draft from Home to continue.'):sectionForm(m,m.role,parsed.fields,'Save failed. Your entered information is preserved here. Retry, or reopen if another edit changed the draft.')});}
 });
 action('pci_work_notification',async({body,action,client})=>{
   const m=JSON.parse(action.value),opened=await client.views.open({trigger_id:body.trigger_id,view:loading()});
   try{const c=await ctx(body,m.pair),e=await entry(c,m);if(e.state!=='submitted'||e.discarded)throw new Error('Unavailable conversation');
   await client.views.update({view_id:opened.view.id,view:reviewView({...m,aiEnabled:ai.enabled,revision:e.revision,parent:e.parent_id,role:c.role},e,e.author_id===c.pair.manager_id?'manager':'employee',true)});
   }catch(e){await fail(client,opened.view.id,e);}
 });
 view('pci_work_submit',async({ack,body,view,client})=>{
   await ack({response_action:'update',view:notice('Submitting…')});const m=meta(view);
   let committed=false;
   try{const c=await ctx(body,m.pair),e=await entry(c,m);const saved=await save(c,m,Object.fromEntries(Object.entries(e.content).filter(([step])=>selectedSteps(m).includes(step))),true);committed=true;
   let notificationFailed=false;
   try{const recipient=await query(c,c.db.rpc('pci_notification_recipient',{p_id:saved.id,p_workspace:teamId}));
     if(!recipient)throw new Error('Recipient unavailable');
     await client.chat.postMessage({channel:recipient,text:'A new Performance Check-In entry is ready. Open it to view and respond.',blocks:[section('A new Performance Check-In entry is ready. Open it to view and respond.'),actions(button('View & respond','pci_work_notification',{id:saved.id,pair:m.pair,type:m.type}))]});
   }catch(error){notificationFailed=true;}
   const result=reviewView({...m,revision:saved.revision},saved,c.role,true);
   if(notificationFailed)result.blocks.unshift(section('Submitted and visible to your colleague in the app. The Slack notification could not be delivered; ask them to open Performance Check-In.'));
   await client.views.update({view_id:view.id,view:result});}catch(e){if(committed)await client.views.update({view_id:view.id,view:notice('Submitted successfully. Reopen this conversation from Home to view it.')});else await fail(client,view.id,e);}
 });

 action('pci_ai_consent',async({body,action,client})=>{
  if(!ai.enabled)throw new Error('AI unavailable');
  const m=JSON.parse(action.value),c=await ctx(body,m.pair),e=await entry(c,m);
  if(sections[m.type]?.private||e.discarded||(e.state==='draft'&&e.author_id!==c.actor))throw new Error('AI unavailable for this entry');
  const options=['questions','summary','actions'].map(k=>({text:plain({questions:'Question suggestions',summary:'Draft summary',actions:'Proposed follow-up actions'}[k]),value:k}));
  await client.views.update({view_id:body.view.id,view:modal('AI Assist',{...m,revision:e.revision},[section('Optional: send the shared fields of this saved entry to OpenAI to create a draft. Private manager notes and private review drafts are excluded. Avoid sensitive personal information. AI may make mistakes. Nothing is saved or sent until you edit and explicitly approve it. Close to cancel.'),{type:'input',block_id:'kind',label:plain('Assistance'),element:{type:'static_select',action_id:'value',options}},{type:'input',block_id:'consent',label:plain('Consent to generation'),element:{type:'checkboxes',action_id:'value',options:[{text:plain('I approve sending these shared fields to OpenAI'),value:'yes'}]}}],'pci_ai_generate','Generate draft')});
 });
 view('pci_ai_generate',async({ack,body,view,client})=>{
  const m=meta(view),kind=value(state(view,'kind'));
  if(!['questions','summary','actions'].includes(kind)||!state(view,'consent')?.selected_options?.some(o=>o.value==='yes'))return ack({response_action:'errors',errors:{consent:'Approve generation first.',kind:'Choose assistance.'}});
  await ack({response_action:'update',view:notice('Generating an AI draft…')});
  const c=await ctx(body,m.pair),e=await entry(c,m),key=teamId+':'+c.actor;
  if(!ai.enabled||sections[m.type]?.private||e.discarded||e.revision!==m.revision||(e.state==='draft'&&e.author_id!==c.actor)||aiBusy.has(key)||Date.now()-(aiLast.get(key)||0)<30000)throw new Error('AI request unavailable. Reopen the entry and try again later.');
  aiBusy.add(key);aiLast.set(key,Date.now());
  try{
   const text=await ai.generate(kind,e.content,e.author_id===c.pair.manager_id?'manager':'employee');
   const token=sign({actor:c.actor,pair:m.pair,source:{id:m.id,pair:m.pair,type:m.type,revision:m.revision},kind,expires:Date.now()+15*60000,id:randomUUID()});
   await client.views.update({view_id:view.id,view:modal('Review AI draft',{token,pair:m.pair},[section('AI-generated draft — check facts and edit freely. Approval saves a new private conversation draft with a source-entry reference. Sending requires the existing Review & submit step. Close to reject; this temporary suggestion expires in 15 minutes.'),{type:'input',block_id:'draft',label:plain('Edit the proposed content'),element:{type:'plain_text_input',action_id:'value',multiline:true,max_length:2000,initial_value:text}},{type:'input',block_id:'approval',label:plain('Human approval'),element:{type:'checkboxes',action_id:'value',options:[{text:plain('I reviewed this text and approve saving it as a private draft'),value:'yes'}]}}],'pci_ai_approve','Approve & save draft')});
  }finally{aiBusy.delete(key);}
 });
 view('pci_ai_approve',async({ack,body,view,client})=>{
  const m=meta(view),text=value(state(view,'draft')).trim();
  if(!text||text.length>2000||!state(view,'approval')?.selected_options?.some(o=>o.value==='yes'))return ack({response_action:'errors',errors:{approval:'Explicit approval is required.',draft:'Enter up to 2,000 characters.'}});
  await ack({response_action:'update',view:notice('Saving approved draft…')});
  const c=await ctx(body,m.pair),d=verify(m.token);
  if(!ai.enabled||!d||d.actor!==c.actor||d.pair!==m.pair||d.expires<Date.now())throw new Error('Suggestion expired. Generate a new draft.');
  const source=await entry(c,d.source);if(source.discarded||source.revision!==d.source.revision)throw new Error('Source changed. Generate a new draft.');
  const step={questions:'topics',summary:'wrap',actions:'actions'}[d.kind],field={questions:'other',summary:'discussed',actions:'details'}[d.kind];
  const next={id:d.id,pair:m.pair,type:'one_on_ones',role:c.role,aiEnabled:true,areas:[step],step};
  const e=await save(c,next,{[step]:{[field]:text,ai_origin:'AI-assisted; human reviewed',ai_source:source.id}});
  await client.views.update({view_id:view.id,view:sectionForm({...next,revision:e.revision},c.role,e.content[step],'Approved AI-assisted draft saved privately. Review and edit before sending.',e.content)});
 });
 return {openFeature};
}
