import schema from '../docs/backend-schema.json' with {type:'json'};
import {catalog,kind,title} from './catalog.js';
export const plain=text=>({type:'plain_text',text:String(text).slice(0,3000)});
export const section=text=>({type:'section',text:plain(text)});
export const button=(text,action_id,value)=>({type:'button',text:plain(text),action_id,value:JSON.stringify(value)});
const context=text=>({type:'context',elements:[plain(text)]});
const heading=text=>({type:'section',text:{type:'mrkdwn',text}});
const divider=()=>({type:'divider'});
const feature=t=>button(catalog[t].label,'pci_feature_'+t,{table:t});
const names={one_on_ones:'check-in',agenda_topics:'agenda topic',achievements:'achievement',feedback_requests:'feedback request',feedback:'feedback',performance_updates:'manager note',goals:'goal',development_plans:'development plan',career_conversations:'career conversation',actions:'follow-up action',review_prep_drafts:'review draft'};
const descriptions={
  one_on_ones:'Prepare a thoughtful 1:1, capture what matters, and agree on next steps.',
  agenda_topics:'Give your next conversation a clear focus.',
  achievements:'Keep a record of wins, contributions, and progress.',
  feedback_requests:'Make space for specific, useful feedback.',
  feedback:'Capture feedback you can return to and act on.',
  performance_updates:'Keep thoughtful notes on progress and support.',
  goals:'Turn priorities into clear goals and track your progress.',
  development_plans:'Make room for learning, growth, and new opportunities.',
  career_conversations:'Explore aspirations and agree on a path forward.',
  actions:'Keep the next steps from your conversations moving.',
  review_prep_drafts:'Gather your thoughts in a draft only you can see.'
};
const labels={focus:'What would you like to discuss?',scheduled_for:'When is your check-in?',discussed_summary:'What did you discuss?',agreed_summary:'What did you agree on?',revisit_summary:'What should you revisit?',start_feedback:'Start doing',stop_feedback:'Stop doing',continue_feedback:'Keep doing',follow_up_on:'Follow up on',why_it_matters:'Why does this matter?',owner_id:'Who owns this action?',due_date:'Due date',feedback_text:'Your feedback',prompt:'What feedback would you like?',update_text:'Your notes',draft_text:'Your review draft',plan_text:'Your plan',employee_notes:'Employee perspective',manager_notes:'Manager perspective',shared_summary:'Shared takeaways',progress_note:'Progress so far'};
const placeholders={title:'Give this a short, clear title',topic:'What would you like to talk about?',focus:'Priorities, progress, challenges, or support you need',details:'Add a little context',description:'What would success look like?',feedback_text:'Describe what happened and what would help',prompt:'Ask a specific question',draft_text:'Start with the contributions and growth you want to highlight',plan_text:'Outline the steps, support, and learning opportunities',agreed_summary:'Decisions, commitments, and next steps',why_it_matters:'What makes this worth discussing?'};
const statuses={preparing:'○ Preparing',in_progress:'◐ In progress',closed:'✓ Closed',open:'○ Open',answered:'✓ Answered',active:'● Active',completed:'✓ Completed',done:'✓ Done',paused:'Ⅱ Paused',cancelled:'— Cancelled',discussed:'✓ Discussed',follow_up:'↗ Follow up',parking_lot:'◇ Parking lot'};
function privacy(table) {const c=kind(table);return c.private?'🔒 Only you can see this draft.':c.managerOnly?'🔒 Only the manager can see these notes.':'🤝 Shared with the manager and employee in this relationship.';}
function dateLabel(row) {
  const value=row.due_date||row.target_date||row.scheduled_for||row.occurred_on||row.conversation_date;
  if(!value||!Number.isFinite(Date.parse(value)))return '';
  return new Date(value).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
}
const columns=table=>schema.tables.find(t=>t.name==='public.'+table).columns;
export function choices(table,field) {const c=columns(table).find(c=>c.name===field);return c.check ? [...c.check.matchAll(/'([^']+)'/g)].map(m=>m[1]):null;}
export function home(table='one_on_ones',rows=[],page=0,error,{isManager=false,overview=false,savedAreas=[],latestSubmission,hasDrafts=false,received=[],responseDraft,sendDraft}={}) {
  kind(table);
  if(overview){
   const blocks=[{type:'header',text:plain('Performance Check-In')},context('One conversation. Choose the areas you need, save a private draft, then send once.')];
   for(const e of received.slice(0,1))blocks.push(heading(isManager?'*Employee response*':'*Message from your manager*'),section((e.partner||'Your colleague')+(e.parent_id?' replied':' sent a conversation')),{type:'actions',elements:[button('Read & respond','pci_work_notification',{id:e.id,pair:e.pair_id,type:e.entry_type})]});
   blocks.push({type:'actions',elements:[button('New conversation','pci_work_areas',{}),button('History','pci_work_home_history',{})]});
   if(responseDraft)blocks.push(heading('*Response saved — not sent*'),{type:'actions',elements:[{...button('Send to '+(responseDraft.partner||'your manager'),'pci_work_response_review',{id:responseDraft.id,pair:responseDraft.pair_id,type:'one_on_ones'}),style:'primary'}]});
   else if(latestSubmission?.parent_id)blocks.push(section('✓ Response sent to '+(latestSubmission.partner||'your colleague')+'. View it in History.'));
   if(hasDrafts){blocks.push(heading('*Saved — not sent to '+(sendDraft?.partner||'your colleague')+' yet*'),context('Saved areas: '+savedAreas.map(a=>({topics:'Check-in',goals:'Goals & growth',prep:'Progress & support'}[a]||a.replaceAll('_',' '))).join(', ')),{type:'actions',elements:[{...button('Edit saved information','pci_work_home_submit',{}),style:'primary'},button('Start fresh','pci_work_fresh',{}),...(sendDraft?[{...button('Send to '+(sendDraft.partner||'your colleague'),'pci_work_review',sendDraft),style:'primary'}]:[])]});}
   if(hasDrafts)blocks.push({type:'actions',elements:[['topics','one_on_ones','Check-in'],['achievements','achievements','Achievements'],['goals','goals','Goals & growth'],['actions','actions','Follow-up actions']].map(([key,type,label])=>({...feature(type),text:plain(label+(savedAreas.includes(key)?' ✓ Saved':'')),...(savedAreas.includes(key)?{style:'primary'}:{})}))});
   if(isManager)blocks.push(heading('*Private manager notes*'),{type:'actions',elements:[feature('performance_updates')]});
   if(error)blocks.push(section(error));
   blocks.push({type:'actions',elements:[button('Policies & retention','pci_policies',{})]});return {type:'home',blocks};
  }
  const savedFeature=t=>{const saved=savedAreas.includes(t==='one_on_ones'?'topics':t)||t==='one_on_ones'&&savedAreas.some(a=>['prep','wrap'].includes(a));return saved?{...feature(t),text:plain(catalog[t].label+' ✓ Saved'),style:'primary'}:feature(t);};
  const blocks=[{type:'header',text:plain('Performance Check-In')},
    context('Choose a button below to view your records or start something new.'),
    {type:'actions',elements:[button('Choose one or more areas','pci_work_areas',{}),...(hasDrafts?[button('Start fresh','pci_work_fresh',{})]:[])]},
    divider(),heading('*Conversations*\nPrepare your 1:1, choose topics, and follow through.'),
    {type:'actions',elements:['one_on_ones','actions'].map(savedFeature)},
    heading('*Progress & growth*\nKeep achievements, goals, and development in view.'),
    {type:'actions',elements:['achievements','goals','development_plans','career_conversations'].map(savedFeature)},
    ...(isManager?[heading('*Feedback for the manager*\nInvite your employee to share feedback about your support.'),{type:'actions',elements:['feedback'].map(savedFeature)}]:[]),
    heading('*Your private drafts*\nPrepare for a review in a draft only you can see.'),
    {type:'actions',elements:[feature('review_prep_drafts')]},
    ...(isManager?[divider(),heading('*Manager workspace*\nYour private notes about employees. Only you can see these notes.'),{type:'actions',elements:[feature('performance_updates')]}]:[]),
    divider(),{...heading('*'+catalog[table].label+'*\n'+descriptions[table]),accessory:button('New '+names[table],'pci_new',{table})},
    divider()];
  if(overview&&received.length){const inbox=[heading(isManager?'*Responses from your employee*':'*Messages from your manager*')];for(const e of received){const when=new Date(e.submitted_at).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'});inbox.push(section((e.partner||'Assigned colleague')+(e.parent_id?' replied — ':' sent a conversation — ')+when),{type:'actions',elements:[{...button('View & respond','pci_work_notification',{id:e.id,pair:e.pair_id,type:e.entry_type}),style:'primary'}]});}blocks.splice(2,0,...inbox,divider());}
  if(overview){
    const start=blocks.findIndex(b=>b.accessory?.action_id==='pci_new');
    blocks.splice(start-1);
    if(error)blocks.push(section(error));
    if(latestSubmission?.submitted_at){const when=new Date(latestSubmission.submitted_at).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'});blocks.push(section('Last submitted conversation: sent to '+(latestSubmission.partner||(isManager?'employee':'manager'))+' — '+when),{type:'actions',elements:[button('View conversation','pci_work_notification',{id:latestSubmission.id,pair:latestSubmission.pair_id,type:latestSubmission.entry_type})]});}
    if(hasDrafts)blocks.push(heading('*Unsent drafts*'),section('Review your saved areas and send them together. Private notes stay private.'),{type:'actions',elements:[button('Review & submit unsent areas','pci_work_home_submit',{})]});
    blocks.push({type:'actions',elements:[button('Policies & retention','pci_policies',{})]});
    return {type:'home',blocks};
  }
  if(error) {
    blocks.push(heading('*Workspace setup*'),section(error));
  }
  else {
    if(!rows.length)blocks.push(heading(page?'*You’ve reached the end*':'*A fresh start*'),section(page?'Return to the previous page to see your records.':'Create your first '+names[table]+' when you’re ready. A few thoughtful words are a great place to begin.'));
    if(rows.length)blocks.push({type:'actions',elements:[button(Math.min(rows.length,10)+' saved • Page '+(page+1),'pci_page',{table,page})]});
    for(const row of rows.slice(0,10)) {
      blocks.push({type:'section',text:plain((row.title||row.focus||row.topic||row.prompt||row.feedback_text||row.update_text||row.shared_summary||row.draft_text||'Untitled '+names[table]).slice(0,250)),accessory:{...button('Saved — view / edit','pci_edit',{table,id:row.id}),style:'primary'}});
      blocks.push(context([statuses[row.status]||'Saved',dateLabel(row)].filter(Boolean).join('  •  ')));
      blocks.push(divider());
    }
    const elements=[];
    if(page>0)elements.push(button('Previous','pci_previous',{table,page:page-1}));
    if(rows.length>10)elements.push(button('Next','pci_next',{table,page:page+1}));
    if(elements.length)blocks.push({type:'actions',elements});
  }
  blocks.push(context(privacy(table)),{type:'actions',elements:[button('Policies & retention','pci_policies',{})]},context('Human-led conversations • AI assistance is unavailable'));
  return {type:'home',blocks};
}
export function loading() {return {type:'modal',title:plain('Performance Check-In'),close:plain('Close'),blocks:[section('Loading your permitted records…')]};}
export function recordsWindow(table,rows=[],page=0) {
  const blocks=home(table,rows,page).blocks;
  const start=blocks.findIndex(b=>b.accessory?.action_id==='pci_new');
  return {type:'modal',callback_id:'pci_continue',private_metadata:JSON.stringify({table}),title:plain(catalog[table].label.slice(0,24)),submit:plain('Continue'),close:plain('Back'),blocks:[section('Continue to start a new '+names[table]+', or select a saved entry below to view or edit it.'),...blocks.slice(start,-3)]};
}
export function savedNotice(table) {
  return {...notice('✓ Saved successfully. Your information is now stored.'),blocks:[section('✓ Saved successfully. Your information is now stored.'),{type:'actions',elements:[{...button('Saved — view records','pci_saved',{table,page:0}),style:'primary'}]}]};
}
export function form(table,meta,row={},error) {
  const c=kind(table),blocks=[heading('*'+(meta.expected?'Make room for the next step':'Start with what matters')+'*\n'+descriptions[table]),context(privacy(table)),divider()];
  if(error)blocks.push(section(error));
  if(!meta.expected) {
    blocks.push({type:'input',block_id:'pair',label:plain('Who is this for?'),hint:plain('Choose your manager or employee.'),element:{type:'external_select',action_id:'pci_pair',min_query_length:0,placeholder:plain('Choose a working relationship'),...(meta.pair?{initial_option:{text:plain('Previously selected relationship'),value:meta.pair}}:{})}});
    if(c.parent)blocks.push({type:'input',block_id:'parent',label:plain('1:1 check-in'),element:{type:'external_select',action_id:'pci_parent',min_query_length:0,placeholder:plain('Choose a check-in'),...(meta.parent?{initial_option:{text:plain('Previously selected check-in'),value:meta.parent}}:{})}});
  }
  for(const field of c.fields) {
    if(table==='one_on_ones'&&field==='discussed_summary')blocks.push(divider(),heading('*After your conversation*\nCapture the takeaways now, or come back to them later.'));
    const col=columns(table).find(x=>x.name===field), opts=choices(table,field);
    let element={type:'plain_text_input',action_id:'value',multiline:col.data_type==='text'&&!opts,max_length:field==='title'||field==='topic'?200:2000};
    if(opts)element={type:'static_select',action_id:'value',options:opts.map(value=>({text:plain(title(value)),value}))};
    if(col.data_type==='date')element={type:'datepicker',action_id:'value'};
    if(col.data_type==='timestamp with time zone')element={type:'datetimepicker',action_id:'value'};
    if(field==='owner_id')element={type:'static_select',action_id:'value',options:['manager','employee'].map(value=>({text:plain(title(value)),value}))};
    if(element.type==='plain_text_input') {
      element.multiline=!['title','topic','category'].includes(field);
      if(placeholders[field])element.placeholder=plain(placeholders[field]);
    }
    let value=row[field];
    if(element.type==='plain_text_input' && value && String(value).length>element.max_length)throw new Error('This record contains more text than the Slack editor supports. Edit it through an approved database interface to avoid losing content.');
    if(field==='owner_id'&&value&&!['manager','employee'].includes(value))value=value===row.manager_id?'manager':'employee';
    if(value!=null && value!=='') {
      if(element.type==='static_select')element.initial_option=element.options.find(o=>o.value===value);
      else if(element.type==='datepicker')element.initial_date=value;
      else if(element.type==='datetimepicker')element.initial_date_time=Math.floor(new Date(value).getTime()/1000);
      else element.initial_value=String(value).slice(0,element.max_length);
    }
    const optional=col.options.includes('nullable') || (!!col.default_value && field!=='status');
    blocks.push({type:'input',block_id:field,label:plain(labels[field]||title(field)),optional,element});
  }
  return {type:'modal',callback_id:'pci_save',private_metadata:JSON.stringify({table,...meta}),title:plain(((meta.expected?'Edit ':'New ')+names[table]).slice(0,24)),submit:plain('Save'),close:plain('Cancel'),blocks};
}
export function notice(text) {return {type:'modal',title:plain('Performance Check-In'),close:plain('Close'),blocks:[section(text)]};}
export function parseFields(table,values) {
  const fields={},errors={};
  for(const field of kind(table).fields) {
    const col=columns(table).find(x=>x.name===field), state=values[field]?.value||{};
    let value=state.selected_option?.value ?? state.selected_date ?? (state.selected_date_time!=null?new Date(state.selected_date_time*1000).toISOString():state.value);
    if(typeof value==='string')value=value.trim();
    if(value==null||value==='') {
      if(!col.options.includes('nullable')&&!col.default_value)errors[field]='This field is required.';
      else if(col.options.includes('nullable'))fields[field]=null;
      continue;
    }
    const opts=field==='owner_id'?['manager','employee']:choices(table,field);
    if(opts&&!opts.includes(value))errors[field]='Choose a valid option.';
    else if(typeof value!=='string'||value.length>(field==='title'||field==='topic'?200:2000))errors[field]='This value is too long or invalid.';
    else if(col.data_type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))errors[field]='Choose a valid date.';
    else fields[field]=value;
  }
  return {fields,errors};
}
