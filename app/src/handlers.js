import {createAI} from './ai.js';
import {randomUUID} from 'node:crypto';
import {catalog,kind,uuid} from './catalog.js';
import {Store} from './store.js';
import {home,loading,form,notice,plain,parseFields,recordsWindow,savedNotice} from './views.js';
import {UserError,userMessage} from './errors.js';
import {registerConversations} from './conversations.js';
export function register(app,sessions,teamId,env=process.env) {
  const contexts=new Map();
  const contextKey=b=>b.team_id||b.team?.id;
  const userId=b=>b.user_id||b.user?.id||b.user;
  async function store(body) {
    const team=contextKey(body),user=userId(body);
    if(team!==teamId || typeof user!=='string')throw new Error('This workspace is not authorized.');
    const {client,actor}=await sessions.forUser(team,user);
    return new Store(client,actor);
  }
  function log(logger,error) {logger?.error({event:'pci_request_failed',type:error?.name||'Error'});}
  async function publish(body,client,table='one_on_ones',page=0) {
    const s=await store(body),pairs=await s.pairs();
    const isManager=pairs.some(p=>p.manager_id===s.actor);
    if(kind(table).managerOnly&&!isManager)throw new UserError('Manager notes are available only to managers.');
    const rows=await s.list(table,page);
    const {data:drafts,error:draftError}=await s.client.from('pci_entries').select('id,pair_id,content,parent_id,revision').eq('author_id',s.actor).eq('entry_type','one_on_ones').eq('state','draft').eq('discarded',false).order('updated_at',{ascending:false}).limit(100);
    if(draftError)throw draftError;
    const responseDraft=(drafts||[]).find(d=>d.parent_id&&pairs.some(p=>p.id===d.pair_id));
    const responsePartner=responseDraft?pairs.find(p=>p.id===responseDraft.pair_id).partner_name:undefined;
    const conversationDraft=(drafts||[]).find(d=>!d.parent_id&&pairs.some(p=>p.id===d.pair_id));
    const draftPair=conversationDraft?pairs.find(p=>p.id===conversationDraft.pair_id):undefined;
    const sendDraft=conversationDraft?{id:conversationDraft.id,pair:conversationDraft.pair_id,type:'one_on_ones',revision:conversationDraft.revision,role:draftPair.manager_id===s.actor?'manager':'employee',partner:draftPair.partner_name,areas:Object.keys(conversationDraft.content||{})}:undefined;
    const savedAreas=[...new Set((drafts||[]).filter(d=>pairs.some(p=>p.id===d.pair_id)).flatMap(d=>Object.entries(d.content||{}).filter(([,v])=>Object.values(v||{}).some(x=>typeof x==='string'&&x.trim())).map(([k])=>k)))];
    const {data:submitted,error:submittedError}=await s.client.from('pci_entries').select('id,pair_id,entry_type,revision,submitted_at,parent_id').eq('author_id',s.actor).eq('entry_type','one_on_ones').eq('state','submitted').eq('discarded',false).order('submitted_at',{ascending:false}).limit(1);
    if(submittedError)throw submittedError;
    const latest=submitted?.find(e=>(!process.env.PCI_HOME_RESET_AT||e.submitted_at>=process.env.PCI_HOME_RESET_AT)&&pairs.some(p=>p.id===e.pair_id));
    const latestSubmission=latest?{...latest,partner:pairs.find(p=>p.id===latest.pair_id).partner_name}:undefined;
    const {data:incoming,error:incomingError}=await s.client.from('pci_entries').select('id,pair_id,entry_type,submitted_at,parent_id').neq('author_id',s.actor).eq('state','submitted').eq('discarded',false).order('submitted_at',{ascending:false}).limit(10);
    if(incomingError)throw incomingError;
    const received=(incoming||[]).filter(e=>(!process.env.PCI_HOME_RESET_AT||e.submitted_at>=process.env.PCI_HOME_RESET_AT)&&pairs.some(p=>p.id===e.pair_id)&&e.id!==latestSubmission?.parent_id).map(e=>({...e,partner:pairs.find(p=>p.id===e.pair_id).partner_name}));
    await client.views.publish({user_id:userId(body),view:home(table,rows,page,pairs.length?undefined:'Your administrator needs to set up your manager–employee relationship. You do not need a separate account login.',{isManager,overview:true,savedAreas,latestSubmission,hasDrafts:savedAreas.length>0,sendDraft,received,responseDraft:responseDraft?{...responseDraft,partner:responsePartner}:undefined})});
  }
  async function open(body,client,table,id) {
    kind(table);
    const opened=await client.views[body.view?.type==='modal'?'push':'open']({trigger_id:body.trigger_id,view:loading()});
    try {
      const s=await store(body);
      if(kind(table).managerOnly && !(await s.pairs()).some(p=>p.manager_id===s.actor))throw new UserError('Manager notes are available only to managers.');
      let row={},meta={id:randomUUID()};
      if(id) {
        row=await s.record(table,id);
        const pairs=await s.pairs();
        const pair=table==='agenda_topics'
          ? undefined : pairs.find(p=>p.manager_id===row.manager_id&&p.employee_id===row.employee_id);
        let actual=pair;
        if(table==='agenda_topics') {
          const parent=await s.record('one_on_ones',row.one_on_one_id);
          actual=pairs.find(p=>p.manager_id===parent.manager_id&&p.employee_id===parent.employee_id);
        }
        if(!actual)throw new Error('This working relationship is no longer active.');
        meta={id:row.id,pair:actual.id,parent:row.one_on_one_id,expected:row.updated_at};
      }
      await client.views.update({view_id:opened.view.id,view:form(table,meta,row)});
    } catch(error) {
      await client.views.update({view_id:opened.view.id,view:notice(userMessage(error))});
    }
  }
  async function browse(body,client,table,page=0) {
    kind(table);
    const opened=body.view?.type==='modal'?{view:body.view}:await client.views.open({trigger_id:body.trigger_id,view:loading()});
    try {
      const s=await store(body);
      if(kind(table).managerOnly&&!(await s.pairs()).some(p=>p.manager_id===s.actor))throw new UserError('Manager notes are available only to managers.');
      const rows=await s.list(table,page);
      await client.views.update({view_id:opened.view.id,view:recordsWindow(table,rows,page)});
    }catch(error){await client.views.update({view_id:opened.view.id,view:notice(userMessage(error))});}
  }
  function action(name,handler) {
    app.action(name,async args=>{
      await args.ack();
      try {
        if(contextKey(args.body)!==teamId)throw new Error('This workspace is not authorized.');
        await handler(args);
      } catch(error) {
        log(args.logger,error);
        if(contextKey(args.body)!==teamId)return;
        await args.client.views.publish({user_id:userId(args.body),view:home('one_on_ones',[],0,userMessage(error))}).catch(()=>log(args.logger,error));
      }
    });
  }
  app.event('app_home_opened',async ({body,event,client,logger})=>{
    if(event.tab!=='home')return;
    try {await publish({...body,user:event.user},client);}
    catch(error) {log(logger,error);if(contextKey(body)===teamId)await client.views.publish({user_id:event.user,view:home('one_on_ones',[],0,userMessage(error))});}
  });
  app.command('/checkin',async ({ack,body,client,logger})=>{
    await ack();
    try {if(body.team_id!==teamId)throw new Error('This workspace is not authorized.');await guided.openFeature(body,client,'one_on_ones');}
    catch(error){log(logger,error);if(body.team_id===teamId)await client.views.publish({user_id:body.user_id,view:home('one_on_ones',[],0,'The check-in could not open. Try again from the app Home tab.')}).catch(()=>log(logger,error));}
  });
  app.shortcut('pci_checkin',async ({ack,body,client,logger})=>{
    await ack();
    try {if(contextKey(body)!==teamId)throw new Error('This workspace is not authorized.');await guided.openFeature(body,client,'one_on_ones');}
    catch(error){log(logger,error);if(contextKey(body)===teamId)await client.views.publish({user_id:userId(body),view:home('one_on_ones',[],0,'The check-in could not open. Try again from the app Home tab.')}).catch(()=>log(logger,error));}
  });
  action('pci_category',({body,action,client})=>publish(body,client,action.selected_option.value));
  const guided=registerConversations(app,sessions,teamId,publish,createAI(env),env.SLACK_SIGNING_SECRET);
  for(const name of ['pci_page','pci_previous','pci_next','pci_saved'])action(name,({body,action,client})=>{const p=JSON.parse(action.value);return body.view?.type==='modal'?browse(body,client,p.table,p.page):publish(body,client,p.table,p.page);});
  action('pci_new',({body,action,client})=>open(body,client,JSON.parse(action.value).table));
  action('pci_edit',({body,action,client})=>{const p=JSON.parse(action.value);return open(body,client,p.table,p.id);});
  action('pci_policies',async ({body,client})=>{
    const opened=await client.views.open({trigger_id:body.trigger_id,view:loading()});
    try {
      const s=await store(body);
      const [policies,retention]=await Promise.all([s.governance(),s.retention()]);
      const text=[(createAI(env).enabled?'Optional AI Assist sends only allowlisted shared fields to OpenAI after explicit consent. Private notes are excluded. AI drafts require human approval to save, then review to send. Temporary suggestions expire in 15 minutes. Provider retention is governed by your OpenAI account policy.':'AI assistance is disabled. No AI output is generated or used.'),
        ...policies.map(p=>p.title+' ('+p.version+')\n'+p.policy_text),
        'Retention rules describe configured policy. Automated deletion is not enabled by this app.',
        ...retention.map(r=>r.data_type+': '+(r.retention_days??'indefinite')+' days; '+r.deletion_mode)];
      await client.views.update({view_id:opened.view.id,view:{...notice(''),blocks:text.flatMap(t=>{const parts=[];for(let i=0;i<t.length;i+=2800)parts.push({type:'section',text:plain(t.slice(i,i+2800))});return parts;}).slice(0,95)}});
    } catch(error){await client.views.update({view_id:opened.view.id,view:notice(userMessage(error))});}
  });
  for(const name of ['pci_pair','pci_parent']) app.options(name,async ({ack,body,options,logger})=>{
    try {
      const query=(options?.value||body.value||'').toLowerCase();
      let timer;
      try {
        const rows=await Promise.race([(async()=>{
          const s=await store(body);
          if(name==='pci_pair')return (await s.pairs()).filter(p=>!catalog[JSON.parse(body.view.private_metadata).table]?.managerOnly||p.manager_id===s.actor).map(p=>({text:plain(((p.manager_id===s.actor?'Employee: ':'Manager: ')+(p.partner_name||'Unnamed account')).slice(0,75)),value:p.id}));
          return (await s.searchCheckins(query)).map(p=>({text:plain((p.focus||'Check-in').slice(0,60)+(p.scheduled_for?' — '+new Date(p.scheduled_for).toLocaleDateString('en-US',{timeZone:'UTC'}):'')),value:p.id}));
        })(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Options timed out')),2200);})]);
        await ack({options:rows.filter(r=>r.text.text.toLowerCase().includes(query)).slice(0,100)});
      }finally{clearTimeout(timer);}
    }catch(error){log(logger,error);await ack({options:[]});}
  });
  app.view('pci_continue',async ({ack,body,view})=>{
    try {
      if(contextKey(body)!==teamId)throw new Error('Unauthorized workspace');
      const {table}=JSON.parse(view.private_metadata);kind(table);
      await ack({response_action:'update',view:form(table,{id:randomUUID()})});
    }catch(error){await ack({response_action:'update',view:notice('This form could not open. Return to Home and try again.')});}
  });
  app.view('pci_save',async ({ack,body,view,client,logger})=>{
    let meta,fields;
    try {
      meta=JSON.parse(view.private_metadata);kind(meta.table);
      const parsed=parseFields(meta.table,view.state.values);fields=parsed.fields;
      if(!meta.expected) {
        meta.pair=view.state.values.pair?.pci_pair?.selected_option?.value;
        meta.parent=view.state.values.parent?.pci_parent?.selected_option?.value;
        if(!uuid.test(meta.pair))parsed.errors.pair='Choose an active relationship.';
        if(catalog[meta.table].parent&&!uuid.test(meta.parent))parsed.errors.parent='Choose a check-in.';
      }
      if(Object.keys(parsed.errors).length)return ack({response_action:'errors',errors:parsed.errors});
      if(contextKey(body)!==teamId)throw new Error('This workspace is not authorized.');
    }catch(error){return ack({response_action:'update',view:notice('Invalid request. Close this window and try again.')});}
    // Acknowledge before network I/O; never tell the user "saved" before commit.
    await ack({response_action:'update',view:notice('Saving… Keep this window open until confirmation.')});
    const key=contextKey(body)+':'+userId(body)+':'+meta.id;
    let locked=false;
    let committed=false;
    try {
      if(contexts.has(key))throw new Error('This record is already being saved.');
      contexts.set(key,true);
      locked=true;
      const s=await store(body);
      await s.save(meta.table,meta,fields);
      committed=true;
      await client.views.update({view_id:view.id,view:savedNotice(meta.table)});
      await publish(body,client,meta.table);
    }catch(error) {
      log(logger,error);
      // A Slack delivery failure cannot undo a committed database transaction.
      if(committed) {
        await client.views.update({view_id:view.id,view:notice('Saved. Use Refresh on your Home tab to load the latest records.')}).catch(()=>log(logger,error));
        return;
      }
      const row={...fields};
      // Preserve the same UUID for retry so a committed create is not duplicated.
      const retry={...meta,expected:meta.expected};
      await client.views.update({view_id:view.id,view:form(meta.table,retry,row,'Save could not be confirmed. Reopen the record from Home to check it, or retry with the same values. A newer edit will never be overwritten.')}).catch(()=>log(logger,error));
    }finally{if(locked)contexts.delete(key);}
  });
  app.error(async error=>{console.error(JSON.stringify({event:'pci_framework_error',type:error?.code||'unknown'}));});
}
